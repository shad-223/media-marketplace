# Payments — online deposits

Code: `backend/apps/wallet/gateways/` (providers) and `backend/apps/wallet/payments.py` (endpoints).
A gateway is **online only when its credentials are set**. Until then the wallet shows the manual
"send money + enter TrxID" form (admins verify it in Admin → Deposits, or it is credited instantly while
`PAYMENTS_SANDBOX=1`).

Money is never credited from what the browser sends. Every callback is re-checked server-to-server
(bKash execute/query, Nagad verify API, SSLCommerz hash + validation API, Stripe signed webhook), the
amount must equal what we asked for, and the deposit row is locked (`select_for_update`) so a replayed
callback credits at most once.

## Method → gateway

| Deposit method | Gateway used (first one configured) |
|---|---|
| bKash | bKash Tokenized → SSLCommerz |
| Nagad | Nagad → SSLCommerz |
| Rocket | SSLCommerz (`dbblmobilebanking`) |
| Bank | SSLCommerz (internet banking) |
| Card / USD | Stripe Checkout (charged in USD at `USD_RATE`) → SSLCommerz |

## Environment variables (`/opt/media/.env`)

```
PUBLIC_BASE_URL=https://media.bpda.site        # used to build callback + return URLs

# bKash Tokenized Checkout
BKASH_BASE_URL=https://tokenized.pay.bka.sh/v1.2.0-beta   # sandbox: https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=  BKASH_APP_SECRET=  BKASH_USERNAME=  BKASH_PASSWORD=

# Nagad (keys as one-line base64 or PEM; "\n" escapes are accepted)
NAGAD_BASE_URL=<live URL from Nagad onboarding>   # sandbox: http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0
NAGAD_MERCHANT_ID=  NAGAD_MERCHANT_NUMBER=
NAGAD_MERCHANT_PRIVATE_KEY=  NAGAD_PG_PUBLIC_KEY=
NAGAD_SERVER_IP=<public IP of the server, whitelisted by Nagad>

# SSLCommerz
SSLCZ_STORE_ID=  SSLCZ_STORE_PASSWD=  SSLCZ_SANDBOX=1      # 0 for live

# Stripe
STRIPE_SECRET_KEY=sk_live_...  STRIPE_WEBHOOK_SECRET=whsec_...
```
(Use the exact live base URL each provider gives you during onboarding.)

## URLs to register with the providers

| Provider | URL |
|---|---|
| bKash callback | sent automatically per payment: `https://media.bpda.site/api/wallet/callback/bkash/` |
| Nagad callback | sent automatically: `https://media.bpda.site/api/wallet/callback/nagad/` |
| SSLCommerz success/fail/cancel | sent automatically: `https://media.bpda.site/api/wallet/callback/sslcommerz/` |
| SSLCommerz IPN | set in merchant panel: `https://media.bpda.site/api/wallet/ipn/sslcommerz/` |
| Stripe webhook | Dashboard → Developers → Webhooks: `https://media.bpda.site/api/wallet/webhook/stripe/`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` |

After paying, users land on `/dashboard/wallet/return?deposit=<id>`, which polls
`GET /api/wallet/deposits/<id>/` (for Stripe it also looks the session up directly, so the balance
updates even if the webhook is slow).

## API

- `GET /api/wallet/gateways/` — per method: `online`, `gateway`, `currency`.
- `POST /api/wallet/deposits/checkout/` `{method, amount}` → `{deposit, redirect_url}` (min ৳10, throttled 10/min).
- `GET /api/wallet/deposits/<id>/` — own deposit status.
- Deposit statuses: `initiated` (sent to gateway) → `approved` (credited) or `failed`
  (cancelled, or amount mismatch — check the note and review by hand). Manual deposits keep `pending`/`approved`/`rejected`.

## Going live checklist

1. Get production credentials; set them in `/opt/media/.env`, set `PAYMENTS_SANDBOX=0` and `SSLCZ_SANDBOX=0`.
2. Register the IPN / webhook URLs above. For Nagad, give them the server's public IP.
3. `docker compose -p media up -d` to reload env, then check `GET /api/wallet/gateways/` shows `online: true`.
4. Make a small real deposit per method and confirm Admin → Deposits shows the gateway ref and the ledger check stays balanced.

## Payouts

Withdrawals are still paid manually by finance (Admin → Withdrawals, record the payout TrxID).
Providers expose a `send_payout()` hook (`Gateway.supports_payout`) for wiring bKash B2C / bank
disbursement APIs later.
