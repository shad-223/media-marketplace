from decimal import Decimal

from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Notification, User
from apps.escrow.models import Order
from apps.escrow.services import open_order
from apps.market.models import Listing
from apps.wallet import ledger
from apps.wallet.models import Account, Entry, JournalTransaction

from .models import AdminAction, DeletionRequest, Report, Ticket

K = Account.Kind
PW = "pw-12345678"


def fund(user, amount):
    ledger.post(
        JournalTransaction.Kind.DEPOSIT, "test",
        [(ledger.system(K.GATEWAY), -Decimal(amount)), (ledger.account(user, K.AVAILABLE), Decimal(amount))],
    )


def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class Base(TestCase):
    def setUp(self):
        self.root = User.objects.create_superuser(email="root@x.com", username="root", password=PW)
        self.agent = User.objects.create_user(email="agent@x.com", username="agent", password=PW, is_staff=True)
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password=PW, kyc_status="verified")
        self.buyer = User.objects.create_user(email="b@x.com", username="buyer", password=PW)
        self.listing = Listing.objects.create(
            seller=self.seller, category="youtube", title="Chan", description="d", price=Decimal("10000"), status=Listing.Status.APPROVED,
        )
        self.r, self.a, self.s, self.b = client(self.root), client(self.agent), client(self.seller), client(self.buyer)

    def assertBalanced(self):
        self.assertEqual(Entry.objects.aggregate(t=Sum("amount"))["t"] or 0, 0)


class AuditTests(Base):
    def test_admin_decisions_are_audited(self):
        self.a.post(f"/api/admin/users/{self.buyer.id}/toggle/")
        self.a.post(f"/api/admin/listings/{self.listing.id}/decide/", {"decision": "reject", "note": "fake"})
        actions = set(AdminAction.objects.values_list("action", flat=True))
        self.assertIn("user.suspend", actions)
        self.assertIn("listing.reject", actions)
        row = AdminAction.objects.get(action="listing.reject")
        self.assertEqual(row.actor, self.agent)
        self.assertEqual(row.target_id, str(self.listing.id))
        self.assertEqual(self.a.get("/api/admin/audit/?action=user.suspend").data["results"][0]["actor"], "agent")
        self.assertEqual(self.b.get("/api/admin/audit/").status_code, 403)


class AdjustmentTests(Base):
    def test_superuser_only_balanced_and_never_negative(self):
        url = f"/api/admin/users/{self.buyer.id}/adjust/"
        self.assertEqual(self.a.post(url, {"amount": "500", "reason": "promo"}).status_code, 403)
        self.assertEqual(self.r.post(url, {"amount": "500"}).status_code, 400)  # reason required
        r = self.r.post(url, {"amount": "500", "reason": "promo credit"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(ledger.balance(self.buyer), Decimal("500"))
        self.assertEqual(self.r.post(url, {"amount": "-800", "reason": "chargeback"}).status_code, 400)
        self.assertEqual(ledger.balance(self.buyer), Decimal("500"))
        self.r.post(url, {"amount": "-200", "reason": "correction"})
        self.assertEqual(ledger.balance(self.buyer), Decimal("300"))
        self.assertBalanced()
        self.assertEqual(AdminAction.objects.filter(action="wallet.adjust").count(), 2)

    def test_temp_password_and_revoke_kyc(self):
        self.assertEqual(self.a.post(f"/api/admin/users/{self.buyer.id}/temp-password/").status_code, 403)
        temp = self.r.post(f"/api/admin/users/{self.buyer.id}/temp-password/").data["temporary_password"]
        self.buyer.refresh_from_db()
        self.assertTrue(self.buyer.check_password(temp))
        self.assertEqual(self.a.post(f"/api/admin/users/{self.seller.id}/revoke-kyc/", {}).status_code, 400)
        self.a.post(f"/api/admin/users/{self.seller.id}/revoke-kyc/", {"reason": "document expired"})
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.kyc_status, "none")
        self.assertEqual(len(self.a.get(f"/api/admin/users/{self.seller.id}/listings/").data), 1)


class ReportTests(Base):
    def test_report_flow_and_permissions(self):
        self.assertEqual(self.s.post("/api/reports/", {"listing": self.listing.id, "reason": "scam"}).status_code, 400)  # own listing
        r = self.b.post("/api/reports/", {"listing": self.listing.id, "reason": "fake_metrics", "details": "bought subs"})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.b.post("/api/reports/", {"listing": self.listing.id, "reason": "scam"}).status_code, 400)  # duplicate
        self.assertEqual(self.b.post("/api/reports/", {"user": "seller", "reason": "scam"}).status_code, 201)
        self.assertEqual(self.b.get("/api/admin/reports/").status_code, 403)
        self.assertEqual(len(self.a.get("/api/admin/reports/").data), 2)
        rid = Report.objects.get(listing=self.listing).id
        self.assertEqual(self.b.post(f"/api/admin/reports/{rid}/decide/", {"decision": "resolved"}).status_code, 403)
        self.a.post(f"/api/admin/reports/{rid}/decide/", {"decision": "resolved", "pause_listing": True, "note": "metrics fake"})
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.PAUSED)
        self.assertEqual(Report.objects.get(pk=rid).status, "resolved")


