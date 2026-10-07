"""Demo data for local/test environments. Idempotent-ish: skips if the demo seller exists."""
import os
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.market.models import Listing, Review
from apps.wallet import ledger
from apps.wallet.models import Account, JournalTransaction

LISTINGS = [
    ("youtube", "Tech review channel — 248K subs, monetized", "Tech", 248_000, 0, 185_000, 38, True, 2_400_000),
    ("youtube", "Bangla cooking channel, evergreen recipes", "Food", 92_500, 0, 64_000, 26, True, 850_000),
    ("facebook", "Cricket fan page — 1.2M followers", "Sports", 1_200_000, 0, 90_000, 60, True, 1_500_000),
    ("facebook", "Dhaka buy & sell group (310K members)", "Marketplace", 310_000, 0, 25_000, 48, False, 420_000),
    ("instagram", "Minimal fashion IG, high engagement", "Fashion", 156_000, 0, 40_000, 30, True, 380_000),
    ("tiktok", "Comedy TikTok — 540K followers", "Entertainment", 540_000, 0, 18_000, 18, True, 290_000),
    ("x", "Crypto news X account, 74K", "Finance", 74_000, 0, 0, 40, False, 120_000),
    ("telegram", "Job circular Telegram channel (88K)", "Education", 88_000, 0, 30_000, 34, True, 260_000),
    ("website", "Tech blog, 120K monthly visitors, AdSense", "Tech", 0, 120_000, 75_000, 52, True, 1_100_000),
    ("app", "Android Quran app — 500K+ installs", "Lifestyle", 500_000, 210_000, 55_000, 44, True, 1_350_000),
    ("domain", "bdshop.com.bd premium domain", "E-commerce", 0, 0, 0, 96, False, 95_000),
    ("freefire", "Free Fire Grandmaster account, rare bundles", "Gaming", 0, 0, 0, 30, False, 18_000),
    ("pubg", "PUBG Conqueror account with Mythic outfits", "Gaming", 0, 0, 0, 36, False, 22_000),
    ("saas", "Invoice SaaS — 140 paying SMB customers", "B2B", 140, 9_000, 210_000, 28, True, 3_800_000),
    ("ecommerce", "Shopify gadget store, 900 orders/month", "Gadgets", 0, 45_000, 160_000, 22, True, 1_900_000),
]


class Command(BaseCommand):
    help = "Create demo admin, buyer, seller and marketplace listings."

    @transaction.atomic
    def handle(self, *args, **opts):
        pw = os.environ.get("DEMO_PASSWORD", "Media!2026Demo")
        admin, _ = User.objects.get_or_create(email="admin@media.test", defaults={"username": "escrow_admin", "is_staff": True, "is_superuser": True, "kyc_status": "verified"})
        admin.set_password(pw)
        admin.save()
        if User.objects.filter(email="seller@media.test").exists():
            self.stdout.write("demo data already present — admin password reset only")
            return
        seller = User.objects.create_user(email="seller@media.test", username="rahim_digital", password=pw, kyc_status="verified", bio="Selling digital assets since 2019.")
        buyer = User.objects.create_user(email="buyer@media.test", username="karim_buys", password=pw, bio="Investor in content businesses.")
        now = timezone.now()
        created = []
        for i, (cat, title, niche, aud, traffic, rev, age, mon, price) in enumerate(LISTINGS):
            created.append(
                Listing.objects.create(
                    seller=seller, category=cat, title=title, niche=niche, country="Bangladesh",
                    description=f"{title}. Organic audience, clean history, no strikes. Full ownership transfer "
                    "with original email + all admin access. Income proof provided to the Media escrow team.",
                    audience=aud, monthly_traffic=traffic, monthly_revenue=Decimal(rev), age_months=age,
                    monetized=mon, price=Decimal(price), status=Listing.Status.APPROVED,
                    is_verified=i % 3 != 2, approved_at=now - timedelta(hours=i * 5),
                )
            )
        for user, amount in ((buyer, Decimal("500000")), (seller, Decimal("25000"))):
            ledger.post(
                JournalTransaction.Kind.DEPOSIT, "Sandbox opening deposit (demo)",
                [(ledger.system(Account.Kind.GATEWAY), -amount), (ledger.account(user, Account.Kind.AVAILABLE), amount)],
            )
        # One completed trade so social proof / reviews aren't empty.
        from apps.escrow import services

        sold = Listing.objects.create(
            seller=seller, category="instagram", title="Travel photography IG (62K)", niche="Travel",
            description="Sold demo listing.", audience=62_000, monthly_revenue=Decimal(12000), age_months=20,
            price=Decimal("45000"), status=Listing.Status.APPROVED, is_verified=True, approved_at=now,
        )
        order = services.open_order(buyer, sold.pk)
        services.mark_transferred(order, seller)
        services.confirm_handover(order, buyer)
        services.release(order, by=admin, reason="demo")
        Review.objects.create(order=order, reviewer=buyer, reviewee=seller, rating=5, comment="Smooth handover, seller answered every question.")
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(created) + 1} listings. Logins (password {pw}): admin@media.test, seller@media.test, buyer@media.test"
        ))
