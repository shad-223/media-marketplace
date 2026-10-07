import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.escrow import services
from apps.wallet import ledger
from apps.wallet.models import Account, JournalTransaction, PayoutAccount

from .models import Listing, ListingImage, ListingView, Offer, SavedListing

TMP_MEDIA = tempfile.mkdtemp()


def png(name="a.png"):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def fund(user, amount):
    ledger.post(
        JournalTransaction.Kind.DEPOSIT, "test",
        [(ledger.system(Account.Kind.GATEWAY), -Decimal(amount)), (ledger.account(user, Account.Kind.AVAILABLE), Decimal(amount))],
    )


@override_settings(MEDIA_ROOT=TMP_MEDIA, PLATFORM_FEE_PERCENT=Decimal("5"))
class SellerToolsTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password="pw-12345678", kyc_status="verified")
        self.other = User.objects.create_user(email="o@x.com", username="other", password="pw-12345678", kyc_status="verified")
        self.buyer = User.objects.create_user(email="b@x.com", username="buyer", password="pw-12345678", kyc_status="verified")
        self.listing = Listing.objects.create(
            seller=self.seller, category="youtube", title="Chan", description="d", price=Decimal("10000"),
            status=Listing.Status.APPROVED,
        )
        self.s, self.o, self.b, self.anon = APIClient(), APIClient(), APIClient(), APIClient()
        self.s.force_authenticate(self.seller)
        self.o.force_authenticate(self.other)
        self.b.force_authenticate(self.buyer)

    # --- gallery -----------------------------------------------------------
    def test_gallery_upload_limit_and_public_detail(self):
        url = f"/api/me/listings/{self.listing.id}/images/"
        r = self.s.post(url, {"images": [png(f"{i}.png") for i in range(5)]}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data), 5)
        r = self.s.post(url, {"images": [png(f"x{i}.png") for i in range(4)]}, format="multipart")
        self.assertEqual(r.status_code, 400)  # 5 + 4 > 8
        self.assertEqual(ListingImage.objects.count(), 5)
        detail = self.anon.get(f"/api/listings/{self.listing.id}/").data
        self.assertEqual(len(detail["images"]), 5)
        self.assertTrue(detail["images"][0]["url"].startswith("/media/"))

    def test_gallery_rejects_non_image_and_non_owner(self):
        url = f"/api/me/listings/{self.listing.id}/images/"
        pdf = SimpleUploadedFile("a.pdf", b"%PDF-1.4", content_type="application/pdf")
        self.assertEqual(self.s.post(url, {"images": [pdf]}, format="multipart").status_code, 400)
        self.assertEqual(self.o.post(url, {"images": [png()]}, format="multipart").status_code, 403)
        img_id = self.s.post(url, {"images": [png()]}, format="multipart").data[0]["id"]
        self.assertEqual(self.o.delete(f"{url}{img_id}/").status_code, 403)
        self.assertEqual(self.s.delete(f"{url}{img_id}/").status_code, 204)

    def test_gallery_reorder(self):
        url = f"/api/me/listings/{self.listing.id}/images/"
        ids = [i["id"] for i in self.s.post(url, {"images": [png("1.png"), png("2.png"), png("3.png")]}, format="multipart").data]
        r = self.s.post(f"{url}reorder/", {"order": list(reversed(ids))}, format="json")
        self.assertEqual([i["id"] for i in r.data], list(reversed(ids)))
        self.assertEqual(self.s.post(f"{url}reorder/", {"order": ids[:2]}, format="json").status_code, 400)

    def test_gallery_locked_when_reserved(self):
        url = f"/api/me/listings/{self.listing.id}/images/"
        img_id = self.s.post(url, {"images": [png()]}, format="multipart").data[0]["id"]
        self.listing.status = Listing.Status.RESERVED
        self.listing.save()
        self.assertEqual(self.s.post(url, {"images": [png("b.png")]}, format="multipart").status_code, 400)
        self.assertEqual(self.s.delete(f"{url}{img_id}/").status_code, 400)

    # --- featured -------------------------------------------------------------
    def test_request_featured(self):
        url = f"/api/me/listings/{self.listing.id}/request-featured/"
        self.assertEqual(self.o.post(url).status_code, 403)
        r = self.s.post(url)
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.data["featured_requested_at"])
        self.assertEqual(self.s.post(url).status_code, 400)  # already requested
        self.listing.refresh_from_db()
        self.assertFalse(self.listing.is_featured)  # only admins can feature
        pending = Listing.objects.create(seller=self.seller, category="x", title="p", description="d", price=Decimal("500"))
        self.assertEqual(self.s.post(f"/api/me/listings/{pending.id}/request-featured/").status_code, 400)

    # --- analytics -------------------------------------------------------------
    def test_seller_stats_math(self):
        # 3 public views today + an older 40-day-old row outside the window
        for _ in range(3):
            self.anon.get(f"/api/listings/{self.listing.id}/")
        self.s.get(f"/api/listings/{self.listing.id}/")  # owner views don't count
        ListingView.objects.create(listing=self.listing, date=timezone.localdate() - timedelta(days=40), count=9)
        SavedListing.objects.create(user=self.buyer, listing=self.listing)
        Offer.objects.create(listing=self.listing, buyer=self.buyer, amount=Decimal("8000"))
        Offer.objects.create(listing=self.listing, buyer=self.other, amount=Decimal("9000"), status=Offer.Status.REJECTED)
        # one completed sale of another listing: 20000, 5% fee -> 19000 net
        sold = Listing.objects.create(seller=self.seller, category="website", title="Blog", description="d", price=Decimal("20000"), status=Listing.Status.APPROVED)
        fund(self.buyer, 20000)
        order = services.open_order(self.buyer, sold.pk)
        services.mark_transferred(order, self.seller)
        services.confirm_handover(order, self.buyer)
        services.release(order)

        d = self.s.get("/api/me/seller-stats/").data
        row = next(r for r in d["listings"] if r["id"] == self.listing.id)
        self.assertEqual(row["views"], 3)
        self.assertEqual(row["views_30d"], 3)
        self.assertEqual(row["series"][-1], 3)
        self.assertEqual(len(row["series"]), 30)
        self.assertEqual(row["saves"], 1)
        self.assertEqual(row["offers_total"], 2)
        self.assertEqual(row["offers_pending"], 1)
        self.assertEqual(Decimal(row["best_offer"]), Decimal("8000"))
        self.assertEqual(d["totals"]["sales"], 1)
        self.assertEqual(Decimal(d["totals"]["earned"]), Decimal("19000"))
        self.assertEqual(Decimal(d["earnings_by_month"][-1]["earned"]), Decimal("19000"))
        self.assertEqual(len(d["earnings_by_month"]), 12)
        # nothing leaks between sellers
        self.assertEqual(self.o.get("/api/me/seller-stats/").data["totals"]["listings"], 0)

    # --- CSV exports -------------------------------------------------------------
    def _csv(self, client, path):
        resp = client.get(path)
        self.assertEqual(resp.status_code, 200)
        return b"".join(resp.streaming_content).decode("utf-8-sig")

    def test_csv_exports_only_own_rows(self):
        other_listing = Listing.objects.create(seller=self.other, category="website", title="Other secret site", description="d", price=Decimal("5000"), status=Listing.Status.APPROVED)
        fund(self.buyer, 20000)
        services.open_order(self.buyer, self.listing.pk)
        services.open_order(self.buyer, other_listing.pk)
        sales = self._csv(self.s, "/api/me/export/sales.csv")
        self.assertIn("Chan", sales)
        self.assertNotIn("Other secret site", sales)
        fund(self.seller, 777)
        tx = self._csv(self.s, "/api/me/export/transactions.csv")
        self.assertIn("777", tx)
        self.assertNotIn("Other secret site", tx)  # buyer's escrow lock rows belong to the buyer
        self.assertEqual(self.anon.get("/api/me/export/sales.csv").status_code, 401)


