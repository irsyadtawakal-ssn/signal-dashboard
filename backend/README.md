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
- `GET /api/price` — **protected**; returns the cached price object
  `{ oct, octChange24h, btc, btcChange24h, eth, ethChange24h, fetchedAt }`,
  or `503` until the first scheduled fetch completes.
- `GET /api/news` — **protected**; returns cached crypto-news items
  `[{ title, url, source, publishedAt, sentiment }]`, or `503` until the first
  scheduled fetch completes.

## Background jobs

On startup the server schedules a price update (DexScreener for OCT, CoinGecko
for BTC/ETH) every `PRICE_INTERVAL_MS` (default 5 min) and writes it to the
`price` cache key. If one upstream fails, the other's data is still served (the
failed fields are `null`).

A news update (CryptoPanic, hourly by default via `NEWS_INTERVAL_MS`) writes the
`news` cache key. The free public endpoint is used unless `CRYPTOPANIC_TOKEN` is set.

## Auth

Send the Supabase access token as `Authorization: Bearer <token>`. The backend
verifies it locally (HS256) against `SUPABASE_JWT_SECRET`. No token / invalid
token → `401`.

> Cache-population (cron pulling DexScreener / CoinGecko / Twitter / Claude /
> CryptoPanic) is implemented in Phase 2.
