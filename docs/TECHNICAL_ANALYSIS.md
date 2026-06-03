# Technical Analysis Engine

## Overview

Real-time technical analysis generating BUY/HOLD/SELL signals based on 4 indicators:
- Moving Average (50-day, 200-day)
- RSI (14-period)
- Volume analysis
- Macro trend (BTC/ETH context)

Signals are generated every 10 minutes without any AI/API calls — pure math only.

## Configuration

Set in `backend/.env`:

```
ANALYSIS_STRATEGY=technical
SIGNAL_UPDATE_INTERVAL_MS=600000    # 10 minutes
TELEGRAM_NOTIFY_ON_CHANGE=true      # Only notify on signal change
```

## How It Works

Every 10 minutes:
1. Fetch current price, volume, BTC/ETH data from cache
2. Query price history (last 200 days from database)
3. Calculate MA50, MA200, RSI14
4. Analyze volume and macro trends
5. Score each indicator and combine into final signal
6. Store result (10-min + daily)
7. Notify on signal change

## Signal Scoring

```
Score Calculation:
├─ MA trend: +1 if uptrend (price > MA50 > MA200), -1 if downtrend
├─ RSI: +0.5 if oversold (< 30), -0.5 if overbought (> 70)
├─ Volume: ±0.5 scaled by volume ratio (high/low)
└─ Macro: ±0.5 scaled by BTC/ETH direction

Final Signal:
├─ Score ≥ +2 → BUY (confidence: 50% + score×15%, capped 95%)
├─ Score ≤ -2 → SELL
└─ Else → HOLD
```

## Getting Started

### 1. Backfill Price History (one-time)

Before running, populate 200 days of price history:

```bash
cd backend
npm run backfill
# Output: "[Backfill] Success! 200 days of price history loaded"
```

### 2. Start Server

```bash
npm start
# Watch for: "[Technical] Signal: BUY (82%)" or similar
```

### 3. Monitor Signals

Check logs for signal generation:
```bash
# Terminal output should show:
# [Technical] Signal: BUY (85%)
# [Technical] Signal: SELL (78%)
```

## Testing

Run unit tests for individual components:

```bash
# Technical indicators (MA, RSI, volume, macro)
npm test -- backend/tests/ai/technicalAnalysis.test.js

# Signal generator (combining indicators)
npm test -- backend/tests/ai/signalGenerator.test.js

# Analysis factory (strategy pattern)
npm test -- backend/tests/ai/analysisFactory.test.js

# Integration test (full pipeline)
npm test -- backend/tests/integration/technicalAnalysis.integration.test.js
```

All tests should pass with 100% coverage on math functions.

## Database Queries

### View Daily Signals

```sql
SELECT date, signal, confidence, ma_50, ma_200, rsi_14 
FROM technical_signals_daily 
WHERE date >= DATE('now', '-14 days') 
ORDER BY date DESC;
```

### Check Signal Stability

```sql
SELECT DATE(timestamp) as day, COUNT(DISTINCT signal) as changes
FROM technical_signals_10min 
GROUP BY day
ORDER BY day DESC;
```

### Export Signal History

```sql
SELECT * FROM technical_signals_daily 
WHERE date BETWEEN '2025-06-01' AND '2025-06-14'
ORDER BY date DESC;
```

## Validation (2-week Live Test)

The technical analysis engine is designed to run live for 2 weeks to validate signal accuracy:

1. ✓ Set `ANALYSIS_STRATEGY=technical` in `.env`
2. ✓ Restart server with `pm2 restart signal-dashboard`
3. ✓ Monitor dashboard for signal accuracy
4. ✓ Compare signals with actual price movement
5. ✓ After 2 weeks: decide keep or revert

### Quick Revert to Twitter

If you want to switch back to Twitter-based analysis:

```bash
# Edit backend/.env
ANALYSIS_STRATEGY=twitter

# Restart
pm2 restart signal-dashboard
```

See `REVERT_PROCEDURE.md` for detailed revert instructions.

## Architecture

```
┌─────────────────────────────────────────┐
│  Technical Analysis Engine              │
├─────────────────────────────────────────┤
│                                         │
│  Every 10 minutes:                      │
│  ┌─────────────────────────────┐        │
│  │ runTechnicalAnalysis()      │        │
│  │ (scheduler.js)              │        │
│  └────────┬────────────────────┘        │
│           ↓                             │
│  ┌─────────────────────────────┐        │
│  │ generateSignal()            │        │
│  │ (signalGenerator.js)        │        │
│  └────────┬────────────────────┘        │
│           ↓                             │
│  ┌─────────────────────────────┐        │
│  │ calculateMA()               │        │
│  │ calculateRSI()              │        │
│  │ analyzeVolume()             │        │
│  │ analyzeMacro()              │        │
│  │ (technicalAnalysis.js)      │        │
│  └────────┬────────────────────┘        │
│           ↓                             │
│  ┌─────────────────────────────┐        │
│  │ Store: SQLite               │        │
│  │ - technical_signals_10min   │        │
│  │ - technical_signals_daily   │        │
│  │ - price_history (for MA)    │        │
│  └─────────────────────────────┘        │
│                                         │
└─────────────────────────────────────────┘
```

## Troubleshooting

**Problem: "Insufficient price history for MA calculation"**
- Solution: Run `npm run backfill` to populate 200 days of data

**Problem: Signal not generating (stuck on HOLD)**
- Check: Are price/macro data being cached? (`npm start` should show `[Price]` and `[Cache]` logs)
- Check: Does price_history table have at least 50 days? `SELECT COUNT(*) FROM price_history;`

**Problem: Same signal for hours (not changing)**
- Expected: Signal only changes when new data triggers a score change
- Check: Compare consecutive signals in logs or DB

**Problem: Telegram not notifying**
- Check: `TELEGRAM_NOTIFY_ON_CHANGE=true` in `.env`
- Check: User is registered with telegram bot
- Check: Signal actually changed (previous signal ≠ new signal)

## Next Steps (Post-Validation)

After 2-week validation period:
- If signals are accurate: keep ANALYSIS_STRATEGY=technical
- If signals need tuning: adjust thresholds in technicalAnalysis.js (volume ratios, macro thresholds)
- If signals are poor: revert to `ANALYSIS_STRATEGY=twitter`

## Files

- `backend/src/ai/technicalAnalysis.js` - Indicator calculations
- `backend/src/ai/signalGenerator.js` - Signal generation
- `backend/src/scheduler.js` - Scheduler integration
- `backend/src/ai/analysisFactory.js` - Strategy pattern
- `backend/src/services/telegramNotifier.js` - Notification filtering
- `backend/scripts/backfill-price-history.js` - Historical data loader
- `backend/src/config.js` - Configuration
- `backend/.env` - Environment variables
