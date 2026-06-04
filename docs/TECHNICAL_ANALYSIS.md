# Technical Analysis Engine

> **Status:** ✅ Live & Operational — signal-dashboard.web.id  
> **Last updated:** 4 Juni 2026

## Overview

Technical analysis engine yang menghasilkan sinyal BUY/HOLD/SELL setiap 10 menit berdasarkan 4 indikator:
- Moving Average (MA50, MA200)
- RSI (14-period)
- Volume analysis
- Macro trend (BTC/ETH context)

Signals digenerate **tanpa AI/API calls** — pure math only. Biaya: **$0/hari**.

---

## Configuration

Set in `backend/.env`:

```
ANALYSIS_STRATEGY=technical
SIGNAL_UPDATE_INTERVAL_MS=600000    # 10 minutes (default)
TELEGRAM_NOTIFY_ON_CHANGE=true      # Only notify on signal change
DISABLE_TWITTER=true                # Twitter disabled
```

---

## How It Works

Every 10 minutes:
1. Fetch current price, volume, BTC/ETH data from cache
2. Query price history (last 200 days from database)
3. Calculate MA50, MA200, RSI14
4. Analyze volume vs 30-day average
5. Analyze macro trend via BTC/ETH 24h change
6. Score each indicator and combine into final signal
7. Store result (10-min table + daily table)
8. Send Telegram notification **only if signal changed**

---

## Signal Scoring

```
Score Calculation:
├─ MA trend:  +1 if uptrend (price > MA50 > MA200), -1 if downtrend
├─ RSI:       +0.5 if oversold (< 30), -0.5 if overbought (> 70), 0 if neutral
├─ Volume:    +0.5 if HIGH (>1.5x avg), -0.5 if LOW (<0.5x avg)
└─ Macro:     +0.5 if STRONG_BULL (BTC+ETH >2%), -0.5 if STRONG_BEAR (<-2%)

Final Signal:
├─ Score ≥ +2  →  🟢 BUY  (confidence: 50% + score×15%, max 95%)
├─ Score ≤ -2  →  🔴 SELL
└─ Score -1~+1 →  🟡 HOLD
```

---

## API Endpoints (Public, no auth required)

| Endpoint | Response |
|---|---|
| `GET /api/signals/current` | Signal terkini + indicators + reasoning |
| `GET /api/signals/daily` | Array signal harian (30 hari terakhir) |
| `GET /api/signals/10min` | Array signal 10-menit (30 hari terakhir) |

### Contoh response `/api/signals/current`:

```json
{
  "signal": "SELL",
  "confidence": 0.7,
  "score": -1,
  "indicators": {
    "ma50": 0.1197,
    "ma200": 0.1270,
    "rsi": 53.06,
    "currentPrice": 0.1167,
    "volumeRatio": 2.61
  },
  "reasoning": "✗ Price below MA50 & MA50 below MA200 (Downtrend)\n⊙ RSI neutral (30-70)\nHIGH_VOLUME (ratio: 2.61x)\nSTRONG_BEAR (BTC: -4.14%, ETH: -5.31%)",
  "timestamp": "2026-06-03T08:43:50.459Z",
  "strategy": "TECHNICAL",
  "signalChanged": false
}
```

---

## Getting Started

### 1. Setup Environment

```bash
# backend/.env
ANALYSIS_STRATEGY=technical
SIGNAL_UPDATE_INTERVAL_MS=600000
TELEGRAM_NOTIFY_ON_CHANGE=true
DISABLE_TWITTER=true
```

### 2. Backfill Price History (one-time)

Sebelum pertama kali run, populate 200 hari price history:

```bash
cd backend
npm run backfill
# Output: "[Backfill] Success! 201 days of price history loaded"
```

### 3. Start Server

```bash
# Development
npm start

# Production (PM2)
pm2 start pm2.config.js
pm2 save
pm2 startup  # auto-restart on reboot
```

### 4. Monitor Signals

```bash
# Real-time logs
pm2 logs signal-dashboard

# Check database
sqlite3 backend/data/cache.sqlite << 'SQL'
SELECT signal, confidence, created_at FROM technical_signals_10min
ORDER BY created_at DESC LIMIT 5;
SQL
```

---

## Testing

```bash
# Technical indicators (MA, RSI, volume, macro)
npm test -- backend/tests/ai/technicalAnalysis.test.js

# Signal generator
npm test -- backend/tests/ai/signalGenerator.test.js

# Analysis factory
npm test -- backend/tests/ai/analysisFactory.test.js

# Integration test
npm test -- backend/tests/integration/technicalAnalysis.integration.test.js
```

Total: **40 tests, 100% passing**.

---

## Database Schema

