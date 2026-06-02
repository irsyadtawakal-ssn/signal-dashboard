# Signal Dashboard — Frontend (v3.1, vanilla)

Static dashboard for OCT Signal Intelligence. No build step. Auth via Supabase; all data comes from the backend (`/api/*`) — no third-party keys in the browser.

## Features

- **AI Signal Analysis** — BUY/HOLD/SELL recommendations with confidence score and 5-component breakdown (price action, sentiment, Twitter buzz, moving average, Fibonacci)
- **Real-time Price** — OCT/USD live price from DexScreener + BTC/ETH from CoinGecko
- **Portfolio Tracker** — enter holdings to track value, P&L, and next target with persistence per user
- **Fibonacci Calculator** — retracement and extension levels with uptrend/downtrend/extension modes
- **MA Analysis** — 5-minute moving average breakdown with trend signals
- **Sentiment Panel** — bullish/bearish/neutral tweet count with overall sentiment score
- **Crypto News** — latest news with sentiment labels
- **Twitter/X Feed** — AI-curated OCT tweets with filter by sentiment (bullish/bearish/whale)
- **Exit Levels** — predefined profit-taking targets (T1–T7)
- **Telegram Notifications** — connect Telegram to receive BUY/SELL signal alerts
- **Mobile Responsive** — 7 breakpoints (320px–1480px), touch-friendly, portfolio collapse on mobile
- **Admin Panel** — add users directly from the dashboard (admin only)
- **Save as Image** — export portfolio snapshot

## Run tests

```bash
cd frontend && npm install && npm test
```

(Vitest + jsdom — unit tests for `app.js`, `api-client.js`, portfolio and utils)

## Setup

1. **Supabase:** Create a project. From **Settings → API** copy the Project URL, anon public key, and JWT secret.
2. **Backend:** Set `SUPABASE_JWT_SECRET` in `backend/.env`.
3. **Config:** `cp js/config.example.js js/config.js` and fill `supabaseUrl`, `anonKey`, and `apiBaseUrl` (backend origin, e.g. `http://localhost:3000`).
4. **Users:** In Supabase → Authentication, create user accounts manually and **disable self-signup**.
5. **Serve:** `npx serve frontend` (or any static server). Backend must be running.

## Telegram Setup (for users)

1. Open the dashboard → click **Connect Telegram** button
2. Copy the 6-char code shown
3. Open Telegram → find the bot → send `/start <code>`
4. Bot confirms connection — BUY/SELL alerts will now arrive via Telegram

## File Structure

```
frontend/
├── index.html          # Single-page app (HTML + embedded CSS)
├── js/
│   ├── app.js          # Main application logic
│   ├── api-client.js   # Backend API communication
│   ├── auth.js         # Supabase authentication
│   ├── utils.js        # Debounce and shared utilities
│   └── config.js       # Local config (gitignored)
└── tests/
    ├── app.test.js
    ├── api-client.test.js
    └── portfolio.test.js
```

## Notes

- `js/config.js` is gitignored — only `config.example.js` is committed
- DexScreener chart is a keyless public embed (no API key needed)
- Portfolio data is persisted per user via the backend
- All API calls go through the backend — no direct third-party calls from browser
