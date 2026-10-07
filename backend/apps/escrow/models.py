from django.conf import settings
from django.db import models


class Order(models.Model):
    """One escrow deal. Flow:
    IN_ESCROW (buyer paid) -> TRANSFERRED (seller handed over) -> PROTECTION (buyer confirmed,
    72h window) -> COMPLETED (funds released). DISPUTED can interrupt any open stage;
    REFUNDED returns the money to the buyer.
    """

    class Status(models.TextChoices):
        IN_ESCROW = "in_escrow", "Paid — awaiting transfer"
        TRANSFERRED = "transferred", "Transferred — awaiting buyer"
        PROTECTION = "protection", "Buyer protection window"
        DISPUTED = "disputed", "Disputed"
        COMPLETED = "completed", "Completed"
        REFUNDED = "refunded", "Refunded"

    OPEN = (Status.IN_ESCROW, Status.TRANSFERRED, Status.PROTECTION, Status.DISPUTED)

    listing = models.ForeignKey("market.Listing", on_delete=models.PROTECT, related_name="orders")
    offer = models.ForeignKey("market.Offer", null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchases")
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    fee = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_ESCROW)
    status_before_dispute = models.CharField(max_length=12, blank=True)
    transferred_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    release_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def seller_net(self):
        return self.amount - self.fee

    @property
    def code(self):
        return f"MD-{self.pk:06d}"


class Message(models.Model):
    """3-way escrow room: buyer + seller + admin. sender=None is a system event."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField(max_length=4000)
    attachment_ref = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Dispute(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"

    class Resolution(models.TextChoices):
        RELEASE = "release", "Released to seller"
        REFUND = "refund", "Refunded to buyer"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="disputes")
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    resolution = models.CharField(max_length=10, choices=Resolution.choices, blank=True)
    admin_note = models.CharField(max_length=500, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
