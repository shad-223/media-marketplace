from django.conf import settings
from django.db import models

CATEGORIES = [
    # (value, label, group)
    ("youtube", "YouTube Channel", "social"),
    ("facebook", "Facebook Page / Group", "social"),
    ("instagram", "Instagram Account", "social"),
    ("tiktok", "TikTok Account", "social"),
    ("x", "X (Twitter) Account", "social"),
    ("telegram", "Telegram Channel / Group", "social"),
    ("website", "Website / Blog", "web"),
    ("app", "Mobile App", "web"),
    ("domain", "Domain", "web"),
    ("freefire", "Free Fire Account", "gaming"),
    ("pubg", "PUBG Account", "gaming"),
    ("saas", "SaaS Product", "services"),
    ("ecommerce", "E-commerce Store", "services"),
]
CATEGORY_CHOICES = [(v, label) for v, label, _ in CATEGORIES]
CATEGORY_GROUP = {v: g for v, _, g in CATEGORIES}


def new_verify_code():
    """Short code the seller places on the asset to prove control, e.g. MEDIA-7F3K9Q."""
    import secrets

    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
    return "MEDIA-" + "".join(secrets.choice(alphabet) for _ in range(6))


class Listing(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Live"
        REJECTED = "rejected", "Rejected"
        RESERVED = "reserved", "In escrow"
        SOLD = "sold", "Sold"
        PAUSED = "paused", "Paused"

    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="listings")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=140)
    description = models.TextField(max_length=5000)
    asset_url = models.URLField(blank=True)
    niche = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=60, blank=True)
    audience = models.PositiveBigIntegerField(default=0, help_text="Subscribers / followers / members")
    monthly_traffic = models.PositiveBigIntegerField(default=0)
    monthly_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    age_months = models.PositiveIntegerField(default=0)
    monetized = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    allow_offers = models.BooleanField(default=True)
    thumbnail = models.ImageField(upload_to="listings/", blank=True)
    proof_ref = models.CharField(max_length=300, blank=True)  # encrypted ownership / income proof
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    is_verified = models.BooleanField(default=False, help_text="Metrics verified by an admin")
    admin_note = models.CharField(max_length=300, blank=True)
    verify_code = models.CharField(max_length=20, default=new_verify_code, editable=False)
    ownership_checked_at = models.DateTimeField(null=True, blank=True)
    ownership_found = models.BooleanField(null=True, blank=True)
    views = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-approved_at", "-created_at"]
        indexes = [models.Index(fields=["status", "category"])]

    def __str__(self):
        return self.title

    @property
    def group(self):
        return CATEGORY_GROUP.get(self.category, "")


class Offer(models.Model):
    """A bid. Seller accepts -> buyer pays the offer amount into escrow."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"
        PAID = "paid", "Paid"
        COUNTERED = "countered", "Seller countered"

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="offers")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="offers")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    message = models.CharField(max_length=500, blank=True)
    counter_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    counter_message = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def agreed_amount(self):
        """Price the buyer pays once accepted: the seller's counter if the buyer took it."""
        return self.counter_amount or self.amount


class SavedListing(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved")
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="saved_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "listing")]
        ordering = ["-created_at"]


class Review(models.Model):
    order = models.ForeignKey("escrow.Order", on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_given")
    reviewee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_received")
    rating = models.PositiveSmallIntegerField()
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("order", "reviewer")]
        ordering = ["-created_at"]
