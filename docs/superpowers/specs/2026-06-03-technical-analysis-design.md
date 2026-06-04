# Technical Analysis Implementation Design Spec

**Date:** 2026-06-03  
**Status:** Approved  
**Phase:** Design Complete → Ready for Implementation Plan  
**Timeline:** 5-6 days implementation + 8 days validation (14 days total)

---

## 📋 EXECUTIVE SUMMARY

**Goal:** Implement technical analysis as an alternative signal source (without Twitter dependency) to validate trading signal accuracy over 2 weeks.

**What's Being Built:**
- Real-time technical analysis engine (every 10 minutes)
- 4 technical indicators: Moving Average (50/200), RSI (14), Volume, Macro trend
- Scoring system (-3 to +3) → BUY/HOLD/SELL signals
- Zero cost ($0 - pure math, no AI calls)
- 2-week live validation to measure accuracy

**Key Constraint:** Must be reversible (can fallback to Twitter in 1 minute if needed)

---

## 🏗️ SECTION 1: ARCHITECTURE

### High-Level Design

```
┌────────────────────────────────────────────────┐
│ Data Sources (Real-time, Existing)             │
├────────────────────────────────────────────────┤
│ ├─ DexScreener: OCT price, volume (every 1min) │
│ ├─ CoinGecko: BTC/ETH macro (every 5min)       │
│ └─ SQLite: Price history (200+ days)           │
└────────────────┬─────────────────────────────┘
                 ↓
┌────────────────────────────────────────────────┐
│ Technical Analysis Engine (NEW)                │
├────────────────────────────────────────────────┤
│ ├─ technicalAnalysis.js                        │
│ │  ├─ calculateMA() - moving averages          │
│ │  ├─ calculateRSI() - momentum indicator      │
│ │  ├─ analyzeVolume() - signal strength        │
│ │  └─ analyzeMacro() - market context          │
│ │                                              │
│ ├─ signalGenerator.js                          │
│ │  ├─ scoreSignals() - combine factors         │
│ │  ├─ determineSignal() - BUY/HOLD/SELL       │
│ │  └─ calculateConfidence() - 0-100%          │
│ │                                              │
│ └─ analysisFactory.js (MODIFY)                 │
│    └─ Strategy selector (twitter/technical)   │
└────────────────┬─────────────────────────────┘
                 ↓
┌────────────────────────────────────────────────┐
│ Output Layer (Notification + Storage)          │
├────────────────────────────────────────────────┤
│ ├─ Telegram: Signal changes (no spam limit)    │
│ ├─ Dashboard: Real-time signal + indicators    │
│ └─ SQLite: Daily + 30-day rolling 10-min data  │
└────────────────────────────────────────────────┘
```

### Integration Points

- **Scheduler:** Existing `scheduler.js` adds 10-minute interval task
- **Strategy Selection:** Use existing `analysisFactory.js` (already supports multiple strategies)
- **Data Access:** Read from existing cache (`getCache(db, 'price')`, `getCache(db, 'macro')`)
- **Notification:** Use existing Telegram notifier (update logic for signal-change-only)

### No Breaking Changes

- All existing Twitter logic remains untouched
- Can run parallel (HYBRID mode) for comparison
- Instant fallback to Twitter via `.env` change

---

## 📦 SECTION 2: COMPONENTS & MODULES

### New Files to Create

#### `backend/src/ai/technicalAnalysis.js`

**Purpose:** Pure math indicators (no AI, no external calls)

**Functions:**

```typescript
calculateMA(prices: number[], period: number): number
  // Calculate simple moving average
  // Input: array of prices, period (50, 200)
  // Output: MA value
  // Example: calculateMA([1,2,3,4,5], 3) → 4

calculateRSI(prices: number[], period: number = 14): number
  // Calculate Relative Strength Index (momentum)
  // Input: price array, period (default 14)
  // Output: RSI value (0-100)
  // RSI > 70 = overbought, < 30 = oversold

analyzeVolume(currentVolume: number, averageVolume: number): {signal: string, score: number}
  // Compare current volume to average
  // Returns: { signal: "HIGH_VOLUME"|"NORMAL"|"LOW_VOLUME", score: 1|-1|0 }

analyzeMacro(btcChange24h: number, ethChange24h: number): {signal: string, score: number}
  // Determine market context from BTC/ETH movement
  // Returns: { signal: "BULL"|"BEAR"|"MIXED", score: 1|-1|0.5 }
```