```sql
-- Daily signals (forever retention)
CREATE TABLE technical_signals_daily (
  date        TEXT UNIQUE,
  signal      TEXT,   -- BUY/SELL/HOLD
  confidence  REAL,   -- 0.0 to 1.0
  ma_50       REAL,
  ma_200      REAL,
  rsi_14      REAL,
  volume_ratio REAL,
  reasoning   TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 10-minute signals (rolling 30-day window)
CREATE TABLE technical_signals_10min (
  timestamp   TEXT UNIQUE,
  signal      TEXT,
  confidence  REAL,
  score       REAL,   -- -3 to +3
  ma_50       REAL,
  ma_200      REAL,
  rsi_14      REAL,
  volume_ratio REAL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Price history (for MA calculation)
CREATE TABLE price_history (
  date        TEXT UNIQUE,
  oct_price   REAL,
  oct_volume  REAL,
  btc_price   REAL,
  eth_price   REAL,
  btc_change_24h REAL,
  eth_change_24h REAL,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### Useful Queries

```sql
-- View last 14 days signals
SELECT date, signal, confidence, ma_50, ma_200, rsi_14
FROM technical_signals_daily
WHERE date >= DATE('now', '-14 days')
ORDER BY date DESC;

-- Count signal distribution
SELECT signal, COUNT(*) as count
FROM technical_signals_daily
GROUP BY signal;

-- Check how often signal changes per day
SELECT DATE(created_at) as day, COUNT(DISTINCT signal) as unique_signals
FROM technical_signals_10min
GROUP BY day
ORDER BY day DESC;
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Technical Analysis Engine                       │
├─────────────────────────────────────────────────┤
│  Every 10 minutes:                               │
│                                                 │
│  scheduler.js → runTechnicalAnalysis()           │
│       ↓                                         │
│  signalGenerator.js → generateSignal()          │
│       ↓                                         │
│  technicalAnalysis.js                           │
│    ├─ calculateMA(prices, 50)                   │
│    ├─ calculateMA(prices, 200)                  │
│    ├─ calculateRSI(prices, 14)                  │
│    ├─ analyzeVolume(current, avg30d)             │
│    └─ analyzeMacro(btcChange, ethChange)         │
│       ↓                                         │
│  SQLite Storage                                 │
│    ├─ technical_signals_10min                   │
│    ├─ technical_signals_daily                   │
│    └─ cache (key: 'technicalSignal')            │
│       ↓                                         │
│  Telegram (if signalChanged)                    │
│    └─ telegramNotifier.send(signal, userId)     │
└─────────────────────────────────────────────────┘
```

---

## Files

| File | Fungsi |
|---|---|
| `backend/src/ai/technicalAnalysis.js` | Kalkulasi indikator (MA, RSI, Volume, Macro) |
| `backend/src/ai/signalGenerator.js` | Kombinasi indikator → sinyal final |
| `backend/src/ai/analysisFactory.js` | Strategy pattern (technical/twitter) |
| `backend/src/scheduler.js` | `runTechnicalAnalysis()` scheduler |
| `backend/src/server.js` | Task registration setiap 10 menit |
| `backend/src/routes/signals.js` | Public API endpoints |
| `backend/src/services/telegramNotifier.js` | Format & kirim notifikasi |
| `backend/scripts/backfill-price-history.js` | Load 200 hari data historis |
| `backend/src/config.js` | Config loader |
| `backend/.env` | Environment variables |

---

## Troubleshooting

**`Invalid input: currentVolume must be a non-negative number`**
- Terjadi saat startup (race condition, price belum di-cache)
- Normal — hilang sendiri setelah price update pertama (~1 menit)

**`[Technical] Insufficient price history for MA calculation`**
- Jalankan: `cd backend && npm run backfill`

**Signal tidak berubah sudah lama**
- Normal — signal hanya berubah kalau score berubah signifikan
- Cek: `SELECT signal, COUNT(*) FROM technical_signals_10min GROUP BY signal;`

**Telegram tidak mengirim notifikasi**
- Cek: `TELEGRAM_NOTIFY_ON_CHANGE=true` di `.env`
- Cek: user sudah register Chat ID via dashboard → TELEGRAM button
- Cek: signal benar-benar berubah (SELL → BUY atau sebaliknya)

**`telegramNotifier.send is not a function`**
- Fixed di commit `8de0024` — pastikan sudah `git pull` terbaru

---

## Validation Period

| | |
|---|---|
| **Mulai** | 3 Juni 2026 |
| **Selesai** | 17 Juni 2026 |
| **Metrik** | Akurasi sinyal vs harga aktual |
| **Lanjut jika** | Sinyal BUY/SELL terbukti prediktif |
| **Revert jika** | Akurasi buruk → `ANALYSIS_STRATEGY=twitter` |

---

## Revert ke Twitter Analysis (jika perlu)

```bash
# Edit .env
ANALYSIS_STRATEGY=twitter
DISABLE_TWITTER=false

# Restart
pm2 restart signal-dashboard
```
