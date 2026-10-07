import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_app = get_asgi_application()  # must load before anything imports models

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from django.urls import path  # noqa: E402

from apps.common.consumers import JwtAuthMiddleware, NotificationConsumer, OrderConsumer  # noqa: E402

websocket_urls = [
    path("ws/orders/<int:order_id>/", OrderConsumer.as_asgi()),
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_app,
        "websocket": AllowedHostsOriginValidator(JwtAuthMiddleware(URLRouter(websocket_urls))),
    }
)