#### `backend/src/ai/signalGenerator.js`

**Purpose:** Combine indicators into trading signal

**Functions:**

```typescript
generateSignal(data: {
  prices: number[],
  currentPrice: number,
  currentVolume: number,
  avgVolume: number,
  btcChange24h: number,
  ethChange24h: number
}): {
  signal: "BUY" | "HOLD" | "SELL",
  confidence: number,
  score: number,
  indicators: {...},
  reasoning: string[]
}
  // Main function: calculate all indicators, score, determine signal
  // Confidence range: 0.5 (50%) to 0.95 (95%)
```

#### `backend/src/ai/analysisFactory.js` (MODIFY)

**Current state:** Already supports strategy pattern
**Change needed:** Add TechnicalAnalysisStrategy class
- No new pattern needed, just add new strategy option
- Factory already routes to correct strategy based on config

### Modified Files

#### `backend/src/scheduler.js`

**Add function:**

```typescript
async function runTechnicalAnalysis({ db, config }): Promise<{status: string, signal: string}>
  // Fetch data → calculate indicators → generate signal → store → notify
  // Called every 10 minutes (SIGNAL_UPDATE_INTERVAL_MS)
  // Returns: {status: "success"|"failed", signal: "BUY"|"HOLD"|"SELL", ...}
```

**Add to task list:**

```javascript
baseTasks.push({
  run: () => runTechnicalAnalysis({ db, config }),
  intervalMs: config.signalUpdateIntervalMs || 600000  // 10 minutes default
});
```

#### `backend/.env` (ADD LINES)

```
# Technical Analysis Configuration
ANALYSIS_STRATEGY=technical          # Options: twitter, technical, hybrid
SIGNAL_UPDATE_INTERVAL_MS=600000     # 10 minutes (600,000 ms)
TELEGRAM_NOTIFY_ON_CHANGE=true       # Only notify on signal change
```

### Database Schema Changes

#### `backend/src/db.js` (ADD TABLES)

```sql
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE UNIQUE,
  oct_price REAL NOT NULL,
  oct_change_24h REAL,
  oct_volume REAL,
  btc_price REAL,
  eth_price REAL,
  btc_change_24h REAL,
  eth_change_24h REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS technical_signals_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE UNIQUE,
  signal TEXT NOT NULL,        -- BUY, HOLD, SELL
  confidence REAL NOT NULL,    -- 0.5 to 0.95
  ma_50 REAL,
  ma_200 REAL,
  rsi_14 REAL,
  volume_ratio REAL,
  reasoning TEXT,              -- JSON or text explaining signal
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS technical_signals_10min (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME UNIQUE,
  signal TEXT NOT NULL,        -- BUY, HOLD, SELL
  confidence REAL NOT NULL,
  score REAL,                  -- -3 to +3 raw score
  ma_50 REAL,
  ma_200 REAL,
  rsi_14 REAL,
  volume_ratio REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for queries
CREATE INDEX IF NOT EXISTS idx_technical_signals_daily_date ON technical_signals_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_technical_signals_10min_timestamp ON technical_signals_10min(timestamp DESC);
```

---

## 🔄 SECTION 3: DATA FLOW

### 10-Minute Update Cycle

**Execution every 10 minutes (600,000 ms):**

