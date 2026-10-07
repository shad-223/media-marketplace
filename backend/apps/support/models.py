"""Admin audit trail, user reports, support tickets and account-deletion requests."""
from django.conf import settings
from django.db import models


class AdminAction(models.Model):
    """One row per admin decision. Written by apps.support.audit.log_admin — never edited."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=40, db_index=True)
    target_type = models.CharField(max_length=30, blank=True)
    target_id = models.CharField(max_length=40, blank=True)
    summary = models.CharField(max_length=300)
    data = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Report(models.Model):
    class Reason(models.TextChoices):
        SCAM = "scam", "Scam or fraud"
        FAKE_METRICS = "fake_metrics", "Fake or inflated metrics"
        STOLEN = "stolen", "Stolen / not the owner"
        INAPPROPRIATE = "inappropriate", "Inappropriate content"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports_made")
    listing = models.ForeignKey("market.Listing", null=True, blank=True, on_delete=models.CASCADE, related_name="reports")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="reports_received")
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.TextField(max_length=2000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    admin_note = models.CharField(max_length=500, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    handled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Ticket(models.Model):
    class Category(models.TextChoices):
        ACCOUNT = "account", "Account"
        PAYMENT = "payment", "Payment / wallet"
        ORDER = "order", "Order / escrow"
        LISTING = "listing", "Listing"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Waiting for support"
        ANSWERED = "answered", "Answered"
        CLOSED = "closed", "Closed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    subject = models.CharField(max_length=140)
    category = models.CharField(max_length=10, choices=Category.choices, default=Category.OTHER)
    order = models.ForeignKey("escrow.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    @property
    def code(self):
        return f"T-{self.pk:05d}"


class TicketMessage(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    is_staff_reply = models.BooleanField(default=False)
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class DeletionRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Account deleted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deletion_requests")
    reason = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    admin_note = models.CharField(max_length=500, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    original_email = models.EmailField(blank=True)  # kept for the records after anonymisation
    created_at = models.DateTimeField(auto_now_add=True)
    handled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
