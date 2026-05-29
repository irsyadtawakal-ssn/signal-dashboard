# Signal Dashboard — Backend

Secure API layer for the OCT Signal Intelligence dashboard. Holds all third-party
API credentials, gates data endpoints behind Supabase JWT auth, serves from a
SQLite cache.

## Setup

1. `cd backend && npm install`
2. Copy env: `cp .env.example .env` (Windows: `copy .env.example .env`) and fill
   `SUPABASE_JWT_SECRET` (Supabase dashboard → Settings → API → JWT Secret).
3. Run tests: `npm test`
4. Start: `npm start` (or `npm run dev` to auto-reload).

## Endpoints

- `GET /api/health` — public liveness check → `{ "status": "ok" }`
- `GET /api/price` — **protected** (requires `Authorization: Bearer <supabase-jwt>`);
  returns cached price JSON, or `503` if the cache is empty.

## Auth

Send the Supabase access token as `Authorization: Bearer <token>`. The backend
verifies it locally (HS256) against `SUPABASE_JWT_SECRET`. No token / invalid
token → `401`.

> Cache-population (cron pulling DexScreener / CoinGecko / Twitter / Claude /
> CryptoPanic) is implemented in Phase 2.
