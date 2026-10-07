"""Push events to WebSocket groups. Never breaks the request if the channel layer is down."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)


def order_group(order_id):
    return f"order_{order_id}"


def user_group(user_id):
    return f"user_{user_id}"


def broadcast(group, payload):
    """Send after the current transaction commits, so clients never refetch stale data."""

    def _send():
        try:
            layer = get_channel_layer()
            if layer is not None:
                async_to_sync(layer.group_send)(group, {"type": "push", "payload": payload})
        except Exception:  # Redis down etc. — clients fall back to polling.
            logger.warning("realtime broadcast to %s failed", group, exc_info=True)

    transaction.on_commit(_send)
