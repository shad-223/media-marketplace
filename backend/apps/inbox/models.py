from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """Pre-sale chat between a prospective buyer and the seller of one listing."""

    listing = models.ForeignKey("market.Listing", on_delete=models.CASCADE, related_name="conversations")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="buyer_conversations")
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="seller_conversations")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [models.UniqueConstraint(fields=["listing", "buyer"], name="uniq_conversation_listing_buyer")]

    def other(self, user):
        return self.seller if user.id == self.buyer_id else self.buyer


class ConversationMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    body = models.TextField(max_length=4000)
    attachment_ref = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class SavedSearch(models.Model):
    """Marketplace filters a buyer wants alerts for. params mirror the /api/listings/ query string."""

    KEYS = ("q", "category", "group", "min_price", "max_price", "min_audience", "verified", "monetized")

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_searches")
    name = models.CharField(max_length=80)
    params = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
