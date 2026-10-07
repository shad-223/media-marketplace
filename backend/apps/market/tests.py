import socket
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import Listing

PUBLIC_IP = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
PRIVATE_IP = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]


def fake_response(body, status=200, headers=None):
    r = mock.MagicMock()
    r.status_code = status
    r.headers = headers or {}
    r.encoding = "utf-8"
    r.iter_content.return_value = [body.encode()]
    return r


class OwnershipCheckTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password="pw-12345678")
        self.admin = User.objects.create_user(email="a@x.com", username="admin", password="pw-12345678", is_staff=True)
        self.listing = Listing.objects.create(
            seller=self.seller, category="website", title="Blog", description="d", price=Decimal("5000"),
            asset_url="https://example.com/", status=Listing.Status.APPROVED,
        )
        self.a = APIClient()
        self.a.force_authenticate(self.admin)
        self.url = f"/api/admin/listings/{self.listing.id}/check-ownership/"

    def test_codes_are_unique_and_hidden_from_public(self):
        other = Listing.objects.create(seller=self.seller, category="website", title="B2", description="d", price=Decimal("500"))
        self.assertRegex(self.listing.verify_code, r"^MEDIA-[A-Z2-9]{6}$")
        self.assertNotEqual(self.listing.verify_code, other.verify_code)
        self.assertNotIn("verify_code", APIClient().get(f"/api/listings/{self.listing.id}/").data)
        owner = APIClient()
        owner.force_authenticate(self.seller)
        self.assertEqual(owner.get(f"/api/listings/{self.listing.id}/").data["verify_code"], self.listing.verify_code)

    @mock.patch("apps.market.ownership.socket.getaddrinfo", return_value=PUBLIC_IP)
    @mock.patch("apps.market.ownership.requests.get")
    def test_code_found(self, get, _dns):
        get.return_value = fake_response(f"<footer>verify: {self.listing.verify_code.lower()}</footer>")
        r = self.a.post(self.url)
        self.assertTrue(r.data["found"])
        self.listing.refresh_from_db()
        self.assertTrue(self.listing.ownership_found)
        self.assertIsNotNone(self.listing.ownership_checked_at)
        self.assertTrue(APIClient().get(f"/api/listings/{self.listing.id}/").data["ownership_found"])

    @mock.patch("apps.market.ownership.socket.getaddrinfo", return_value=PUBLIC_IP)
    @mock.patch("apps.market.ownership.requests.get")
    def test_code_not_found(self, get, _dns):
        get.return_value = fake_response("<html>nothing here</html>")
        self.assertFalse(self.a.post(self.url).data["found"])
        self.listing.refresh_from_db()
        self.assertFalse(self.listing.ownership_found)

    @mock.patch("apps.market.ownership.socket.getaddrinfo", return_value=PRIVATE_IP)
    @mock.patch("apps.market.ownership.requests.get")
    def test_private_ip_blocked(self, get, _dns):
        r = self.a.post(self.url)
        self.assertIsNone(r.data["found"])
        self.assertIn("private", r.data["error"])
        get.assert_not_called()
        self.listing.refresh_from_db()
        self.assertIsNone(self.listing.ownership_found)

    @mock.patch("apps.market.ownership.socket.getaddrinfo", side_effect=[PUBLIC_IP, PRIVATE_IP])
    @mock.patch("apps.market.ownership.requests.get")
    def test_redirect_to_private_ip_blocked(self, get, _dns):
        get.return_value = fake_response("", status=302, headers={"Location": "http://internal.local/admin"})
        r = self.a.post(self.url)
        self.assertIsNone(r.data["found"])
        self.assertEqual(get.call_count, 1)

    def test_non_http_scheme_and_non_staff(self):
        Listing.objects.filter(pk=self.listing.pk).update(asset_url="file:///etc/passwd")
        self.assertIn("http", self.a.post(self.url).data["error"])
        seller = APIClient()
        seller.force_authenticate(self.seller)
        self.assertEqual(seller.post(self.url).status_code, 403)

    def test_seller_edit_resets_result(self):
        Listing.objects.filter(pk=self.listing.pk).update(ownership_found=True)
        seller = APIClient()
        seller.force_authenticate(self.seller)
        seller.patch(f"/api/me/listings/{self.listing.id}/", {"asset_url": "https://example.org/"}, format="json")
        self.listing.refresh_from_db()
        self.assertIsNone(self.listing.ownership_found)
