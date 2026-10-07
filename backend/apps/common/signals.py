"""Model hooks that fan changes out to WebSocket clients."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .realtime import broadcast, order_group, user_group


@receiver(post_save, sender="escrow.Message")
def message_created(sender, instance, created, **kwargs):
    if created:
        broadcast(order_group(instance.order_id), {"event": "message", "id": instance.id})


@receiver(post_save, sender="escrow.Order")
def order_changed(sender, instance, created, **kwargs):
    broadcast(order_group(instance.pk), {"event": "order", "status": instance.status})


@receiver(post_save, sender="accounts.Notification")
def notification_created(sender, instance, created, **kwargs):
    if not created:
        return
    from apps.accounts.models import Notification

    unread = Notification.objects.filter(user_id=instance.user_id, is_read=False).count()
    broadcast(
        user_group(instance.user_id),
        {"event": "notification", "title": instance.title, "body": instance.body, "link": instance.link, "unread": unread},
    )
