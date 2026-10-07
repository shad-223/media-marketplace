"""SSLCommerz (Rocket, bank/internet banking, local cards): session API + IPN hash + validation API."""
import hashlib

from django.conf import settings

import requests

from .base import TIMEOUT, Gateway, GatewayError, VerifyResult, money

# Narrow the hosted page to the method the user picked.
MULTI_CARD = {"rocket": "dbblmobilebanking", "bank": "internetbank", "card": "visacard,mastercard,amexcard"}


class SslCommerzGateway(Gateway):
    name = "sslcommerz"
    label = "SSLCommerz"
    methods = ("rocket", "bank", "card")

    def enabled(self):
        return bool(settings.SSLCZ_STORE_ID and settings.SSLCZ_STORE_PASSWD)

    @property
    def host(self):
        return "https://sandbox.sslcommerz.com" if settings.SSLCZ_SANDBOX else "https://securepay.sslcommerz.com"

    def start(self, deposit, return_url):
        cb = f"{settings.PUBLIC_BASE_URL}/api/wallet/callback/sslcommerz/"
        u = deposit.user
        r = requests.post(
            f"{self.host}/gwprocess/v4/api.php",
            data={
                "store_id": settings.SSLCZ_STORE_ID,
                "store_passwd": settings.SSLCZ_STORE_PASSWD,
                "total_amount": f"{deposit.amount:.2f}",
                "currency": "BDT",
                "tran_id": deposit.reference,
                "success_url": cb,
                "fail_url": cb,
                "cancel_url": cb,
                "ipn_url": f"{settings.PUBLIC_BASE_URL}/api/wallet/ipn/sslcommerz/",
                "multi_card_name": MULTI_CARD.get(deposit.method, ""),
                "cus_name": u.username,
                "cus_email": u.email,
                "cus_phone": u.phone or "01700000000",
                "cus_add1": "Dhaka",
                "cus_city": "Dhaka",
                "cus_country": "Bangladesh",
                "shipping_method": "NO",
                "num_of_item": 1,
                "product_name": "Media wallet top-up",
                "product_category": "Wallet",
                "product_profile": "non-physical-goods",
                "value_a": str(deposit.pk),
            },
            timeout=TIMEOUT,
        )
        data = self._json(r)
        if data.get("status") != "SUCCESS" or not data.get("GatewayPageURL"):
            raise GatewayError(data.get("failedreason") or "SSLCommerz could not start the payment")
        deposit.gateway_session = data.get("sessionkey", "")
        return data["GatewayPageURL"]

    @staticmethod
    def hash_ok(data: dict) -> bool:
        """IPN / redirect hash: md5 over the fields named in verify_key plus md5(store_passwd)."""
        keys = [k for k in (data.get("verify_key") or "").split(",") if k]
        sign = data.get("verify_sign") or ""
        if not keys or not sign:
            return False
        fields = {k: data.get(k, "") for k in keys}
        fields["store_passwd"] = hashlib.md5(settings.SSLCZ_STORE_PASSWD.encode()).hexdigest()
        raw = "&".join(f"{k}={fields[k]}" for k in sorted(fields))
        return hashlib.md5(raw.encode()).hexdigest() == sign

    def verify(self, data):
        tran_id = data.get("tran_id", "")
        status = (data.get("status") or "").upper()
        if status in ("FAILED", "CANCELLED", "UNATTEMPTED", "EXPIRED"):
            return VerifyResult(ok=False, invoice=tran_id, error=f"Payment {status.lower()}")
        if not self.hash_ok(data):
            return VerifyResult(ok=False, invoice=tran_id, error="Invalid SSLCommerz signature", final=False)
        val_id = data.get("val_id")
        if not val_id:
            return VerifyResult(ok=False, invoice=tran_id, error="Missing val_id", final=False)
        r = requests.get(
            f"{self.host}/validator/api/validationserverAPI.php",
            params={"val_id": val_id, "store_id": settings.SSLCZ_STORE_ID, "store_passwd": settings.SSLCZ_STORE_PASSWD, "format": "json"},
            timeout=TIMEOUT,
        )
        v = self._json(r)
        if v.get("status") in ("VALID", "VALIDATED") and v.get("currency_type", "BDT") == "BDT" and v.get("tran_id") == tran_id:
            return VerifyResult(ok=True, amount=money(v.get("amount")), gateway_ref=v.get("bank_tran_id") or val_id, invoice=tran_id, raw=v)
        return VerifyResult(ok=False, invoice=tran_id, error=f"SSLCommerz validation: {v.get('status') or 'invalid'}", raw=v)
