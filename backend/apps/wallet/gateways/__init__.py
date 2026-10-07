"""Payment gateway registry. A gateway is "online" only when its credentials are configured."""
from .base import Gateway, GatewayError, VerifyResult
from .bkash import BkashGateway
from .nagad import NagadGateway
from .sslcommerz import SslCommerzGateway
from .stripe import StripeGateway

GATEWAYS: dict[str, Gateway] = {g.name: g for g in (BkashGateway(), NagadGateway(), SslCommerzGateway(), StripeGateway())}

# Preferred gateway per deposit method (first enabled one wins).
ROUTES = {
    "bkash": ["bkash", "sslcommerz"],
    "nagad": ["nagad", "sslcommerz"],
    "rocket": ["sslcommerz"],
    "bank": ["sslcommerz"],
    "card": ["stripe", "sslcommerz"],
}


def for_method(method: str) -> Gateway | None:
    for name in ROUTES.get(method, []):
        gw = GATEWAYS[name]
        if gw.enabled():
            return gw
    return None


def get(name: str) -> Gateway | None:
    return GATEWAYS.get(name)


__all__ = ["GATEWAYS", "ROUTES", "Gateway", "GatewayError", "VerifyResult", "for_method", "get"]
