from decimal import Decimal

from django.db.models import Sum
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import Notification, User
from apps.escrow.models import Order
from apps.market.models import Listing, Offer
from apps.wallet import ledger
from apps.wallet.models import Account, Entry, JournalTransaction

from .alerts import notify_matches
from .models import SavedSearch

K = Account.Kind


def fund(user, amount):
    ledger.post(
        JournalTransaction.Kind.DEPOSIT, "test",
        [(ledger.system(K.GATEWAY), -Decimal(amount)), (ledger.account(user, K.AVAILABLE), Decimal(amount))],
    )


@override_settings(OTP_ECHO=True)
class BuyerFeatureTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password="pw-12345678", kyc_status="verified")
        self.buyer = User.objects.create_user(email="b@x.com", username="buyer", password="pw-12345678")
        self.stranger = User.objects.create_user(email="z@x.com", username="stranger", password="pw-12345678")
        self.admin = User.objects.create_user(email="a@x.com", username="admin", password="pw-12345678", is_staff=True)
        self.listing = Listing.objects.create(
            seller=self.seller, category="youtube", title="Cooking channel", description="d", price=Decimal("10000"),
            status=Listing.Status.APPROVED, audience=50_000,
        )
        self.b, self.s, self.z, self.a = APIClient(), APIClient(), APIClient(), APIClient()
        for c, u in ((self.b, self.buyer), (self.s, self.seller), (self.z, self.stranger), (self.a, self.admin)):
            c.force_authenticate(u)

    # --- conversations -------------------------------------------------

    def test_conversation_privacy_and_flow(self):
        r = self.b.post("/api/inbox/", {"listing": self.listing.id, "body": "Is the channel still monetized?"})
        self.assertEqual(r.status_code, 201, r.data)
        cid = r.data["id"]
        # seller sees it with an unread message
        inbox = self.s.get("/api/inbox/").data
        self.assertEqual(inbox["unread"], 1)
        self.assertEqual(inbox["results"][0]["role"], "seller")
        self.assertTrue(Notification.objects.filter(user=self.seller, title__icontains="message").exists())
        # stranger can't read or post
        self.assertEqual(self.z.get(f"/api/inbox/{cid}/").status_code, 403)
        self.assertEqual(self.z.post(f"/api/inbox/{cid}/", {"body": "hi"}).status_code, 403)
        # seller reads (marks read) and replies
        msgs = self.s.get(f"/api/inbox/{cid}/").data["messages"]
        self.assertEqual(len(msgs), 1)
        self.assertEqual(self.s.get("/api/inbox/").data["unread"], 0)
        self.assertEqual(self.s.post(f"/api/inbox/{cid}/", {"body": "Yes, AdSense active."}).status_code, 201)
        self.assertEqual(self.b.get("/api/inbox/").data["unread"], 1)
        # starting again reuses the same conversation
        self.assertEqual(self.b.post("/api/inbox/", {"listing": self.listing.id}).data["id"], cid)

    def test_cannot_message_own_listing(self):
        r = self.s.post("/api/inbox/", {"listing": self.listing.id, "body": "hello me"})
        self.assertEqual(r.status_code, 400)

    # --- counter-offers ------------------------------------------------

    def test_counter_offer_accept_then_pay_counter_price(self):
        fund(self.buyer, 20000)
        oid = self.b.post("/api/offers/", {"listing": self.listing.id, "amount": "7000"}).data["id"]
        # buyer can't counter, counter must sit between offer and asking price
        self.assertEqual(self.b.post(f"/api/offers/{oid}/", {"action": "counter", "counter_amount": "8500"}).status_code, 403)
        self.assertEqual(self.s.post(f"/api/offers/{oid}/", {"action": "counter", "counter_amount": "6000"}).status_code, 400)
        r = self.s.post(f"/api/offers/{oid}/", {"action": "counter", "counter_amount": "8500"})
        self.assertEqual(r.data["status"], "countered")
        # seller can't accept their own counter
        self.assertEqual(self.s.post(f"/api/offers/{oid}/", {"action": "accept_counter"}).status_code, 403)
        self.assertEqual(self.b.post(f"/api/offers/{oid}/", {"action": "accept_counter"}).data["status"], "accepted")
        r = self.b.post("/api/orders/", {"listing": self.listing.id, "offer": oid})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data["amount"]), Decimal("8500"))
        self.assertEqual(ledger.balance(self.buyer, K.ESCROW), Decimal("8500"))

    def test_counter_decline(self):
        oid = self.b.post("/api/offers/", {"listing": self.listing.id, "amount": "7000"}).data["id"]
        self.s.post(f"/api/offers/{oid}/", {"action": "counter", "counter_amount": "9000"})
        self.assertEqual(self.b.post(f"/api/offers/{oid}/", {"action": "decline_counter"}).data["status"], "rejected")
        self.assertEqual(Offer.objects.get(pk=oid).agreed_amount, Decimal("7000"))

    # --- mutual cancellation -------------------------------------------

    def test_mutual_cancel_refunds_and_ledger_balanced(self):
        fund(self.buyer, 10000)
        oid = self.b.post("/api/orders/", {"listing": self.listing.id}).data["id"]
        r = self.b.post(f"/api/orders/{oid}/action/", {"action": "cancel_request", "reason": "Changed my mind, sorry"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["cancel_request"]["requested_by"], "buyer")
        # requester can't approve their own request; stranger can't touch it
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "cancel_accept"}).status_code, 400)
        self.assertEqual(self.z.post(f"/api/orders/{oid}/action/", {"action": "cancel_accept"}).status_code, 403)
        r = self.s.post(f"/api/orders/{oid}/action/", {"action": "cancel_accept"})
        self.assertEqual(r.data["status"], "refunded")
        self.assertEqual(ledger.balance(self.buyer), Decimal("10000"))
        self.assertEqual(ledger.balance(self.buyer, K.ESCROW), 0)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.APPROVED)
        self.assertEqual(Entry.objects.aggregate(s=Sum("amount"))["s"], 0)

    def test_cancel_declined_and_blocked_after_transfer(self):
        fund(self.buyer, 10000)
        oid = self.b.post("/api/orders/", {"listing": self.listing.id}).data["id"]
        self.s.post(f"/api/orders/{oid}/action/", {"action": "cancel_request", "reason": "Can't transfer yet"})
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "cancel_decline"}).data["cancel_request"], None)
        self.s.post(f"/api/orders/{oid}/action/", {"action": "transfer"})
        r = self.b.post(f"/api/orders/{oid}/action/", {"action": "cancel_request", "reason": "Too late now?"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Order.objects.get(pk=oid).status, Order.Status.TRANSFERRED)

    # --- saved searches -------------------------------------------------

    def test_saved_search_notifies_on_approval(self):
        r = self.b.post("/api/me/saved-searches/", {"name": "Cheap YouTube", "params": {"category": "youtube", "max_price": "20000"}}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.z.post("/api/me/saved-searches/", {"name": "Websites", "params": {"category": "website"}}, format="json")
        pending = Listing.objects.create(
            seller=self.seller, category="youtube", title="Gaming channel", description="d", price=Decimal("15000"),
            status=Listing.Status.PENDING,
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.a.post(f"/api/admin/listings/{pending.id}/decide/", {"decision": "approve"}).status_code, 200)
        self.assertTrue(Notification.objects.filter(user=self.buyer, title__icontains="Cheap YouTube").exists())
        self.assertFalse(Notification.objects.filter(user=self.stranger, title__icontains="New match").exists())
        # seller never alerted about own listing
        SavedSearch.objects.create(user=self.seller, name="mine", params={"category": "youtube"})
        self.assertEqual(notify_matches(pending), 1)

    def test_saved_search_validation_and_privacy(self):
        self.assertEqual(self.b.post("/api/me/saved-searches/", {"name": "x", "params": {}}, format="json").status_code, 400)
        sid = self.b.post("/api/me/saved-searches/", {"name": "x", "params": {"q": "tech"}}, format="json").data["id"]
        self.assertEqual(self.z.delete(f"/api/me/saved-searches/{sid}/").status_code, 404)
        self.assertEqual(self.b.delete(f"/api/me/saved-searches/{sid}/").status_code, 204)
