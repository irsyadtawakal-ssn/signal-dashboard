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
- `GET /api/tweets` — **protected**; returns cached, AI-classified tweets
  `[{ id, text, author, url, createdAt, sentiment }]` where `sentiment` is
  `Bullish | Bearish | Whale | Unrated`, or `503` until the first scheduled fetch.
- `POST /api/analyze` — **protected**; runs Claude Opus on the cached price/tweets/news and
  returns `{ recommendation: BUY|HOLD|SELL, confidence, summary, components, generatedAt }`.
  The result is cached for `ANALYSIS_TTL_MS` (default 10 min); send `{ "force": true }` to
  re-run immediately. `503` if no AI key is configured; `502` if the analysis call fails.

## Background jobs

On startup the server schedules a price update (DexScreener for OCT, CoinGecko
for BTC/ETH) every `PRICE_INTERVAL_MS` (default 5 min) and writes it to the
`price` cache key. If one upstream fails, the other's data is still served (the
failed fields are `null`).

A news update (CryptoPanic, hourly by default via `NEWS_INTERVAL_MS`) writes the
`news` cache key. The free public endpoint is used unless `CRYPTOPANIC_TOKEN` is set.

A tweets update (Twitter scraper, every `TWITTER_INTERVAL_MS`, default 5 min) writes the
`tweets` cache key. Each tweet is classified by Claude Sonnet via `AI_PROVIDER`
(`openrouter` default, or `anthropic`); when no AI key is set the tweets are stored
`Unrated`. A scraper failure leaves the feed at `503` until the next successful cycle.

`POST /api/analyze` is **on-demand** (not scheduled): it reads the existing cache keys, calls
Opus via `AI_PROVIDER`, and stores the result under the `analysis` cache key with a TTL to
keep Opus cost low.

## Auth

Send the Supabase access token as `Authorization: Bearer <token>`. The backend
verifies it locally (HS256) against `SUPABASE_JWT_SECRET`. No token / invalid
token → `401`.

> Cache-population (cron pulling DexScreener / CoinGecko / Twitter / Claude /
> CryptoPanic) is implemented in Phase 2.

## Deploy to VPS

The backend is designed to run as a managed pm2 process on a Linux VPS.

### First-time setup

```bash
# 1. Install pm2 globally (once per VPS)
npm install -g pm2

# 2. Production install (skip devDependencies)
cd backend && npm ci --omit=dev

# 3. Copy env and fill required values
cp .env.example .env
# Edit .env — at minimum set SUPABASE_JWT_SECRET
# Optional: OPENROUTER_API_KEY / ANTHROPIC_API_KEY, CRYPTOPANIC_TOKEN, TWITTER_SCRAPER_TOKEN, CORS_ORIGIN

# 4. Start the process (must run from inside the backend/ directory)
cd backend && pm2 start pm2.config.js

# 5. Register pm2 with the OS so it survives reboots
pm2 startup
# ↑ Prints something like: "sudo env PATH=... pm2 startup systemd -u user --hp /home/user"
# Copy and paste the ENTIRE printed command (including 'sudo') and run it

# 6. Save the current process list
pm2 save
```

After steps 5 and 6 are both complete, pm2 will restart automatically after any VPS reboot.

### Day-to-day operations

```bash
pm2 status                        # see all running processes + uptime
pm2 logs signal-dashboard         # tail live logs
pm2 logs signal-dashboard --lines 200  # last 200 log lines
pm2 restart signal-dashboard      # restart after config/env change
pm2 stop signal-dashboard         # stop without removing
pm2 delete signal-dashboard       # remove from pm2 process list
```

### Updating the backend

```bash
git pull
cd backend && npm ci --omit=dev
pm2 restart signal-dashboard
```

### Log files

Logs are written to `backend/logs/app.log` (stdout) and `backend/logs/error.log` (stderr).
The `logs/` directory is created automatically by pm2 on first start.
