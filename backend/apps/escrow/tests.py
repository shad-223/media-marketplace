from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import OneTimeCode, User
from apps.market.models import Listing, Offer
from apps.wallet import ledger
from apps.wallet.models import Account, Entry, JournalTransaction

from .models import Order
from .services import release_due_orders

K = Account.Kind


def fund(user, amount):
    ledger.post(
        JournalTransaction.Kind.DEPOSIT, "test",
        [(ledger.system(K.GATEWAY), -Decimal(amount)), (ledger.account(user, K.AVAILABLE), Decimal(amount))],
    )


@override_settings(PAYMENTS_SANDBOX=True, OTP_ECHO=True, PLATFORM_FEE_PERCENT=Decimal("5"))
class EscrowFlowTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password="pw-12345678", kyc_status="verified")
        self.buyer = User.objects.create_user(email="b@x.com", username="buyer", password="pw-12345678")
        self.admin = User.objects.create_user(email="a@x.com", username="admin", password="pw-12345678", is_staff=True)
        self.listing = Listing.objects.create(
            seller=self.seller, category="youtube", title="Chan", description="d", price=Decimal("10000"),
            status=Listing.Status.APPROVED,
        )
        self.b, self.s, self.a = APIClient(), APIClient(), APIClient()
        self.b.force_authenticate(self.buyer)
        self.s.force_authenticate(self.seller)
        self.a.force_authenticate(self.admin)

    def assertLedgerBalanced(self):
        from django.db.models import Sum

        self.assertEqual(Entry.objects.aggregate(s=Sum("amount"))["s"] or 0, 0)

    def otp(self, client, purpose):
        return client.post("/api/auth/otp/", {"purpose": purpose}).data["dev_code"]

    def test_buy_without_funds_fails(self):
        r = self.b.post("/api/orders/", {"listing": self.listing.id})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Order.objects.exists())
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.APPROVED)

    def test_full_happy_path_with_protection_window(self):
        fund(self.buyer, 15000)
        r = self.b.post("/api/orders/", {"listing": self.listing.id})
        self.assertEqual(r.status_code, 201, r.data)
        oid = r.data["id"]
        self.assertEqual(ledger.balance(self.buyer), Decimal("5000"))
        self.assertEqual(ledger.balance(self.buyer, K.ESCROW), Decimal("10000"))
        # second buyer can't buy a reserved listing
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.RESERVED)
        # buyer cannot confirm before transfer; seller marks transfer
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "confirm", "otp": self.otp(self.b, "handover")}).status_code, 400)
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "transfer"}).status_code, 400)
        self.assertEqual(self.s.post(f"/api/orders/{oid}/action/", {"action": "transfer"}).status_code, 200)
        # wrong OTP rejected
        self.otp(self.b, "handover")
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "confirm", "otp": "000000x"}).status_code, 400)
        r = self.b.post(f"/api/orders/{oid}/action/", {"action": "confirm", "otp": self.otp(self.b, "handover")})
        self.assertEqual(r.data["status"], "protection")
        # still within 72h: nothing released
        self.assertEqual(release_due_orders(), 0)
        Order.objects.filter(pk=oid).update(release_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(release_due_orders(), 1)
        self.assertEqual(ledger.balance(self.seller), Decimal("9500"))
        self.assertEqual(ledger.system(K.PLATFORM_REVENUE).balance(), Decimal("500"))
        self.assertEqual(ledger.balance(self.buyer, K.ESCROW), 0)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.SOLD)
        self.assertLedgerBalanced()
        # review
        self.assertEqual(self.b.post(f"/api/orders/{oid}/action/", {"action": "review", "rating": 5}).status_code, 200)
        self.assertEqual(self.seller.rating()["average"], 5)

    def test_dispute_refund(self):
        fund(self.buyer, 10000)
        oid = self.b.post("/api/orders/", {"listing": self.listing.id}).data["id"]
        self.s.post(f"/api/orders/{oid}/action/", {"action": "transfer"})
        r = self.b.post(f"/api/orders/{oid}/action/", {"action": "dispute", "reason": "Seller recovered the channel"})
        self.assertEqual(r.data["status"], "disputed")
        # disputed orders are never auto-released
        Order.objects.filter(pk=oid).update(release_at=timezone.now() - timedelta(days=9))
        self.assertEqual(release_due_orders(), 0)
        # non-staff cannot resolve
        self.assertEqual(self.b.post(f"/api/admin/orders/{oid}/action/", {"action": "refund", "note": "x"}).status_code, 403)
        r = self.a.post(f"/api/admin/orders/{oid}/action/", {"action": "refund", "note": "Evidence supports buyer"})
        self.assertEqual(r.data["status"], "refunded")
        self.assertEqual(ledger.balance(self.buyer), Decimal("10000"))
        self.assertEqual(ledger.balance(self.seller), 0)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.APPROVED)
        self.assertLedgerBalanced()

    def test_offer_accept_then_pay_offer_price(self):
        fund(self.buyer, 10000)
        r = self.b.post("/api/offers/", {"listing": self.listing.id, "amount": "8000"})
        self.assertEqual(r.status_code, 201, r.data)
        offer_id = r.data["id"]
        # buyer cannot accept their own offer
        self.assertEqual(self.b.post(f"/api/offers/{offer_id}/", {"action": "accept"}).status_code, 403)
        self.assertEqual(self.s.post(f"/api/offers/{offer_id}/", {"action": "accept"}).status_code, 200)
        r = self.b.post("/api/orders/", {"listing": self.listing.id, "offer": offer_id})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data["amount"]), Decimal("8000"))
        self.assertEqual(Offer.objects.get(pk=offer_id).status, Offer.Status.PAID)

    def test_unverified_trade_limit(self):
        self.listing.price = Decimal("60000")
        self.listing.save()
        fund(self.buyer, 70000)
        with self.settings(UNVERIFIED_TRADE_LIMIT=Decimal("50000")):
            r = self.b.post("/api/orders/", {"listing": self.listing.id})
        self.assertEqual(r.status_code, 400)
        self.assertIn("KYC", str(r.data))

    def test_cannot_view_others_order(self):
        fund(self.buyer, 10000)
        oid = self.b.post("/api/orders/", {"listing": self.listing.id}).data["id"]
        stranger = User.objects.create_user(email="z@x.com", username="z", password="pw-12345678")
        c = APIClient()
        c.force_authenticate(stranger)
        self.assertEqual(c.get(f"/api/orders/{oid}/").status_code, 403)
        self.assertEqual(c.get(f"/api/orders/{oid}/messages/").status_code, 403)