class BroadcastTests(Base):
    def test_audiences(self):
        fund(self.buyer, 20000)
        open_order(self.buyer, self.listing.id)
        counts = {aud: self.a.post("/api/admin/broadcast/", {"title": "Hi", "audience": aud, "dry_run": True}).data["recipients"] for aud in ("all", "verified", "sellers", "buyers")}
        self.assertEqual(counts, {"all": 4, "verified": 1, "sellers": 1, "buyers": 1})
        before = Notification.objects.count()
        self.assertEqual(self.a.post("/api/admin/broadcast/", {"title": "Eid offer", "audience": "all", "link": "/marketplace"}).data["recipients"], 4)
        self.assertEqual(Notification.objects.count() - before, 4)
        self.assertEqual(self.b.post("/api/admin/broadcast/", {"title": "x"}).status_code, 403)


class CsvTests(Base):
    def test_staff_only_and_content(self):
        self.assertEqual(self.b.get("/api/admin/export/users.csv").status_code, 403)
        r = self.a.get("/api/admin/export/users.csv")
        self.assertEqual(r.status_code, 200)
        body = b"".join(r.streaming_content).decode("utf-8-sig")
        self.assertIn("b@x.com", body)
        self.assertEqual(body.splitlines()[0].split(",")[0], "id")
        for kind in ("orders", "ledger", "withdrawals", "deposits"):
            self.assertEqual(self.a.get(f"/api/admin/export/{kind}.csv").status_code, 200)
        self.assertEqual(self.a.get("/api/admin/export/secrets.csv").status_code, 404)


class TicketTests(Base):
    def test_ticket_privacy_and_replies(self):
        t = self.b.post("/api/support/tickets/", {"subject": "Deposit missing", "category": "payment", "body": "TrxID 9X"})
        self.assertEqual(t.status_code, 201, t.data)
        tid = t.data["id"]
        self.assertEqual(self.s.get(f"/api/support/tickets/{tid}/").status_code, 403)
        self.assertEqual(self.s.post(f"/api/support/tickets/{tid}/reply/", {"body": "hi"}).status_code, 403)
        r = self.a.post(f"/api/support/tickets/{tid}/reply/", {"body": "Credited now."})
        self.assertEqual(r.data["status"], "answered")
        self.assertTrue(r.data["messages"][-1]["is_staff_reply"])
        self.assertEqual(self.b.post(f"/api/support/tickets/{tid}/reply/", {"body": "thanks"}).data["status"], "open")
        self.assertEqual(len(self.a.get("/api/admin/support/").data), 1)
        self.assertEqual(self.b.get("/api/admin/support/").status_code, 403)
        # a ticket can only link the user's own orders
        fund(self.seller, 0)
        other = User.objects.create_user(email="o@x.com", username="other", password=PW)
        fund(other, 20000)
        o = open_order(other, self.listing.id)
        self.assertEqual(self.b.post("/api/support/tickets/", {"subject": "x", "body": "y", "order": o.id}).status_code, 400)
        self.assertEqual(Ticket.objects.count(), 1)


class DeletionTests(Base):
    def test_blocked_with_balance_or_open_order_then_anonymised(self):
        fund(self.buyer, 20000)
        self.assertEqual(self.b.post("/api/me/delete-request/", {"password": "wrong"}).status_code, 400)
        r = self.b.post("/api/me/delete-request/", {"password": PW})
        self.assertEqual(r.status_code, 400)
        self.assertIn("balance", str(r.data))
        # spend it all into an open order -> still blocked (escrow + open order)
        self.listing.price = Decimal("20000")
        self.listing.save()
        o = open_order(self.buyer, self.listing.id)
        self.assertIn("open orders", str(self.b.post("/api/me/delete-request/", {"password": PW}).data))
        from apps.escrow.services import refund

        refund(o, self.agent, "test")
        # refund returns the money -> withdraw it away to reach zero
        ledger.post(JournalTransaction.Kind.ADJUSTMENT, "zero", [(ledger.account(self.buyer, K.AVAILABLE), Decimal("-20000")), (ledger.system(K.PLATFORM_ADJUSTMENTS), Decimal("20000"))])
        r = self.b.post("/api/me/delete-request/", {"password": PW, "reason": "leaving"})
        self.assertEqual(r.status_code, 201, r.data)
        req = DeletionRequest.objects.get()
        self.assertEqual(self.b.post(f"/api/admin/deletions/{req.id}/decide/", {"decision": "approve"}).status_code, 403)
        self.a.post(f"/api/admin/deletions/{req.id}/decide/", {"decision": "approve"})
        self.buyer.refresh_from_db()
        self.assertFalse(self.buyer.is_active)
        self.assertTrue(self.buyer.email.endswith("@deleted.invalid"))
        self.assertEqual(Order.objects.filter(pk=o.pk).count(), 1)  # trade history kept
        self.assertEqual(DeletionRequest.objects.get().original_email, "b@x.com")
        self.assertBalanced()


class FeatureTests(Base):
    def test_feature_toggle_staff_only(self):
        self.assertEqual(self.b.post(f"/api/admin/listings/{self.listing.id}/feature/", {"featured": True}, format="json").status_code, 403)
        r = self.a.post(f"/api/admin/listings/{self.listing.id}/feature/", {"featured": True}, format="json")
        has_field = any(f.name == "is_featured" for f in Listing._meta.get_fields())
        if has_field:
            self.assertEqual(r.status_code, 200)
            self.assertEqual(self.b.get("/api/listings/?featured=1").data["count"], 1)
        else:
            self.assertEqual(r.status_code, 400)
            self.assertEqual(self.b.get("/api/listings/?featured=1").data["count"], 0)
