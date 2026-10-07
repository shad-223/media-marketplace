import io
from datetime import datetime, timezone as dt_tz
from decimal import Decimal

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.escrow.models import Order
from apps.market.models import Listing

from .models import OneTimeCode, User

PW = "pw-12345678"


@override_settings(OTP_ECHO=False, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetTests(TestCase):
    def setUp(self):
        cache.clear()  # throttles
        self.u = User.objects.create_user(email="r@x.com", username="r", password=PW)
        self.c = APIClient()

    def _code_from_mail(self):
        body = mail.outbox[-1].body
        return next(w for w in body.replace(".", " ").split() if w.isdigit() and len(w) == 6)

    def test_no_user_enumeration(self):
        known = self.c.post("/api/auth/password-reset/", {"email": "r@x.com"})
        unknown = self.c.post("/api/auth/password-reset/", {"email": "nobody@x.com"})
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.data, unknown.data)
        self.assertNotIn("dev_code", known.data)
        self.assertEqual(len(mail.outbox), 1)
        # confirm: unknown account and wrong code give the identical error
        bad_user = self.c.post("/api/auth/password-reset/confirm/", {"email": "nobody@x.com", "code": "123456", "new_password": "Brand-new-pass-1"})
        bad_code = self.c.post("/api/auth/password-reset/confirm/", {"email": "r@x.com", "code": "000000", "new_password": "Brand-new-pass-1"})
        self.assertEqual(bad_user.data, bad_code.data)
        # weak password is rejected the same way for unknown accounts (no existence signal)
        cache.clear()  # 5/min reset throttle would otherwise kick in here
        weak_known = self.c.post("/api/auth/password-reset/confirm/", {"email": "r@x.com", "code": "1", "new_password": "123"})
        weak_unknown = self.c.post("/api/auth/password-reset/confirm/", {"email": "zz@x.com", "code": "1", "new_password": "123"})
        self.assertEqual(weak_known.data, weak_unknown.data)

    def test_reset_works_once(self):
        self.c.post("/api/auth/password-reset/", {"email": "R@X.com"})
        code = self._code_from_mail()
        body = {"email": "r@x.com", "code": code, "new_password": "Brand-new-pass-1"}
        self.assertEqual(self.c.post("/api/auth/password-reset/confirm/", body).status_code, 200)
        self.u.refresh_from_db()
        self.assertTrue(self.u.check_password("Brand-new-pass-1"))
        # same code can't be reused
        body["new_password"] = "Another-pass-22"
        self.assertEqual(self.c.post("/api/auth/password-reset/confirm/", body).status_code, 400)
        self.u.refresh_from_db()
        self.assertTrue(self.u.check_password("Brand-new-pass-1"))

    def test_weak_password_does_not_burn_code(self):
        self.c.post("/api/auth/password-reset/", {"email": "r@x.com"})
        code = self._code_from_mail()
        self.assertEqual(self.c.post("/api/auth/password-reset/confirm/", {"email": "r@x.com", "code": code, "new_password": "123"}).status_code, 400)
        self.assertEqual(self.c.post("/api/auth/password-reset/confirm/", {"email": "r@x.com", "code": code, "new_password": "Brand-new-pass-1"}).status_code, 200)

    def test_reset_purpose_not_issuable_when_logged_in(self):
        self.c.force_authenticate(self.u)
        self.assertEqual(self.c.post("/api/auth/otp/", {"purpose": "reset"}).status_code, 400)