```
T+0 min: Start signal calculation
├─ Fetch current OCT price from DexScreener (or use cached if down)
├─ Fetch BTC/ETH prices from CoinGecko (or use cached if down)
├─ Fetch 200-day price history from SQLite
└─ Retrieve current 24h average volume

T+1 sec: Calculate indicators
├─ MA50 = moving average of last 50 days
├─ MA200 = moving average of last 200 days
├─ RSI14 = relative strength index (14-period)
├─ Volume ratio = current / 24h average
└─ Macro trend = BTC/ETH direction (bull/bear/mixed)

T+2 sec: Score all factors
├─ MA trend: +1 if uptrend (price > MA50 > MA200), -1 if downtrend
├─ RSI signal: +0.5 if oversold (< 30), -0.5 if overbought (> 70)
├─ Volume: +0.5 if high (> 1.5x avg), -0.5 if low (< 0.5x avg)
├─ Macro: +0.5 if bull, -0.5 if bear
└─ Total score = sum of all factors (-3 to +3)

T+3 sec: Determine signal
├─ Score ≥ +2 → BUY (confidence = 0.5 + score × 0.15)
├─ Score ≤ -2 → SELL (confidence = 0.5 + |score| × 0.15)
└─ Else → HOLD (confidence = 0.5)

T+4 sec: Check for change
├─ Compare current signal with last signal from cache
├─ If changed → set notifyTelegram = true
└─ If same → set notifyTelegram = false

T+5 sec: Store results
├─ Store to technical_signals_10min (always)
├─ Store to technical_signals_daily (once per day at midnight)
├─ Update cache (in-memory for dashboard)
└─ Cleanup old 10-min data (keep only 30 days)

T+6 sec: Notify
├─ If notifyTelegram && signalChanged:
│  └─ Send Telegram: "🚀 BUY (82%)" or "⏸️ HOLD (65%)" etc
├─ Update dashboard (WebSocket or polling)
└─ Log to console: "[Technical] Signal: BUY confidence: 0.82"

Total: ~1 second from start to finish
```

### Notification Rules

**Trigger:** Signal changes (any change)
- BUY → SELL: Notify
- HOLD → BUY: Notify
- BUY → BUY: Do NOT notify (same signal)
- SELL → SELL: Do NOT notify (same signal)

**Message format:**
```
🚀 BUY (82%)
⏸️ HOLD (65%)
🔴 SELL (75%)
⚠️ System Degraded (using cached data)
```

**Frequency:** No limit (as often as signal changes)
- Best case: 3-5 notifications/day (stable signal)
- Volatile case: 10+ notifications/day (flip-flopping signal)

---

## 💾 SECTION 4: DATABASE SCHEMA

### Table 1: price_history

**Purpose:** Store daily closing prices for MA calculation

```sql
CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE UNIQUE,
  oct_price REAL NOT NULL,           -- Closing price
  oct_change_24h REAL,               -- % change in 24h
  oct_volume REAL,                   -- Volume in 24h
  btc_price REAL,                    -- For macro context
  eth_price REAL,
  btc_change_24h REAL,
  eth_change_24h REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Retention:** Forever (needed for historical MA calculation)

**Insertion:** Once per day (from scheduler or manual backfill)

### Table 2: technical_signals_daily

**Purpose:** Store daily signals for long-term accuracy tracking

```sql
CREATE TABLE technical_signals_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE UNIQUE,
  signal TEXT NOT NULL,              -- BUY, HOLD, SELL
  confidence REAL NOT NULL,          -- 0.5 to 0.95
  ma_50 REAL,
  ma_200 REAL,
  rsi_14 REAL,
  volume_ratio REAL,                 -- current / avg
  reasoning TEXT,                    -- JSON: indicators used + explanation
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Retention:** Forever (historical record for validation)

**Insertion:** Once per day (around midnight or first calculation of day)

### Table 3: technical_signals_10min

**Purpose:** Store 10-minute updates for pattern analysis + debugging

```sql
CREATE TABLE technical_signals_10min (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME UNIQUE,
  signal TEXT NOT NULL,              -- BUY, HOLD, SELL
  confidence REAL NOT NULL,          -- 0.5 to 0.95
  score REAL,                        -- -3 to +3 raw score
  ma_50 REAL,
  ma_200 REAL,
  rsi_14 REAL,
  volume_ratio REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Retention:** 30 days (auto-cleanup via scheduler)

**Insertion:** Every 10 minutes (144 rows/day = ~4,320 rows/month)

**Cleanup query:**
```sql
DELETE FROM technical_signals_10min 
WHERE created_at < datetime('now', '-30 days');
```

### Indexes

```sql
CREATE INDEX idx_technical_signals_daily_date 
  ON technical_signals_daily(date DESC);

CREATE INDEX idx_technical_signals_10min_timestamp 
  ON technical_signals_10min(timestamp DESC);
```

---

## 🛡️ SECTION 5: ERROR HANDLING

### Graceful Degradation Strategy

**Principle:** Keep running, use cached data, never crash

#### Scenario 1: DexScreener Unavailable (no current price)

```
Detection: HTTP error from DexScreener
Action:
├─ Use price from 10 minutes ago (cached in memory)
├─ Log warning: "[DexScreener] Stale (15 min old)"
└─ Continue with calculation

