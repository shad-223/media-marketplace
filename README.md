# Media — digital asset marketplace with escrow

Buy and sell YouTube channels, Facebook pages, Instagram/TikTok/X/Telegram accounts, websites, apps,
domains, gaming accounts, SaaS and stores. Funds sit in escrow until the buyer confirms the handover,
then a 72-hour buyer-protection window runs before release.

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind, TanStack Query — `frontend/` |
| Backend | Django 5 + DRF + SimpleJWT — `backend/` |
| DB | PostgreSQL (server) / SQLite (local) |
| Money | Double-entry ledger (`apps/wallet/ledger.py`) — every transaction's entries sum to zero |
| Files | KYC docs, ownership proofs and chat attachments are AES-256-GCM encrypted at rest |

## Run locally
```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py seed_demo
.venv/Scripts/python manage.py runserver 127.0.0.1:8010
cd frontend && npm install && npm run dev          # http://localhost:3010
```
Demo logins (password `Media!2026Demo`): `admin@media.test` (escrow agent), `seller@media.test`, `buyer@media.test`.
Tests: `cd backend && .venv/Scripts/python manage.py test apps`.

## Escrow flow
`in_escrow` (buyer paid) → `transferred` (seller) → `protection` (buyer confirms with OTP, 72h) → `completed`
(auto-release via `release_escrow`, run every 5 min by the `scheduler` container). `disputed` freezes funds
until an admin releases or refunds. Platform fee (default 5%) is taken from the seller on release.

## Deploy (VPS-3)
Code at `/opt/media`, `.env` from `.env.example`, `bash deploy/redeploy.sh`. Ports: backend 127.0.0.1:8020,
frontend 127.0.0.1:3020; nginx vhost `deploy/nginx-media.conf`; TLS at Cloudflare tunnel.

## Not connected yet (needs credentials)
bKash / Nagad / Rocket / SSLCommerz / Stripe APIs (sandbox deposits + manual admin verification for now),
SMS/email OTP delivery (codes echo on screen while `OTP_ECHO=1`), S3 storage (local encrypted volume for now),
real-time WebSockets (chat polls every 4 s).
