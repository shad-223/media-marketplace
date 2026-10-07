"""Common pieces for payment gateway providers.

A provider takes a Deposit and sends the payer to a hosted checkout (`start`), then
confirms the payment server-to-server when the gateway calls us back (`verify`).
Nothing is ever credited from data the browser sends: every provider re-checks the
payment with the gateway (or a signed webhook) before returning ok=True.
"""
from dataclasses import dataclass, field
from decimal import Decimal

import requests

TIMEOUT = 20


class GatewayError(Exception):
    """The gateway refused the request or returned something unexpected."""


@dataclass
class VerifyResult:
    ok: bool
    amount: Decimal | None = None  # in the gateway currency (deposit.gateway_amount)
    gateway_ref: str = ""  # the gateway's transaction id
    invoice: str = ""  # our Deposit.reference, when the gateway echoes it
    session: str = ""  # gateway payment/session id (Deposit.gateway_session)
    error: str = ""
    final: bool = True  # False = still processing; leave the deposit alone
    raw: dict = field(default_factory=dict)


class Gateway:
    name = ""
    label = ""
    methods: tuple[str, ...] = ()
    currency = "BDT"
    supports_payout = False

    def enabled(self) -> bool:
        raise NotImplementedError

    def gateway_amount(self, deposit) -> Decimal:
        """Amount to charge, in this gateway's currency."""
        return deposit.amount

    def start(self, deposit, return_url: str) -> str:
        """Create the hosted checkout. May set deposit.gateway_session. Returns the redirect URL."""
        raise NotImplementedError

    def verify(self, data: dict) -> VerifyResult:
        """Confirm a callback / IPN / webhook with the gateway."""
        raise NotImplementedError

    def refresh(self, deposit) -> VerifyResult | None:
        """Optional: look the payment up directly (used when the user returns before the webhook)."""
        return None

    def send_payout(self, withdrawal):  # pragma: no cover - hook for future disbursement APIs
        raise GatewayError(f"{self.label} payouts are processed manually by the finance team.")

    # --- helpers --------------------------------------------------------
    @staticmethod
    def _json(resp: requests.Response) -> dict:
        try:
            data = resp.json()
        except ValueError:
            raise GatewayError(f"Gateway returned a non-JSON response (HTTP {resp.status_code}).")
        if not isinstance(data, dict):
            raise GatewayError("Gateway returned an unexpected response.")
        return data


def money(v) -> Decimal:
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("-1")
