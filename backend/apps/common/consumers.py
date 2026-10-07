from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from .realtime import order_group, user_group

UNAUTHORIZED = 4401
FORBIDDEN = 4403


@database_sync_to_async
def _user_from_token(token):
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    from apps.accounts.models import User

    try:
        uid = AccessToken(token)["user_id"]
    except (TokenError, KeyError):
        return AnonymousUser()
    return User.objects.filter(pk=uid, is_active=True).first() or AnonymousUser()


class JwtAuthMiddleware:
    """Browsers can't set headers on WebSockets, so the access token rides in ?token=."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = (parse_qs(scope.get("query_string", b"").decode()).get("token") or [""])[0]
        scope["user"] = await _user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)


class _PushConsumer(AsyncJsonWebsocketConsumer):
    group = None

    async def disconnect(self, code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def push(self, event):
        await self.send_json(event["payload"])


class OrderConsumer(_PushConsumer):
    """Escrow room: buyer, seller and staff only."""

    async def connect(self):
        user = self.scope["user"]
        if not user.is_authenticated:
            return await self.close(code=UNAUTHORIZED)
        order_id = self.scope["url_route"]["kwargs"]["order_id"]
        if not await self._can_join(user, order_id):
            return await self.close(code=FORBIDDEN)
        self.group = order_group(order_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    @database_sync_to_async
    def _can_join(self, user, order_id):
        from apps.escrow.models import Order

        o = Order.objects.filter(pk=order_id).values("buyer_id", "seller_id").first()
        return bool(o) and (user.is_staff or user.id in (o["buyer_id"], o["seller_id"]))


class NotificationConsumer(_PushConsumer):
    async def connect(self):
        user = self.scope["user"]
        if not user.is_authenticated:
            return await self.close(code=UNAUTHORIZED)
        self.group = user_group(user.id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "unread", "unread": await self._unread(user)})

    @database_sync_to_async
    def _unread(self, user):
        return user.notifications.filter(is_read=False).count()
