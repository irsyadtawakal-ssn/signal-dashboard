# Twitter API Usage & Cost Optimization

## Current Configuration

**API Provider:** twitter.io (api.twitterapi.io) via Apify scraper  
**Token:** `TWITTER_SCRAPER_TOKEN=new1_135071d9f6b84efd9beb7d5e09a92994`  
**Fetch Interval:** Every **5 minutes** (300,000ms)  
**Keywords:** Octra, $OCT, FHE layer1, OCT listing (4 searches per request)  
**Results:** 20 tweets per fetch

## Cost Analysis

| Metric | Current | Daily | Monthly |
|--------|---------|-------|---------|
| Fetch interval | 5 min | 288 calls | ~8,640 calls |
| Tweets fetched | 20 per call | 5,760 tweets | ~172,800 tweets |
| API calls/month | - | - | ~8,640 |

## Pricing

**Apify Twitter Scraper (api.twitterapi.io):**
- Free tier: Limited requests/month
- Paid: Typically $0.02-$0.10 per search
- **Estimated cost @ 8,640 calls/month:** $170-$860/month

## Optimization Strategies

### 1. **Reduce Fetch Frequency** (Highest Impact)

Change interval from **5 min → 30 min**:
```bash
# In .env:
TWITTER_INTERVAL_MS=1800000  # 30 minutes instead of 300000
```

**Impact:**
- Reduces API calls from 288/day → 48/day
- Cost reduction: 83% less
- Dashboard updates tweets every 30 min instead of 5 min

### 2. **Consolidate Keywords** (Medium Impact)

Combine keywords into single search:
```bash
# Instead of 4 separate searches, use OR operator:
TWITTER_KEYWORDS=Octra,$OCT,FHE
# Removes "OCT listing" if less critical
```

**Impact:**
- Slightly reduced API calls (fewer unique searches)

### 3. **Disable Twitter Feed** (Maximum Savings)

If Twitter feed is optional:
```bash
# In .env or code:
DISABLE_TWITTER=true
```

**Impact:**
- Saves all Twitter API costs
- Removes 0 cost
- Users still see technical analysis + price

### 4. **Increase Cache TTL**

Even if fetch fails, show cached tweets longer:
```javascript
// In scheduler.js
const TWITTER_CACHE_TTL = 30 * 60 * 1000; // 30 min instead of auto-refresh
```

### 5. **Smart Scheduling** (Low Impact)

Reduce fetches during low-activity hours (e.g., 2am-6am):
```javascript
const now = new Date().getHours();
const shouldFetch = !(now >= 2 && now <= 6); // Skip 2-6am
if (shouldFetch) { /* fetch tweets */ }
```

**Impact:**
- 6-hour reduction per day = ~4% savings
- Minimal user impact

## Recommended Configuration

**Balanced approach (60% cost reduction):**

```env
# Change from 300000 (5 min) to 900000 (15 min)
TWITTER_INTERVAL_MS=900000

# Reduce keywords from 4 to 3
TWITTER_KEYWORDS=Octra,$OCT,FHE layer1
```

**Result:**
- API calls: 288/day → 96/day (67% reduction)
- Cost: From $170-$860/month → $60-$300/month
- User experience: Tweets update every 15 min (acceptable for social media)

## Aggressive Optimization (95% Cost Reduction)

```env
# Only fetch every hour
TWITTER_INTERVAL_MS=3600000

# Single keyword search
TWITTER_KEYWORDS=Octra
```

**Result:**
- API calls: 288/day → 24/day
- Cost: Estimated $40-$100/month
- Tradeoff: Fewer tweets, less frequent updates

## Monitoring

### Check API Usage

```bash
# View tweets in cache
sqlite3 backend/data/cache.sqlite \
  "SELECT COUNT(*) as tweet_count FROM (SELECT json_extract(value, '$') FROM cache WHERE key='tweets')"

# Monitor fetch frequency
pm2 logs signal-dashboard | grep "tweets" | tail -20
```

### Track Costs

- Monitor Apify account dashboard for actual API usage
- Set alerts if usage exceeds budget
- Review monthly bill

## Implementation

### Option A: 15-Min Interval (Recommended)

```bash
# Edit backend/.env
TWITTER_INTERVAL_MS=900000
TWITTER_KEYWORDS=Octra,$OCT,FHE layer1

# Commit & deploy
git add backend/.env
git commit -m "config: optimize Twitter fetch interval to 15 min"
cd /opt/signal-dashboard && git pull && pm2 restart signal-dashboard
```

### Option B: Disable Temporarily

```bash
# In backend/src/server.js, comment out Twitter scheduler:
// ...(!config.disableTwitter ? [{
//   run: () => runCacheUpdate({...})
// }] : []),
```

### Option C: Cost Cap

Add error handling to skip fetch if budget exceeded:

```javascript
// In scheduler.js
const DAILY_BUDGET = 5; // $5/day max
let dailySpent = 0;

if (dailySpent < DAILY_BUDGET) {
  // Fetch tweets
}
```

## Decision Matrix

| Need | Action | Cost Impact |
|------|--------|------------|
| Real-time Twitter | Keep 5 min | $170-$860/month |
| News updates | 15 min interval | $60-$300/month |
| Background context | 1 hour interval | $20-$100/month |
| Dashboard only | Disable Twitter | $0/month |

## Recommendation

**Start with 15-minute interval.** Monitor actual Apify costs for 1 week, then adjust:
- If <$5/week → keep 15 min
- If $5-10/week → increase to 30 min
- If >$10/week → increase to 1 hour or disable

**Apply change immediately:**
```bash
# backend/.env
TWITTER_INTERVAL_MS=900000
```

Restart backend and monitor costs this week.