@override_settings(PAYMENTS_SANDBOX=False, OTP_ECHO=True, MIN_WITHDRAWAL=Decimal("500"))
class WalletTests(TestCase):
    def setUp(self):
        self.u = User.objects.create_user(email="u@x.com", username="u", password="pw-12345678", kyc_status="verified")
        self.admin = User.objects.create_user(email="a@x.com", username="admin", password="pw-12345678", is_staff=True)
        self.c, self.a = APIClient(), APIClient()
        self.c.force_authenticate(self.u)
        self.a.force_authenticate(self.admin)

    def test_manual_deposit_then_withdraw_reject_and_pay(self):
        r = self.c.post("/api/wallet/deposits/", {"method": "bkash", "amount": "3000", "reference": "TRX1"})
        self.assertEqual(r.data["status"], "pending")
        self.assertEqual(self.c.post("/api/wallet/deposits/", {"method": "bkash", "amount": "3000", "reference": "TRX1"}).status_code, 400)
        self.a.post(f"/api/admin/deposits/{r.data['id']}/decide/", {"decision": "approve"})
        self.assertEqual(ledger.balance(self.u), Decimal("3000"))
        # withdrawal needs OTP
        body = {"method": "nagad", "amount": "1000", "account_number": "017", "account_name": "U"}
        self.assertEqual(self.c.post("/api/wallet/withdrawals/", body).status_code, 400)
        code = self.c.post("/api/auth/otp/", {"purpose": "withdraw"}).data["dev_code"]
        w = self.c.post("/api/wallet/withdrawals/", {**body, "otp": code})
        self.assertEqual(w.status_code, 201, w.data)
        self.assertEqual(ledger.balance(self.u), Decimal("2000"))
        # cannot overdraw
        code = self.c.post("/api/auth/otp/", {"purpose": "withdraw"}).data["dev_code"]
        self.assertEqual(self.c.post("/api/wallet/withdrawals/", {**body, "amount": "2500", "otp": code}).status_code, 400)
        self.a.post(f"/api/admin/withdrawals/{w.data['id']}/decide/", {"decision": "reject", "note": "wrong number"})
        self.assertEqual(ledger.balance(self.u), Decimal("3000"))
        self.assertTrue(self.a.get("/api/admin/ledger-check/").data["balanced"])
