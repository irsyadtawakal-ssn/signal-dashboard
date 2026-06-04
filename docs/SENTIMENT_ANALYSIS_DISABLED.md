# Sentiment Analysis Disabled

## Status
**Disabled as of:** 2026-06-04  
**Reason:** Anthropic API credit balance exhausted

## What Was Disabled?

The **Sentiment Analysis Scheduler** (`runAnalysisUpdate`) has been commented out in `backend/src/server.js` (lines 91-97).

This scheduler was responsible for:
- Analyzing Twitter sentiment and news data
- Running AI classification every 10 minutes
- Sending sentiment-based trading recommendations to Telegram

## Why Disabled?

1. **API Credit Exhaustion** - Anthropic API credits ran out, causing:
   ```
   sentiment classification failed: 400 
   "Your credit balance is too low to access the Anthropic API"
   ```

2. **Error Spam** - Sentiment failures were filling error logs every 5 minutes with no benefit

3. **Technical Analysis Sufficient** - The core trading signals come from **Technical Analysis** (price, volume, MA, RSI), which requires no API credits and is fully functional

## Impact

| Feature | Status | Notes |
|---------|--------|-------|
| Technical Analysis | ✅ **Active** | Generates SELL/BUY signals every 10 min |
| Telegram Notifications | ✅ **Active** | Triggered on technical signal changes |
| Dashboard | ✅ **Working** | All core features operational |
| Error Logs | ✅ **Cleaner** | No more sentiment API failures |
| Sentiment Signals | ❌ **Disabled** | Will not generate until re-enabled |

## How to Re-Enable

### Prerequisites
1. Top-up Anthropic API credits at https://console.anthropic.com/account/billing/overview
2. Ensure credits are available and account is in good standing

### Steps

1. **Edit `backend/src/server.js`** (lines 91-97):
   ```javascript
   // Uncomment the block:
   if (analyzeFn && notifier && !config.disableTwitter) {
     baseTasks.push({
       run: () => runAnalysisUpdate({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }),
       intervalMs: config.analysisScheduleIntervalMs,
     });
     console.log(`[Server] Auto-analysis scheduler registered (every ${config.analysisScheduleIntervalMs / 1000 / 60} minutes)`);
   }
   ```

2. **Commit & Push:**
   ```bash
   git add backend/src/server.js
   git commit -m "re-enable: sentiment analysis scheduler (API credits restored)"
   git push origin main
   ```

3. **Deploy to production:**
   ```bash
   cd /opt/signal-dashboard
   git pull origin main
   pm2 restart signal-dashboard
   pm2 logs signal-dashboard
   ```

4. **Verify** - Check logs for:
   ```
   [Server] Auto-analysis scheduler registered (every 10 minutes)
   ```

## Architecture Notes

### Two Independent Signal Pipelines

The system uses **two parallel analysis engines**:

1. **Technical Analysis** (Always On)
   - Input: Price history, volume, moving averages, RSI
   - Cost: None (local calculation)
   - Output: SELL/BUY/HOLD signals at 10-min intervals
   - Reliability: 100% uptime (no external dependencies)

2. **Sentiment Analysis** (Currently Disabled)
   - Input: Twitter API + Anthropic LLM
   - Cost: Anthropic API credits (~$0.003 per analysis)
   - Output: Recommendation with confidence score at 10-min intervals
   - Reliability: Depends on API credits

### Signal Routing
- Both analyzers run independently
- Each sends notifications only when signal **changes** (not every run)
- Notifications are rate-limited (100ms stagger) to prevent API abuse
- Users receive notifications from whichever analyzer detects a change

## Cost Estimation

**If Re-Enabling Sentiment Analysis:**
- Runs every 10 minutes → 144 runs/day
- ~$0.003 per run = ~$0.43/day
- Monthly cost ≈ $13/month

**Recommendation:** Only re-enable if you want redundant signal confirmation. Technical analysis alone provides sufficient trading signals.

## Monitoring

### Check Current Status
```bash
# View logs for analysis errors
pm2 logs signal-dashboard | grep -i "sentiment\|analysis"

# Check database for latest signals
sqlite3 backend/data/cache.sqlite "SELECT * FROM cache WHERE key IN ('lastSignal', 'technicalSignal') ORDER BY updated_at DESC LIMIT 5;"
```

### Expected Behavior (When Disabled)
- No sentiment-related logs
- Only technical analysis logs appear
- Notifications triggered by technical signal changes only

### Expected Behavior (When Re-Enabled)
- Both sentiment and technical logs appear
- Periodic "sentiment classification" messages (every 5 min)
- Notifications from both analyzers (on signal change)
- Potential API credit warnings if balance gets low

## Rollback

If sentiment analysis causes issues after re-enabling:
1. Comment out lines 91-97 again
2. Commit & push
3. Deploy: `cd /opt/signal-dashboard && git pull && pm2 restart signal-dashboard`

Takes ~2 minutes to rollback.
