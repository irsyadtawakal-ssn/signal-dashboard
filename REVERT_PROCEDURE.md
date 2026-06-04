# 🔄 REVERT PROCEDURE: Switch Between Analysis Strategies

**Last Updated:** 2026-06-03  
**Purpose:** Quick reference guide untuk switch/revert antara Twitter dan Technical analysis strategies

---

## 📋 TABLE OF CONTENTS

1. [Quick Revert (1 menit)](#quick-revert)
2. [Git-based Revert (5 menit)](#git-revert)
3. [Local Testing Revert (30 menit)](#local-testing)
4. [Emergency Fallback Chain](#emergency-fallback)
5. [Verification Checklist](#verification)

---

## 🚀 QUICK REVERT (1 MENIT)

**Best for:** Emergency switch, quick fallback

### Step 1: SSH ke VPS

```bash
ssh root@signal-dashboard.web.id
```

### Step 2: Edit .env

```bash
cd /opt/signal-dashboard/backend
nano .env
```

**Find & Replace:**
```
# FROM:
ANALYSIS_STRATEGY=technical

# TO:
ANALYSIS_STRATEGY=twitter
```

**Save:** `Ctrl+X` → `Y` → `Enter`

### Step 3: Restart PM2

```bash
pm2 restart signal-dashboard
sleep 5
pm2 status
```

Expected output:
```
id │ name              │ namespace   │ version │ mode     │ status      │ restart 
─────────────────────────────────────────────────────────────────────────────
0  │ signal-dashboard  │ default     │ 1.0.0   │ fork     │ online  ✓  │ 0
```

### Step 4: Verify Switch

```bash
# Check logs
pm2 logs signal-dashboard | grep "Using:"

# Expected: "[Analysis] Using: TWITTER"
```

**✅ DONE! Selesai dalam 1 menit**

---

## 🔀 GIT-BASED REVERT (5 MENIT)

**Best for:** Production safe, tracked changes

### If Need Revert After Commit

```bash
cd /opt/signal-dashboard

# 1. Check history
git log --oneline | head -10

# 2. Revert specific commit
git revert <commit_hash> --no-edit

# Or reset ke sebelum technical added
git reset --hard <commit_before_technical>

# 3. Restart
pm2 restart signal-dashboard
```

**Example:**
```bash
# Commits:
# abc1234 feat: add technical analysis
# def5678 feat: add analysisFactory  
# 123abcd fix: twitter interval

# Revert ke sebelum technical
git reset --hard 123abcd
git pull origin main
pm2 restart signal-dashboard
```

---

## 🧪 LOCAL TESTING REVERT (30 MENIT)

**Best for:** High confidence, tested first

### Step 1: Test Lokal dengan Twitter

```bash
cd backend

# Edit .env lokal
ANALYSIS_STRATEGY=twitter

# Run lokal
npm start

# Di terminal lain, test
curl http://localhost:3001/api/cache?key=lastSignal
```

### Step 2: Verify Works

```bash
# Harusnya output:
{
  "signal": "BUY",
  "strategy": "TWITTER",  ← Check ini
  "confidence": 0.75,
  ...
}
```

### Step 3: Monitor Lokal (30 menit)

- Check console: `[Analysis] Using: TWITTER`
- Verify signals generate normal
- Check Telegram notification work

### Step 4: Deploy ke VPS

```bash
# Commit lokal changes
git add backend/.env
git commit -m "revert: switch back to twitter strategy (tested)"
git push origin main

# SSH ke VPS
ssh root@signal-dashboard.web.id
cd /opt/signal-dashboard
git pull
pm2 restart signal-dashboard

# Verify
pm2 logs signal-dashboard | head -20
```

---

## 🚨 EMERGENCY FALLBACK CHAIN

```
┌─────────────────────────────────────────┐
│ TECHNICAL SIGNALS JELEK/ERROR           │
└──────────────┬──────────────────────────┘
               ↓
        OPTION 1: Quick Revert
        ├─ Change .env: ANALYSIS_STRATEGY=twitter
        ├─ pm2 restart signal-dashboard
        ├─ Time: 1 menit
        └─ Risk: NONE
               ↓
       OPTION 2: If Twitter Also Jelek
       ├─ Check API status:
       │  ├─ TwitterAPI.io down?
       │  ├─ OpenRouter down?
       │  └─ DexScreener working?
       ├─ Check logs: pm2 logs signal-dashboard
       └─ Manual signal (boss decide)
               ↓
       OPTION 3: Switch to HYBRID (Compare)
       ├─ ANALYSIS_STRATEGY=hybrid
       ├─ See both signals side-by-side
       ├─ Choose better one
       └─ Debug which component jelek
```

---

## ✅ VERIFICATION CHECKLIST

### After Revert, Verify:

```bash
# 1. Check strategy changed
curl http://localhost:3001/api/cache?key=lastSignal | jq .strategy

# Expected: "TWITTER"

# 2. Check logs
pm2 logs signal-dashboard | grep "Using:"

# Expected: "[Analysis] Using: TWITTER"

# 3. Check signal generating
pm2 logs signal-dashboard | grep -E "BUY|SELL|HOLD"

# 4. Test full flow
curl http://localhost:3001/api/health

# Expected: { "status": "ok" }

# 5. Telegram notification
# Wait untuk signal change, verify notif sampai

# 6. Dashboard display
# Buka browser http://signal-dashboard.web.id
# Check signal display updated
```

---

## 🔧 TROUBLESHOOTING REVERT

### Problem: PM2 Restart Hang

```bash
# Force stop
pm2 kill

# Restart PM2 daemon
pm2 start ecosystem.config.js

# Check status
pm2 status
```

### Problem: Still Showing Technical

```bash
# 1. Verify .env really changed
cat /opt/signal-dashboard/backend/.env | grep ANALYSIS_STRATEGY

# Expected: ANALYSIS_STRATEGY=twitter

# 2. Force restart
pm2 restart signal-dashboard --force

# 3. Check if code compiled correctly
npm run build  # (if applicable)
```

### Problem: Telegram Still Not Working

```bash
# 1. Check Telegram bot token
cat backend/.env | grep TELEGRAM

# 2. Check notifier logs
pm2 logs signal-dashboard | grep -i "telegram\|notif"

# 3. Check database has users
sqlite3 backend/data/cache.sqlite "SELECT * FROM users LIMIT 5;"
```

---

## 📊 SCENARIO EXAMPLES

### Scenario 1: Day 7, Technical Signals Jelek

```
Boss: "Ini technical analysis jelek, balik ke Twitter!"
Time: 09:00

Action (1 menit):
─────────────────────────────────
ssh root@signal-dashboard.web.id
cd /opt/signal-dashboard/backend
sed -i 's/ANALYSIS_STRATEGY=technical/ANALYSIS_STRATEGY=twitter/' .env
pm2 restart signal-dashboard
sleep 5
curl http://localhost:3001/api/cache?key=lastSignal | jq .strategy
─────────────────────────────────

Time: 09:05
Result: Dashboard show "Using: TWITTER" ✅
Boss: "Good! Balik normal"
```

### Scenario 2: Day 14, Compare Technical vs Twitter

```
Boss: "Coba bandingkan, mana lebih akurat?"
Time: 09:00

Action (3 menit):
─────────────────────────────────
# Switch ke HYBRID (run both)
ssh root@signal-dashboard.web.id
cd /opt/signal-dashboard/backend
sed -i 's/ANALYSIS_STRATEGY=technical/ANALYSIS_STRATEGY=hybrid/' .env
pm2 restart signal-dashboard

# Monitor dashboard
# See both signals side-by-side
# {
#   "signal": "BUY",
#   "components": {
#     "twitter": { "signal": "HOLD", ... },
#     "technical": { "signal": "BUY", ... }
#   }
# }
─────────────────────────────────

Time: 09:05
Result: Dashboard show HYBRID with breakdown ✅
Boss: "Ah, technical lebih akurat! Keep technical"
```

### Scenario 3: Emergency Production Issue

```
18:30 - Production error!
Boss: "Revert ASAP!"

Action (2 menit):
─────────────────────────────────
ssh root@signal-dashboard.web.id
cd /opt/signal-dashboard/backend
sed -i 's/ANALYSIS_STRATEGY=technical/ANALYSIS_STRATEGY=twitter/' .env
pm2 restart signal-dashboard --force
pm2 logs signal-dashboard
curl http://localhost:3001/api/health
─────────────────────────────────

18:35 - Back online ✅
Boss: "Good. Investigate sambil pakai Twitter dulu"
```

---

## 🎯 QUICK REFERENCE COMMANDS

```bash
# ============================================
# SWITCH STRATEGIES (choose one)
# ============================================

# To TWITTER
cd /opt/signal-dashboard/backend
sed -i 's/ANALYSIS_STRATEGY=.*/ANALYSIS_STRATEGY=twitter/' .env
pm2 restart signal-dashboard

# To TECHNICAL
sed -i 's/ANALYSIS_STRATEGY=.*/ANALYSIS_STRATEGY=technical/' .env
pm2 restart signal-dashboard

# To HYBRID
sed -i 's/ANALYSIS_STRATEGY=.*/ANALYSIS_STRATEGY=hybrid/' .env
pm2 restart signal-dashboard

# ============================================
# VERIFY SWITCH
# ============================================

# Check which strategy active
curl http://localhost:3001/api/cache?key=lastSignal | jq .strategy

# Check logs
pm2 logs signal-dashboard | grep "Using:"

# Full health check
pm2 status && curl http://localhost:3001/api/health

# ============================================
# EMERGENCY (if stuck)
# ============================================

# Kill all PM2 processes
pm2 kill

# Restart from config
cd /opt/signal-dashboard
pm2 start ecosystem.config.js

# Check again
pm2 status
```

---

## 📝 NOTES

- **All strategies use same data sources:** DexScreener, CoinGecko, TwitterAPI.io
- **No data loss during switch:** All cache preserved
- **No code recompilation needed:** Just restart PM2
- **Can switch anytime:** Production safe
- **Easy to test:** Use HYBRID mode to compare both

---

## 🔗 RELATED FILES

- `backend/.env` - Configuration file (ANALYSIS_STRATEGY)
- `backend/src/ai/analysisFactory.js` - Strategy selector
- `backend/src/ai/analysis.js` - Twitter strategy (existing)
- `backend/src/ai/technicalAnalysis.js` - Technical strategy (new)
- `backend/src/scheduler.js` - Uses factory to run analysis

---

**Last Tested:** 2026-06-03  
**Status:** ✅ VERIFIED & PRODUCTION READY
