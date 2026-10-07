"""Nagad merchant checkout: initialize (RSA-encrypted + signed) -> complete -> callback -> verify API."""
import base64
import json
import secrets

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.utils import timezone

import requests

from .base import TIMEOUT, Gateway, GatewayError, VerifyResult, money


def _load_key(text, private):
    text = (text or "").strip().replace("\\n", "\n")
    if "BEGIN" not in text:
        kind = "PRIVATE KEY" if private else "PUBLIC KEY"
        body = "\n".join(text[i : i + 64] for i in range(0, len(text), 64))
        text = f"-----BEGIN {kind}-----\n{body}\n-----END {kind}-----"
    data = text.encode()
    return serialization.load_pem_private_key(data, None) if private else serialization.load_pem_public_key(data)


class NagadGateway(Gateway):
    name = "nagad"
    label = "Nagad"
    methods = ("nagad",)

    def enabled(self):
        return all([settings.NAGAD_MERCHANT_ID, settings.NAGAD_MERCHANT_PRIVATE_KEY, settings.NAGAD_PG_PUBLIC_KEY])

    @property
    def base(self):
        return settings.NAGAD_BASE_URL.rstrip("/")

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "X-KM-Api-Version": "v-0.2.0",
            "X-KM-IP-V4": settings.NAGAD_SERVER_IP,
            "X-KM-Client-Type": "PC_WEB",
        }

    def _encrypt(self, payload: dict) -> str:
        pub = _load_key(settings.NAGAD_PG_PUBLIC_KEY, private=False)
        return base64.b64encode(pub.encrypt(json.dumps(payload).encode(), padding.PKCS1v15())).decode()

    def _sign(self, payload: dict) -> str:
        key = _load_key(settings.NAGAD_MERCHANT_PRIVATE_KEY, private=True)
        return base64.b64encode(key.sign(json.dumps(payload).encode(), padding.PKCS1v15(), hashes.SHA256())).decode()

    def _decrypt(self, blob: str) -> dict:
        key = _load_key(settings.NAGAD_MERCHANT_PRIVATE_KEY, private=True)
        return json.loads(key.decrypt(base64.b64decode(blob), padding.PKCS1v15()))

    def _verify_signature(self, blob: str, signature: str) -> bool:
        pub = _load_key(settings.NAGAD_PG_PUBLIC_KEY, private=False)
        try:
            pub.verify(base64.b64decode(signature), blob.encode(), padding.PKCS1v15(), hashes.SHA256())
            return True
        except Exception:
            return False

    def start(self, deposit, return_url):
        mid = settings.NAGAD_MERCHANT_ID
        order_id = deposit.reference
        now = timezone.localtime().strftime("%Y%m%d%H%M%S")
        sensitive = {"merchantId": mid, "datetime": now, "orderId": order_id, "challenge": secrets.token_hex(20)}
        r = requests.post(
            f"{self.base}/api/dfs/check-out/initialize/{mid}/{order_id}?locale=EN",
            json={
                "accountNumber": settings.NAGAD_MERCHANT_NUMBER,
                "dateTime": now,
                "sensitiveData": self._encrypt(sensitive),
                "signature": self._sign(sensitive),
            },
            headers=self._headers(),
            timeout=TIMEOUT,
        )
        data = self._json(r)
        if not data.get("sensitiveData"):
            raise GatewayError(data.get("message") or "Nagad initialization failed")
        if not self._verify_signature(data["sensitiveData"], data.get("signature", "")):
            raise GatewayError("Nagad response signature is invalid")
        init = self._decrypt(data["sensitiveData"])
        ref = init.get("paymentReferenceId")
        order = {"merchantId": mid, "orderId": order_id, "currencyCode": "050", "amount": f"{deposit.amount:.2f}", "challenge": init.get("challenge")}
        r = requests.post(
            f"{self.base}/api/dfs/check-out/complete/{ref}",
            json={
                "sensitiveData": self._encrypt(order),
                "signature": self._sign(order),
                "merchantCallbackURL": f"{settings.PUBLIC_BASE_URL}/api/wallet/callback/nagad/",
                "additionalMerchantInfo": {"deposit": deposit.reference},
            },
            headers=self._headers(),
            timeout=TIMEOUT,
        )
        data = self._json(r)
        if data.get("status") != "Success" or not data.get("callBackUrl"):
            raise GatewayError(data.get("message") or "Nagad could not start the payment")
        deposit.gateway_session = ref or ""
        return data["callBackUrl"]

    def verify(self, data):
        ref = (data.get("payment_ref_id") or "").strip()
        if not ref:
            return VerifyResult(ok=False, invoice=data.get("order_id", ""), error="Missing payment_ref_id")
        r = requests.get(f"{self.base}/api/dfs/verify/payment/{ref}", headers=self._headers(), timeout=TIMEOUT)
        v = self._json(r)
        if v.get("status") == "Success":
            return VerifyResult(
                ok=True, amount=money(v.get("amount")), gateway_ref=v.get("issuerPaymentRefNo") or v.get("paymentRefId") or ref,
                invoice=v.get("orderId", ""), session=ref, raw=v,
            )
        return VerifyResult(ok=False, invoice=v.get("orderId") or data.get("order_id", ""), session=ref, error=v.get("message") or f"Nagad status {v.get('status')}", raw=v)
