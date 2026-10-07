"""bKash Tokenized Checkout: grant token -> create payment -> (payer approves) -> execute / query."""
from django.conf import settings
from django.core.cache import cache

import requests

from .base import TIMEOUT, Gateway, GatewayError, VerifyResult, money


class BkashGateway(Gateway):
    name = "bkash"
    label = "bKash"
    methods = ("bkash",)

    def enabled(self):
        return all([settings.BKASH_APP_KEY, settings.BKASH_APP_SECRET, settings.BKASH_USERNAME, settings.BKASH_PASSWORD])

    @property
    def base(self):
        return settings.BKASH_BASE_URL.rstrip("/")

    def _token(self):
        token = cache.get("bkash:id_token")
        if token:
            return token
        r = requests.post(
            f"{self.base}/tokenized/checkout/token/grant",
            json={"app_key": settings.BKASH_APP_KEY, "app_secret": settings.BKASH_APP_SECRET},
            headers={"username": settings.BKASH_USERNAME, "password": settings.BKASH_PASSWORD, "Accept": "application/json"},
            timeout=TIMEOUT,
        )
        data = self._json(r)
        token = data.get("id_token")
        if not token:
            raise GatewayError(data.get("statusMessage") or data.get("msg") or "bKash token grant failed")
        cache.set("bkash:id_token", token, int(data.get("expires_in", 3600)) - 120)
        return token

    def _headers(self):
        return {"Authorization": self._token(), "X-APP-Key": settings.BKASH_APP_KEY, "Accept": "application/json"}

    def start(self, deposit, return_url):
        r = requests.post(
            f"{self.base}/tokenized/checkout/create",
            json={
                "mode": "0011",
                "payerReference": str(deposit.user_id),
                "callbackURL": f"{settings.PUBLIC_BASE_URL}/api/wallet/callback/bkash/",
                "amount": f"{deposit.amount:.2f}",
                "currency": "BDT",
                "intent": "sale",
                "merchantInvoiceNumber": deposit.reference,
            },
            headers=self._headers(),
            timeout=TIMEOUT,
        )
        data = self._json(r)
        if not data.get("paymentID") or not data.get("bkashURL"):
            raise GatewayError(data.get("statusMessage") or "bKash could not create the payment")
        deposit.gateway_session = data["paymentID"]
        return data["bkashURL"]

    def _result(self, data, payment_id):
        if data.get("transactionStatus") == "Completed" and data.get("trxID"):
            return VerifyResult(
                ok=True, amount=money(data.get("amount")), gateway_ref=data["trxID"],
                invoice=data.get("merchantInvoiceNumber", ""), session=payment_id, raw=data,
            )
        return VerifyResult(ok=False, session=payment_id, error=data.get("statusMessage") or "Payment not completed", raw=data)

    def verify(self, data):
        payment_id = (data.get("paymentID") or "").strip()
        if not payment_id:
            return VerifyResult(ok=False, error="Missing paymentID")
        if data.get("status") != "success":
            return VerifyResult(ok=False, session=payment_id, error=f"Payment {data.get('status') or 'failed'}")
        r = requests.post(f"{self.base}/tokenized/checkout/execute", json={"paymentID": payment_id}, headers=self._headers(), timeout=TIMEOUT)
        res = self._result(self._json(r), payment_id)
        if res.ok:
            return res
        # Already executed (e.g. replayed callback) or a timeout — ask bKash for the final state.
        r = requests.post(f"{self.base}/tokenized/checkout/payment/status", json={"paymentID": payment_id}, headers=self._headers(), timeout=TIMEOUT)
        return self._result(self._json(r), payment_id)