Signal: Generated (using stale price, marked in logs)
Notification:
├─ After 15 min downtime: Send Telegram warning
├─ "⚠️ DexScreener slow, using cached price"
└─ Continue notifications as normal

Recovery: When DexScreener comes back, use fresh data immediately
```

#### Scenario 2: CoinGecko Unavailable (no BTC/ETH data)

```
Detection: HTTP error from CoinGecko
Action:
├─ Skip macro factor (no BTC/ETH score)
├─ Calculate signal with MA, RSI, volume only
├─ Log warning: "[CoinGecko] Unavailable, macro factor skipped"
└─ Continue

Signal: Generated (3 factors instead of 4, still valid)
Confidence: Slightly lower (macro is 0.5 points possible)
```

#### Scenario 3: Incomplete Price History (< 200 days)

```
Detection: Database has only 50 days of data
Action:
├─ Calculate MA50 normally (50 days available)
├─ Calculate MA200 with available data (biased but usable)
├─ Log info: "[History] Only 50 days available, MA200 biased"
└─ Continue

Signal: Generated (less reliable MA200, but acceptable for initial testing)
```

#### Scenario 4: Database Connection Error (can't write)

```
Detection: INSERT fails
Action:
├─ Keep signal calculation in memory (don't persist)
├─ Send notification anyway (Telegram works independently)
├─ Log error: "[Database] Write failed, retrying in 10 min"
└─ Continue (signal cached in memory)

Signal: Generated and notified (but not saved to DB)
Recovery: Next successful write includes both signals
```

#### Scenario 5: All Systems Down (critical failure)

```
Detection: Multiple failures (no price, no macro, no DB)
Action:
├─ Use ALL cached values (price, macro, last signal)
├─ Keep signal from 10 minutes ago (don't change)
├─ Log critical: "[CRITICAL] System degraded, running on cache"
└─ Notify boss

Signal: Reuse last known signal
Telegram: "⚠️ System degraded, using cached signal"
Recovery: Manual intervention or system restart needed
```

### Monitoring & Logging

```javascript
// All errors logged with timestamp + severity
console.log(`[Technical] Success: BUY 0.82`);
console.warn(`[Technical] DexScreener stale (15 min)`);
console.error(`[Technical] Database write failed`);

// Errors also sent to Telegram if critical (> 15 min downtime)
await notifier.send("⚠️ Technical analysis system degraded", telegramConfig);
```

---

## 🧪 SECTION 6: TESTING & VALIDATION

### 2-Week Validation Timeline

#### Week 1: Deployment & Monitoring

**Day 1-3: Deployment**
```
✓ Deploy technical analysis code
✓ Set ANALYSIS_STRATEGY=technical in .env
✓ Restart PM2: pm2 restart signal-dashboard
✓ Verify: Dashboard shows BUY/HOLD/SELL + indicators
✓ Verify: Telegram notifications working
✓ Verify: Database storing signals
```

**Day 4-7: Live Observation**
```
✓ Monitor signals daily
✓ Check: Do signals match price movement next day?
✓ Track: Signal consistency (stable or flip-flop?)
✓ Log: Manual notes or auto-calculated metrics
✓ Example tracking:
  Day 1: BUY → Price +8% next day ✓ CORRECT
  Day 2: SELL → Price -3% next day ✓ CORRECT
  Day 3: HOLD → Price -1% next day ✓ CORRECT
  Day 4: BUY → Price +2% next day ✓ CORRECT
  Day 5: HOLD → Price +1% next day ✓ CORRECT
```

#### Week 2: Analysis & Decision

**Day 8-14: Accuracy Analysis**
```
✓ Query database for daily signals
✓ Compare each signal with actual price movement
✓ Calculate: % accurate signals
✓ Example queries:

SELECT date, signal FROM technical_signals_daily 
WHERE date >= DATE('now', '-14 days') 
ORDER BY date DESC;

SELECT DATE(timestamp) as day, COUNT(DISTINCT signal) 
FROM technical_signals_10min 
GROUP BY day;  -- See signal stability
```

**Day 14: Decision Point**

| Accuracy | Decision | Action |
|----------|----------|--------|
| > 70% | Keep TECHNICAL | Drop Twitter, save 648K credits/month |
| 50-70% | Adjust & Retest | Tweak MA/RSI thresholds, test 1 more week |
| < 50% | Revert to Twitter | Change .env, restart (1 minute) |

### Success Criteria

```
✅ Signal Consistency: Don't flip-flop hourly (< 5 changes/day typical)
✅ Accuracy: > 65% match actual price movement
✅ Reliability: Zero crashes, error handling works
✅ Performance: Real-time updates (< 1 sec calculation)
✅ Usability: Dashboard responsive, Telegram useful (not spam)
```

### Fallback Plan

**If signals are bad:**

```bash
# Instant revert (1 minute)
cd /opt/signal-dashboard/backend
sed -i 's/ANALYSIS_STRATEGY=technical/ANALYSIS_STRATEGY=twitter/' .env
pm2 restart signal-dashboard

# Verify
pm2 logs signal-dashboard | grep "Using: TWITTER"
# Expected: "[Analysis] Using: TWITTER"

# Done! Back to Twitter signals
```

See [REVERT_PROCEDURE.md](../../REVERT_PROCEDURE.md) for full revert documentation.

---

## 🎯 KEY DESIGN DECISIONS

### 1. Pure Math (No AI)

**Decision:** All calculations are formula-based math, no AI/ML models
**Rationale:** 
- Zero cost ($0 vs 648K credits/month with AI)
- Instant (<1 second vs 5-10 minute latency with AI)
- Deterministic (reproducible results, no hallucination risk)
- Easier to debug (can trace every calculation)

### 2. 10-Minute Interval

**Decision:** Update signal every 10 minutes
**Rationale:**
- Captures meaningful price movements
- Avoids excessive notifications (still real-time enough)
- Reasonable for trading (faster than hourly, not OCD minute-by-minute)

### 3. Signal-Change-Only Notifications

**Decision:** Only notify when signal changes (BUY→SELL, HOLD→BUY, etc)
**Rationale:**
- Prevents notification spam
- Focuses boss on important changes only
- Confidence updates visible on dashboard (secondary channel)

### 4. 30-Day Rolling History

**Decision:** Keep last 30 days of 10-minute signals, forever daily signals
**Rationale:**
- 30 days sufficient to see patterns and debug issues
- Not excessive storage (4,320 rows/month = tiny)
- Daily signals kept forever (needed for long-term validation)

### 5. Conservative Thresholds

**Decision:** RSI 70/30 (standard), MA confirmation (price > MA50 > MA200)
**Rationale:**
- Proven thresholds in professional trading
- Reduce false signals vs aggressive thresholds
- Quality over quantity approach

### 6. Reversible Architecture

**Decision:** Use analysisFactory pattern, easily switch strategies via .env
**Rationale:**
- Safe to experiment (can revert in 1 minute)
- Can run parallel (HYBRID mode for comparison)
- No risk of breaking Twitter strategy

---

## 📊 SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Cost** | $0 (zero API calls, pure math) |
| **Speed** | <1 second per signal calculation |
| **Update Frequency** | Every 10 minutes (configurable) |
| **Storage** | Daily forever + 30-day rolling 10-min history |
| **Indicators** | MA50, MA200, RSI14, Volume, Macro trend |
| **Output** | Signal + Confidence + Full breakdown |
| **Notifications** | Telegram on signal change only |
| **Error Handling** | Graceful degradation (use cached data) |
| **Validation** | 2-week live test (accuracy measurement) |
| **Revert Time** | 1 minute (change .env + restart) |
| **Risk Level** | Low (reversible, parallel testing possible) |
| **Effort** | 5-6 days implementation + 8 days validation |

---

## 🚀 NEXT STEPS

1. **User Review:** Review this spec for any changes needed
2. **Invoke writing-plans skill:** Create detailed implementation plan
3. **Implementation:** Execute plan with daily progress tracking
4. **Testing:** Run 2-week validation against Twitter signals
5. **Decision:** Keep technical or revert to Twitter based on accuracy

---

**Spec Status:** ✅ Complete & Ready for Review

**Approvals:**
- Design: Approved (all 6 sections)
- Architecture: Approved
- Technical approach: Approved
- Error handling: Approved
- Testing plan: Approved

