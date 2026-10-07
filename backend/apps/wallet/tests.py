"""Payment gateway tests. All gateway HTTP is mocked — no network."""
import base64
import hashlib
import hmac
import json
import time
from decimal import Decimal
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User

from . import ledger
from .models import Account, Deposit, Entry

K = Account.Kind


def resp(data, status=200):
    m = mock.MagicMock(status_code=status)
    m.json.return_value = data
    return m


def pem_pair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return priv, pub


BKASH = dict(BKASH_APP_KEY="k", BKASH_APP_SECRET="s", BKASH_USERNAME="u", BKASH_PASSWORD="p", BKASH_BASE_URL="https://bk.test")
SSLCZ = dict(SSLCZ_STORE_ID="store", SSLCZ_STORE_PASSWD="secretpw", SSLCZ_SANDBOX=True)
STRIPE = dict(STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET="whsec_x", USD_RATE=Decimal("120"))
NO_KEYS = dict(
    BKASH_APP_KEY="", NAGAD_MERCHANT_ID="", SSLCZ_STORE_ID="", SSLCZ_STORE_PASSWD="", STRIPE_SECRET_KEY="",
    PUBLIC_BASE_URL="https://media.test",
)


@override_settings(**NO_KEYS)
class GatewayTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="u@x.com", username="payer", password="pw-12345678")
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def balance(self):
        return ledger.balance(self.user, K.AVAILABLE)

    def assertBalanced(self):
        from django.db.models import Sum

        self.assertEqual(Entry.objects.aggregate(s=Sum("amount"))["s"] or 0, 0)

    def checkout(self, method, amount="1000"):
        r = self.c.post("/api/wallet/deposits/checkout/", {"method": method, "amount": amount}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return Deposit.objects.get(pk=r.data["deposit"]["id"]), r.data["redirect_url"]


class RegistryTests(GatewayTestBase):
    def test_everything_manual_without_keys(self):
        r = self.c.get("/api/wallet/gateways/")
        self.assertTrue(all(not m["online"] for m in r.data["methods"]))
        r = self.c.post("/api/wallet/deposits/checkout/", {"method": "bkash", "amount": "500"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Deposit.objects.exists())

    @override_settings(**SSLCZ)
    def test_sslcommerz_covers_rocket_bank_and_bkash_fallback(self):
        online = {m["method"]: m["gateway"] for m in self.c.get("/api/wallet/gateways/").data["methods"] if m["online"]}
        self.assertEqual(online, {"bkash": "sslcommerz", "nagad": "sslcommerz", "rocket": "sslcommerz", "bank": "sslcommerz", "card": "sslcommerz"})

    @override_settings(PAYMENTS_SANDBOX=True)
    def test_manual_sandbox_deposit_still_works(self):
        r = self.c.post("/api/wallet/deposits/", {"method": "bkash", "amount": "300", "reference": "TRXMANUAL"}, format="json")
        self.assertEqual(r.data["status"], "approved")
        self.assertEqual(self.balance(), Decimal("300"))


@override_settings(**BKASH)
class BkashTests(GatewayTestBase):
    def start(self):
        with mock.patch("apps.wallet.gateways.bkash.requests.post") as post:
            post.side_effect = [
                resp({"id_token": "tok", "expires_in": 3600}),
                resp({"paymentID": "PAY1", "bkashURL": "https://bk.test/pay/PAY1"}),
            ]
            dep, url = self.checkout("bkash", "1000")
        self.assertEqual(url, "https://bk.test/pay/PAY1")
        self.assertEqual(dep.status, "initiated")
        self.assertEqual(dep.gateway_session, "PAY1")
        return dep

    def callback(self, dep, execute, status="success"):
        with mock.patch("apps.wallet.gateways.bkash.requests.post") as post:
            post.side_effect = [resp(execute), resp(execute)]
            return self.client.get("/api/wallet/callback/bkash/", {"paymentID": "PAY1", "status": status})

    def test_success_credits_once_and_replay_is_ignored(self):
        dep = self.start()
        done = {"transactionStatus": "Completed", "trxID": "TRX9", "amount": "1000.00", "merchantInvoiceNumber": dep.reference, "paymentID": "PAY1"}
        r = self.callback(dep, done)
        self.assertEqual(r.status_code, 302)
        self.assertIn("result=success", r["Location"])
        self.assertEqual(self.balance(), Decimal("1000"))
        self.callback(dep, done)  # replay
        self.assertEqual(self.balance(), Decimal("1000"))
        dep.refresh_from_db()
        self.assertEqual((dep.status, dep.gateway_ref), ("approved", "TRX9"))
        self.assertBalanced()

    def test_amount_mismatch_rejected(self):
        dep = self.start()
        self.callback(dep, {"transactionStatus": "Completed", "trxID": "TRX9", "amount": "10.00", "merchantInvoiceNumber": dep.reference})
        dep.refresh_from_db()
        self.assertEqual(dep.status, "failed")
        self.assertEqual(self.balance(), 0)

    def test_unverified_success_claim_rejected(self):
        dep = self.start()
        r = self.callback(dep, {"statusCode": "2056", "statusMessage": "Invalid Payment State"})
        self.assertIn("result=failed", r["Location"])
        self.assertEqual(self.balance(), 0)

    def test_cancel_does_not_call_bkash(self):
        dep = self.start()
        with mock.patch("apps.wallet.gateways.bkash.requests.post") as post:
            self.client.get("/api/wallet/callback/bkash/", {"paymentID": "PAY1", "status": "cancel"})
            post.assert_not_called()
        dep.refresh_from_db()
        self.assertEqual(dep.status, "failed")


class NagadTests(GatewayTestBase):
    def setUp(self):
        super().setUp()
        self.m_priv, self.m_pub = pem_pair()
        self.pg_priv, self.pg_pub = pem_pair()
        self.cfg = override_settings(NAGAD_MERCHANT_ID="683002007104225", NAGAD_MERCHANT_NUMBER="01700000000", NAGAD_MERCHANT_PRIVATE_KEY=self.m_priv, NAGAD_PG_PUBLIC_KEY=self.pg_pub, NAGAD_BASE_URL="https://ng.test")
        self.cfg.enable()
        self.addCleanup(self.cfg.disable)

    def _pg_reply(self, payload):
        """What Nagad sends back: data encrypted to the merchant key, signed with the PG key."""
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        m_pub = serialization.load_pem_public_key(self.m_pub.encode())
        blob = base64.b64encode(m_pub.encrypt(json.dumps(payload).encode(), padding.PKCS1v15())).decode()
        pg_key = serialization.load_pem_private_key(self.pg_priv.encode(), None)
        sig = base64.b64encode(pg_key.sign(blob.encode(), padding.PKCS1v15(), hashes.SHA256())).decode()
        return blob, sig

    def start(self, tamper=False):
        blob, sig = self._pg_reply({"paymentReferenceId": "REF1", "challenge": "abc"})
        if tamper:
            sig = base64.b64encode(b"x" * 256).decode()
        with mock.patch("apps.wallet.gateways.nagad.requests.post") as post:
            post.side_effect = [resp({"sensitiveData": blob, "signature": sig}), resp({"status": "Success", "callBackUrl": "https://ng.test/pay/REF1"})]
            return self.c.post("/api/wallet/deposits/checkout/", {"method": "nagad", "amount": "750"}, format="json")

    def callback(self, verify):
        with mock.patch("apps.wallet.gateways.nagad.requests.get", return_value=resp(verify)):
            return self.client.get("/api/wallet/callback/nagad/", {"payment_ref_id": "REF1", "status": "Success", "order_id": "x"})

    def test_success_credits_once(self):
        r = self.start()
        self.assertEqual(r.status_code, 201, r.data)
        dep = Deposit.objects.get()
        ok = {"status": "Success", "amount": "750.00", "orderId": dep.reference, "issuerPaymentRefNo": "NG77"}
        self.assertIn("result=success", self.callback(ok)["Location"])
        self.callback(ok)
        self.assertEqual(self.balance(), Decimal("750"))
        self.assertBalanced()

    def test_bad_pg_signature_aborts_checkout(self):
        r = self.start(tamper=True)
        self.assertEqual(r.status_code, 502)
        self.assertEqual(Deposit.objects.get().status, "failed")

    def test_amount_mismatch_and_failed_status(self):
        self.start()
        dep = Deposit.objects.get()
        self.callback({"status": "Success", "amount": "75.00", "orderId": dep.reference, "issuerPaymentRefNo": "NG77"})
        self.assertEqual(self.balance(), 0)
        dep.refresh_from_db()
        self.assertEqual(dep.status, "failed")


@override_settings(**SSLCZ)
class SslCommerzTests(GatewayTestBase):
    def start(self):
        with mock.patch("apps.wallet.gateways.sslcommerz.requests.post", return_value=resp({"status": "SUCCESS", "GatewayPageURL": "https://ssl.test/x", "sessionkey": "S1"})) as post:
            dep, url = self.checkout("rocket", "2000")
        self.assertEqual(post.call_args.kwargs["data"]["multi_card_name"], "dbblmobilebanking")
        return dep

    def ipn(self, dep, amount="2000.00", sign=True):
        data = {"tran_id": dep.reference, "val_id": "VAL1", "amount": amount, "status": "VALID", "currency": "BDT"}
        data["verify_key"] = ",".join(sorted(data))
        fields = {k: data[k] for k in data["verify_key"].split(",")}
        fields["store_passwd"] = hashlib.md5(b"secretpw").hexdigest()
        data["verify_sign"] = hashlib.md5("&".join(f"{k}={fields[k]}" for k in sorted(fields)).encode()).hexdigest() if sign else "deadbeef"
        return data

    def post_ipn(self, data, validated_amount="2000.00"):
        v = {"status": "VALID", "tran_id": data["tran_id"], "amount": validated_amount, "currency_type": "BDT", "bank_tran_id": "BANK1"}
        with mock.patch("apps.wallet.gateways.sslcommerz.requests.get", return_value=resp(v)) as get:
            r = self.client.post("/api/wallet/ipn/sslcommerz/", data)
        return r, get

    def test_ipn_then_browser_redirect_credit_once(self):
        dep = self.start()
        r, _ = self.post_ipn(self.ipn(dep))
        self.assertEqual(r.status_code, 200)
        with mock.patch("apps.wallet.gateways.sslcommerz.requests.get", return_value=resp({"status": "VALIDATED", "tran_id": dep.reference, "amount": "2000.00", "bank_tran_id": "BANK1"})):
            r = self.client.post("/api/wallet/callback/sslcommerz/", self.ipn(dep))
        self.assertIn("result=success", r["Location"])
        self.assertEqual(self.balance(), Decimal("2000"))
        self.assertBalanced()

    def test_bad_hash_rejected_without_calling_validator(self):
        dep = self.start()
        r, get = self.post_ipn(self.ipn(dep, sign=False))
        get.assert_not_called()
        self.assertEqual(self.balance(), 0)
        dep.refresh_from_db()
        self.assertEqual(dep.status, "initiated")  # forged IPN can't fail a real payment either

    def test_validated_amount_mismatch(self):
        dep = self.start()
        self.post_ipn(self.ipn(dep), validated_amount="20.00")
        self.assertEqual(self.balance(), 0)


@override_settings(**STRIPE)
class StripeTests(GatewayTestBase):
    def start(self):
        with mock.patch("apps.wallet.gateways.stripe.requests.post", return_value=resp({"id": "cs_1", "url": "https://checkout.stripe.test/cs_1"})) as post:
            dep, url = self.checkout("card", "12000")
        self.assertEqual(post.call_args.kwargs["data"]["line_items[0][price_data][unit_amount]"], 10000)  # $100.00
        self.assertEqual((dep.gateway_amount, dep.gateway_currency), (Decimal("100.00"), "USD"))
        return dep

    def event(self, dep, cents=10000, secret="whsec_x"):
        payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {
            "id": "cs_1", "client_reference_id": dep.reference, "payment_status": "paid", "amount_total": cents, "currency": "usd", "payment_intent": "pi_1",
        }}}).encode()
        t = int(time.time())
        sig = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
        return payload, f"t={t},v1={sig}"

    def send(self, payload, sig):
        return self.client.post("/api/wallet/webhook/stripe/", payload, content_type="application/json", HTTP_STRIPE_SIGNATURE=sig)

    def test_webhook_credits_once(self):
        dep = self.start()
        payload, sig = self.event(dep)
        self.assertEqual(self.send(payload, sig).status_code, 200)
        self.send(payload, sig)
        self.assertEqual(self.balance(), Decimal("12000"))
        dep.refresh_from_db()
        self.assertEqual(dep.gateway_ref, "pi_1")
        self.assertBalanced()

    def test_bad_signature_rejected(self):
        dep = self.start()
        payload, sig = self.event(dep, secret="whsec_wrong")
        self.assertEqual(self.send(payload, sig).status_code, 400)
        self.assertEqual(self.balance(), 0)

    def test_amount_mismatch(self):
        dep = self.start()
        self.send(*self.event(dep, cents=100))
        self.assertEqual(self.balance(), 0)
        dep.refresh_from_db()
        self.assertEqual(dep.status, "failed")

    def test_return_page_refresh_credits_before_webhook(self):
        dep = self.start()
        session = {"id": "cs_1", "client_reference_id": dep.reference, "payment_status": "paid", "amount_total": 10000, "currency": "usd", "payment_intent": "pi_1"}
        with mock.patch("apps.wallet.gateways.stripe.requests.get", return_value=resp(session)):
            r = self.c.get(f"/api/wallet/deposits/{dep.pk}/")
        self.assertEqual(r.data["status"], "approved")
        payload, sig = self.event(dep)
        self.send(payload, sig)  # webhook arrives later — no double credit
        self.assertEqual(self.balance(), Decimal("12000"))

    def test_other_users_cannot_read_deposit(self):
        dep = self.start()
        other = User.objects.create_user(email="o@x.com", username="other", password="pw-12345678")
        c = APIClient()
        c.force_authenticate(other)
        self.assertEqual(c.get(f"/api/wallet/deposits/{dep.pk}/").status_code, 404)
