"""Stripe Checkout in USD. Credited from the signed `checkout.session.completed` webhook
(or by retrieving the session when the user returns first)."""
import hashlib
import hmac
import json
import time
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

import requests

from .base import TIMEOUT, Gateway, GatewayError, VerifyResult

API = "https://api.stripe.com/v1"
TOLERANCE = 300  # seconds


class StripeGateway(Gateway):
    name = "stripe"
    label = "Stripe (card, USD)"
    methods = ("card",)
    currency = "USD"

    def enabled(self):
        return bool(settings.STRIPE_SECRET_KEY)

    def gateway_amount(self, deposit):
        from apps.common.models import get_site_settings

        return (deposit.amount / get_site_settings().usd_rate).quantize(Decimal("0.01"), ROUND_HALF_UP)

    def _auth(self):
        return {"Authorization": f"Bearer {settings.STRIPE_SECRET_KEY}"}

    def start(self, deposit, return_url):
        usd = self.gateway_amount(deposit)
        if usd < Decimal("0.50"):
            raise GatewayError("Card payments must be at least $0.50.")
        r = requests.post(
            f"{API}/checkout/sessions",
            data={
                "mode": "payment",
                "line_items[0][quantity]": 1,
                "line_items[0][price_data][currency]": "usd",
                "line_items[0][price_data][unit_amount]": int(usd * 100),
                "line_items[0][price_data][product_data][name]": f"Media wallet top-up (৳{deposit.amount:,.2f})",
                "client_reference_id": deposit.reference,
                "metadata[deposit]": deposit.reference,
                "success_url": return_url,
                "cancel_url": return_url.replace("result=success", "result=cancelled"),
                "customer_email": deposit.user.email,
            },
            headers=self._auth(),
            timeout=TIMEOUT,
        )
        data = self._json(r)
        if not data.get("url"):
            raise GatewayError((data.get("error") or {}).get("message") or "Stripe could not create the checkout")
        deposit.gateway_session = data["id"]
        return data["url"]

    @staticmethod
    def signature_ok(payload: bytes, header: str) -> bool:
        parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
        sigs = [p.split("=", 1)[1] for p in (header or "").split(",") if p.startswith("v1=")]
        try:
            ts = int(parts.get("t", "0"))
        except ValueError:
            return False
        if not sigs or abs(time.time() - ts) > TOLERANCE or not settings.STRIPE_WEBHOOK_SECRET:
            return False
        expected = hmac.new(settings.STRIPE_WEBHOOK_SECRET.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(expected, s) for s in sigs)

    def _from_session(self, s):
        ref = s.get("client_reference_id") or (s.get("metadata") or {}).get("deposit", "")
        if s.get("payment_status") == "paid" and (s.get("currency") or "usd") == "usd":
            return VerifyResult(
                ok=True, amount=(Decimal(s.get("amount_total") or 0) / 100).quantize(Decimal("0.01")),
                gateway_ref=s.get("payment_intent") or s.get("id", ""), invoice=ref, session=s.get("id", ""), raw=s,
            )
        return VerifyResult(ok=False, invoice=ref, session=s.get("id", ""), error=f"Stripe payment {s.get('payment_status')}", final=s.get("status") == "expired")

    def verify(self, data):
        """data = {"payload": raw bytes, "signature": Stripe-Signature header}."""
        if not self.signature_ok(data.get("payload") or b"", data.get("signature") or ""):
            return VerifyResult(ok=False, error="Invalid Stripe signature", final=False)
        event = json.loads(data["payload"])
        if event.get("type") not in ("checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"):
            return VerifyResult(ok=False, error="ignored event", final=False)
        return self._from_session((event.get("data") or {}).get("object") or {})

    def refresh(self, deposit):
        if not deposit.gateway_session:
            return None
        r = requests.get(f"{API}/checkout/sessions/{deposit.gateway_session}", headers=self._auth(), timeout=TIMEOUT)
        return self._from_session(self._json(r))