class PayoutAccountTests(TestCase):
    def setUp(self):
        self.u = User.objects.create_user(email="u@x.com", username="u", password="pw-12345678")
        self.v = User.objects.create_user(email="v@x.com", username="v", password="pw-12345678")
        self.cu, self.cv = APIClient(), APIClient()
        self.cu.force_authenticate(self.u)
        self.cv.force_authenticate(self.v)

    def test_crud_default_and_privacy(self):
        a = self.cu.post("/api/wallet/payout-accounts/", {"method": "bkash", "account_number": "01711", "account_name": "U"}).data
        self.assertTrue(a["is_default"])  # first one becomes default
        b = self.cu.post("/api/wallet/payout-accounts/", {"method": "nagad", "account_number": "01822", "account_name": "U", "is_default": True}).data
        self.assertTrue(b["is_default"])
        self.assertFalse(PayoutAccount.objects.get(pk=a["id"]).is_default)
        # duplicate returns the existing one
        dup = self.cu.post("/api/wallet/payout-accounts/", {"method": "nagad", "account_number": "01822", "account_name": "U"})
        self.assertEqual(dup.data["id"], b["id"])
        # bank needs a bank name; card is not a payout method
        self.assertEqual(self.cu.post("/api/wallet/payout-accounts/", {"method": "bank", "account_number": "1", "account_name": "U"}).status_code, 400)
        self.assertEqual(self.cu.post("/api/wallet/payout-accounts/", {"method": "card", "account_number": "1", "account_name": "U"}).status_code, 400)
        # other users can't see, edit or delete them
        self.assertEqual(self.cv.get("/api/wallet/payout-accounts/").data, [])
        self.assertEqual(self.cv.patch(f"/api/wallet/payout-accounts/{a['id']}/", {"label": "x"}).status_code, 404)
        self.assertEqual(self.cv.delete(f"/api/wallet/payout-accounts/{a['id']}/").status_code, 404)
        # deleting the default promotes another
        self.assertEqual(self.cu.delete(f"/api/wallet/payout-accounts/{b['id']}/").status_code, 204)
        self.assertTrue(PayoutAccount.objects.get(pk=a["id"]).is_default)
