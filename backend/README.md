# Signal Dashboard — Backend

Secure API layer for the OCT Signal Intelligence dashboard. Holds all third-party
API credentials, gates data endpoints behind Supabase JWT auth, serves from a
SQLite cache.

## Setup

1. `cd backend && npm install`
2. Copy env: `cp .env.example .env` (Windows: `copy .env.example .env`) and fill in required values.
3. Run tests: `npm test`
4. Start: `npm start` (or `npm run dev` to auto-reload).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_JWT_SECRET` | ✅ | Supabase → Settings → API → JWT Secret |
| `OPENROUTER_API_KEY` | Optional | AI analysis via OpenRouter |
| `ANTHROPIC_API_KEY` | Optional | AI analysis via Anthropic directly |
| `CRYPTOPANIC_TOKEN` | Optional | CryptoPanic news API token |
| `CORS_ORIGIN` | Optional | Allowed CORS origin (default: `*`) |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token from BotFather |
| `TELEGRAM_API_TIMEOUT` | Optional | Telegram API timeout in ms (default: 5000) |
| `TELEGRAM_MAX_RETRIES` | Optional | Max retry attempts for failed notifications (default: 3) |
| `TELEGRAM_RETRY_BACKOFF` | Optional | Comma-separated backoff delays in ms (default: 60000,300000,1800000,3600000) |

## Endpoints

### Public
- `GET /api/health` — liveness check → `{ "status": "ok" }`

### Protected (Bearer token required)
- `GET /api/price` — cached price: `{ oct, octChange24h, btc, btcChange24h, eth, ethChange24h, fetchedAt }`
- `GET /api/news` — cached news: `[{ title, url, source, publishedAt, sentiment }]`
- `GET /api/tweets` — cached tweets: `[{ id, text, author, url, createdAt, sentiment }]` where `sentiment` is `Bullish | Bearish | Whale | Unrated`
- `POST /api/analyze` — run AI analysis on cached data → `{ recommendation: BUY|HOLD|SELL, confidence, summary, components, generatedAt }`. Send `{ "force": true }` to bypass cache. Result cached for `ANALYSIS_TTL_MS` (default 10 min).
- `GET /api/cache` — view current cache state (admin)

### Admin (admin email required)
- `POST /api/admin/add-user` — add a new Supabase user by email

### Telegram
- `POST /api/telegram/connect` — generate a 6-char auth code to connect Telegram (requires JWT)
- `POST /api/telegram/verify/:code` — verify auth code and save Telegram chat ID (called by bot)

## Telegram Notifications

When a BUY or SELL signal is detected (and differs from the previous signal), the backend sends a Telegram notification to users who have connected their Telegram account.

**Setup:**
1. Create a bot via BotFather → get `TELEGRAM_BOT_TOKEN`
2. Add token to `.env`
3. User connects via the app: Settings → Connect Telegram → follow code flow

**Message format:** Includes signal recommendation, confidence %, all 5 analysis components (price action, sentiment, Twitter buzz, moving average, Fibonacci), summary, and timestamp.

Failed notifications are stored in the `failed_notifications` table and retried automatically with exponential backoff (1m → 5m → 30m → 1h, max 3 retries).

## Background Jobs

- **Price** — DexScreener (OCT) + CoinGecko (BTC/ETH), every `PRICE_INTERVAL_MS` (default 5 min)
- **News** — CryptoPanic, every `NEWS_INTERVAL_MS` (default 60 min)
- **Tweets** — Twitter scraper + AI sentiment classification, every `TWITTER_INTERVAL_MS` (default 5 min)
- **Telegram retry** — retries failed notifications every 1 min with exponential backoff

## Auth

Send the Supabase access token as `Authorization: Bearer <token>`. Verified locally (HS256) against `SUPABASE_JWT_SECRET`. No token / invalid token → `401`.

## Database

SQLite at `backend/signal-dashboard.db`.

Tables:
- `cache` — key/value store for price, news, tweets, analysis data
- `users` — user records with `email` and `telegramChatId`
- `failed_notifications` — failed Telegram sends pending retry

## Tests

180 tests across 25 files:
```bash
cd backend && npm test
```

## Deploy to VPS

The backend runs as a managed pm2 process on a Linux VPS.

### First-time setup

```bash
# 1. Install pm2 globally (once per VPS)
npm install -g pm2

# 2. Production install (skip devDependencies)
cd backend && npm ci --omit=dev

# 3. Copy env and fill required values
cp .env.example .env
# Edit .env — at minimum set SUPABASE_JWT_SECRET
# Optional: OPENROUTER_API_KEY / ANTHROPIC_API_KEY, CRYPTOPANIC_TOKEN, TELEGRAM_BOT_TOKEN

# 4. Start the process
cd backend && pm2 start pm2.config.js

# 5. Register pm2 with the OS so it survives reboots
pm2 startup
# Copy and paste the ENTIRE printed command and run it

# 6. Save the current process list
pm2 save
```

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
