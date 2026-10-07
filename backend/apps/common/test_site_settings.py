from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.escrow.services import _fee, check_trade_limit

from .models import SiteSetting, get_site_settings


class SiteSettingsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="a@x.com", username="admin", password="pw-12345678", is_staff=True)
        self.user = User.objects.create_user(email="u@x.com", username="u", password="pw-12345678")
        self.a, self.u = APIClient(), APIClient()
        self.a.force_authenticate(self.admin)
        self.u.force_authenticate(self.user)

    def tearDown(self):
        cache.clear()  # the row is rolled back but the cached copy would otherwise leak into other tests

    @override_settings(PLATFORM_FEE_PERCENT=Decimal("7"), MIN_WITHDRAWAL=Decimal("900"))
    def test_defaults_come_from_env_when_no_row(self):
        s = get_site_settings()
        self.assertIsNone(s.pk)
        self.assertEqual(s.platform_fee_percent, Decimal("7"))
        self.assertEqual(_fee(Decimal("1000")), Decimal("70.00"))
        self.assertEqual(self.u.get("/api/config/").data["min_withdrawal"], "900")

    def test_admin_patch_changes_runtime_values(self):
        r = self.a.patch(
            "/api/admin/settings/",
            {"platform_fee_percent": "2.5", "unverified_trade_limit": "1000", "bkash_number": "01700000000", "announcement_enabled": False},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(SiteSetting.objects.count(), 1)
        self.assertEqual(_fee(Decimal("1000")), Decimal("25.00"))
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            check_trade_limit(self.user, Decimal("1500"))
        cfg = self.u.get("/api/config/").data
        self.assertEqual(cfg["platform_fee_percent"], "2.50")
        self.assertEqual(cfg["announcement"], "")
        self.assertEqual(cfg["deposit_methods"]["bkash"]["account"], "01700000000")
        # a second PATCH updates the same singleton row
        self.a.patch("/api/admin/settings/", {"announcement_enabled": True, "announcement_text": "Eid sale"}, format="json")
        self.assertEqual(SiteSetting.objects.count(), 1)
        self.assertEqual(self.u.get("/api/config/").data["announcement"], "Eid sale")

    def test_validation_ranges(self):
        for bad in ({"platform_fee_percent": "31"}, {"platform_fee_percent": "-1"}, {"buyer_protection_hours": 721}, {"usd_rate": "0"}):
            r = self.a.patch("/api/admin/settings/", bad, format="json")
            self.assertEqual(r.status_code, 400, bad)
        self.assertFalse(SiteSetting.objects.exists())

    def test_non_staff_forbidden(self):
        self.assertEqual(self.u.get("/api/admin/settings/").status_code, 403)
        self.assertEqual(self.u.patch("/api/admin/settings/", {"platform_fee_percent": "0"}, format="json").status_code, 403)
        self.assertEqual(APIClient().get("/api/admin/settings/").status_code, 401)
