from decimal import Decimal

from asgiref.sync import sync_to_async
from channels.testing.websocket import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User, notify
from apps.escrow.models import Message, Order
from apps.market.models import Listing
from config.asgi import application

ORIGIN = [(b"origin", b"http://localhost")]
LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@override_settings(CHANNEL_LAYERS=LAYERS)
class RealtimeTests(TransactionTestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(email="b@x.com", username="buyer", password="pw-12345678")
        self.seller = User.objects.create_user(email="s@x.com", username="seller", password="pw-12345678")
        self.stranger = User.objects.create_user(email="z@x.com", username="z", password="pw-12345678")
        listing = Listing.objects.create(seller=self.seller, category="youtube", title="T", description="d", price=Decimal("1000"))
        self.order = Order.objects.create(listing=listing, buyer=self.buyer, seller=self.seller, amount=Decimal("1000"), fee=Decimal("50"))

    def ws(self, path, user=None):
        q = f"?token={AccessToken.for_user(user)}" if user else ""
        return WebsocketCommunicator(application, path + q, headers=ORIGIN)

    async def test_anonymous_and_stranger_rejected(self):
        c = self.ws(f"/ws/orders/{self.order.id}/")
        ok, code = await c.connect()
        self.assertFalse(ok)
        self.assertEqual(code, 4401)
        c = self.ws(f"/ws/orders/{self.order.id}/", self.stranger)
        ok, code = await c.connect()
        self.assertFalse(ok)
        self.assertEqual(code, 4403)

    async def test_participant_receives_message_event(self):
        c = self.ws(f"/ws/orders/{self.order.id}/", self.buyer)
        ok, _ = await c.connect()
        self.assertTrue(ok)
        msg = await sync_to_async(Message.objects.create)(order=self.order, sender=self.seller, body="here are the keys")
        event = await c.receive_json_from(timeout=3)
        self.assertEqual(event, {"event": "message", "id": msg.id})
        await c.disconnect()

    async def test_notifications_push_unread_count(self):
        c = self.ws("/ws/notifications/", self.seller)
        ok, _ = await c.connect()
        self.assertTrue(ok)
        self.assertEqual((await c.receive_json_from(timeout=3))["event"], "unread")
        await sync_to_async(notify)(self.seller, "New sale", "x", "/dashboard")
        event = await c.receive_json_from(timeout=3)
        self.assertEqual(event["event"], "notification")
        self.assertEqual(event["title"], "New sale")
        self.assertEqual(event["unread"], 1)
        await c.disconnect()