@override_settings(OTP_ECHO=True)
class EmailVerifyAvatarStaffTests(TestCase):
    def setUp(self):
        cache.clear()
        self.u = User.objects.create_user(email="v@x.com", username="v", password=PW)
        self.c = APIClient()
        self.c.force_authenticate(self.u)

    def test_verify_email(self):
        self.assertFalse(self.c.get("/api/me/").data["email_verified"])
        self.assertEqual(self.c.post("/api/me/verify-email/", {"otp": "000000"}).status_code, 400)
        code = self.c.post("/api/auth/otp/", {"purpose": "verify_email"}).data["dev_code"]
        r = self.c.post("/api/me/verify-email/", {"otp": code})
        self.assertTrue(r.data["email_verified"])
        self.assertEqual(self.c.post("/api/auth/otp/", {"purpose": "verify_email"}).status_code, 400)

    def test_avatar_upload_and_limits(self):
        buf = io.BytesIO()
        Image.new("RGB", (10, 10), "red").save(buf, "PNG")
        buf.name = "me.png"
        buf.seek(0)
        from django.core.files.uploadedfile import SimpleUploadedFile

        ok = self.c.post("/api/me/avatar/", {"avatar": SimpleUploadedFile("me.png", buf.getvalue(), "image/png")}, format="multipart")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertTrue(ok.data["avatar"])
        bad = self.c.post("/api/me/avatar/", {"avatar": SimpleUploadedFile("x.pdf", b"%PDF-1", "application/pdf")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
        self.assertIsNone(self.c.delete("/api/me/avatar/").data["avatar"])

    def test_staff_toggle_superuser_only(self):
        staff = User.objects.create_user(email="s@x.com", username="s", password=PW, is_staff=True)
        root = User.objects.create_superuser(email="root@x.com", username="root", password=PW)
        cs, cr = APIClient(), APIClient()
        cs.force_authenticate(staff)
        cr.force_authenticate(root)
        self.assertEqual(cs.post(f"/api/admin/users/{self.u.id}/staff/").status_code, 403)
        self.assertTrue(cr.post(f"/api/admin/users/{self.u.id}/staff/").data["is_staff"])
        self.assertEqual(cr.post(f"/api/admin/users/{root.id}/staff/").status_code, 400)
        d = cs.get(f"/api/admin/users/{self.u.id}/").data
        self.assertEqual(d["balances"]["available"], "0")
        self.assertEqual(self.c.get(f"/api/admin/users/{self.u.id}/").status_code, 403)


class LeaderboardAndSellerFilterTests(TestCase):
    def setUp(self):
        self.a = User.objects.create_user(email="a@x.com", username="alice", password=PW)
        self.b = User.objects.create_user(email="b@x.com", username="bob", password=PW)
        self.c3 = User.objects.create_user(email="c@x.com", username="carol", password=PW)

    def order(self, buyer, seller, amount, status, closed):
        l = Listing.objects.create(seller=seller, category="website", title="t", description="d", price=Decimal(amount), status=Listing.Status.SOLD)
        return Order.objects.create(listing=l, buyer=buyer, seller=seller, amount=Decimal(amount), fee=0, status=status, closed_at=closed)

    def test_leaderboard_math(self):
        oct_ = datetime(2026, 10, 5, 12, tzinfo=dt_tz.utc)
        self.order(self.a, self.b, "1000", Order.Status.COMPLETED, oct_)
        self.order(self.c3, self.b, "500", Order.Status.COMPLETED, oct_)
        self.order(self.a, self.c3, "9999", Order.Status.REFUNDED, oct_)  # excluded
        self.order(self.a, self.b, "7000", Order.Status.COMPLETED, datetime(2026, 9, 30, 12, tzinfo=dt_tz.utc))  # other month
        r = APIClient().get("/api/contest/leaderboard/?month=2026-10").data
        self.assertEqual(r["month"], "2026-10")
        rows = [(x["username"], x["volume"], x["trades"]) for x in r["results"]]
        self.assertEqual(rows, [("bob", "1500.00", 2), ("alice", "1000.00", 1), ("carol", "500.00", 1)])
        sep = APIClient().get("/api/contest/leaderboard/?month=2026-09").data["results"]
        self.assertEqual([(x["username"], x["volume"]) for x in sep], [("alice", "7000.00"), ("bob", "7000.00")])
        self.assertEqual(APIClient().get("/api/contest/leaderboard/?month=bad").status_code, 400)

    def test_seller_filter(self):
        Listing.objects.create(seller=self.a, category="youtube", title="A1", description="d", price=1000, status=Listing.Status.APPROVED)
        Listing.objects.create(seller=self.b, category="youtube", title="B1", description="d", price=1000, status=Listing.Status.APPROVED)
        Listing.objects.create(seller=self.a, category="youtube", title="A-pending", description="d", price=1000, status=Listing.Status.PENDING)
        r = APIClient().get("/api/listings/?seller=ALICE").data
        self.assertEqual([x["title"] for x in r["results"]], ["A1"])
        prof = APIClient().get("/api/users/ALICE/").data
        self.assertEqual((prof["username"], prof["reviews"], prof["avatar"]), ("alice", [], None))
        self.assertNotIn("email", prof)
