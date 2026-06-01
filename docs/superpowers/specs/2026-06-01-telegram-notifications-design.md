# Telegram Notifications for Buy/Sell Signals - Design

**Date:** 2026-06-01  
**Project:** OCT Signal Intelligence Dashboard  
**Feature:** Telegram push notifications when trading signals change  
**Status:** Design Approved

---

## Goal

Enable users to receive real-time Telegram notifications when the AI analysis generates BUY or SELL signals, allowing traders to stay informed without constantly checking the dashboard.

---

## Feature Overview

When a user triggers analysis (manually or via scheduler), the system:
1. Generates new AI signal (BUY/HOLD/SELL with confidence and components)
2. Compares with previous signal
3. **If signal changed to BUY or SELL:** Sends formatted Telegram notification with full analysis breakdown
4. **If signal unchanged or is HOLD:** Skips notification

Notifications are sent asynchronously and non-blocking — analyze endpoint succeeds regardless of Telegram API status.

---

## Architecture

### Signal Detection Flow

```
User/Scheduler POST /analyze
    ↓
Generate new signal via AI analysis
    ↓
Retrieve previous signal from cache
    ↓
Compare: new signal vs previous signal
    ├─ Signal changed to BUY? → Notify
    ├─ Signal changed to SELL? → Notify
    └─ No change or HOLD → Skip
    ↓
Return analysis result (success regardless of notification status)
```

### Notification Trigger

- **Direct integration:** Notification logic added to `/analyze` endpoint
- **Async/Non-blocking:** Telegram send is `await`-ed but wrapped in try/catch with logging
- **Failure resilient:** If Telegram API fails, analyze endpoint still returns 200 OK
- **User-aware:** Only sends notification if user has connected Telegram chat ID

---

## Notification Message Format

### BUY Signal Example

```
🟢 BUY Signal Detected! (Confidence: 95%)

📈 Price Action: Breakout above $2.15 resistance
😊 Sentiment: Positive (78% positive tweets)
🐦 Twitter Buzz: High engagement (+45%)
📊 Moving Average: Above 50-day MA
📐 Fibonacci: Pullback to 0.618 support

💡 Summary: Strong upward momentum with positive 
sentiment. Ready for entry.

Generated: 2026-06-01 14:35 UTC
```

### SELL Signal Example

```
🔴 SELL Signal Detected! (Confidence: 87%)

📈 Price Action: Failed breakout at $2.50
😞 Sentiment: Negative (62% negative tweets)
🐦 Twitter Buzz: Declining engagement (-35%)
📊 Moving Average: Below 20-day MA
📐 Fibonacci: Resistance at 0.382 level

💡 Summary: Momentum weakening with deteriorating 
sentiment. Consider taking profits.

Generated: 2026-06-01 14:35 UTC
```

**Features:**
- Emoji for quick visual scanning
- All components included (price action, sentiment, Twitter buzz, moving average, Fibonacci)
- Confidence percentage
- Concise summary narrative
- Timestamp in UTC

---

## User Setup Flow

### Step 1: Connect Telegram

User navigates to Settings → Telegram Notifications → clicks "Connect Telegram"

### Step 2: Generate Code

Frontend displays:
```
Send this command to our Telegram bot:
/start 67890ABCD

Bot: @YourSignalBot
```

### Step 3: User Authorizes

User opens Telegram → finds bot → sends `/start 67890ABCD`

### Step 4: Bot Verification

Bot:
1. Receives code + verifies it matches active auth request
2. Saves user's chat ID to database
3. Responds in Telegram: "✅ Telegram connected! You'll now receive buy/sell signals."

### Step 5: Notifications Enabled

From that moment on, BUY/SELL signal changes trigger notifications to user's Telegram chat.

---

## Data Schema

### Users Table (modification)

Add column:
```sql
ALTER TABLE users ADD COLUMN telegramChatId TEXT UNIQUE NULL;
```

Stores Telegram chat ID for each user (null if not connected).

### Failed Notifications Table (new)

```sql
CREATE TABLE failed_notifications (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  signal TEXT NOT NULL,  -- 'BUY' or 'SELL'
  messageId TEXT,
  errorMessage TEXT,
  retryCount INTEGER DEFAULT 0,
  nextRetryAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

Tracks notifications that failed to send, for retry logic.

---

## File Structure

### New Files

**`backend/src/services/telegramNotifier.js`**
- Telegram API client wrapper
- `send(userId, signal, analysis)` — send notification
- `formatMessage(signal, analysis)` — format message with components
- Error handling, logging, non-blocking send

**`backend/src/routes/telegram.js`**
- `POST /telegram/connect` — initiate Telegram connection (return unique code)
- `POST /telegram/verify/:code` — verify code & save chat ID (called by bot)
- Handles code generation, validation, cleanup

**`backend/tests/services/telegramNotifier.test.js`**
- Unit tests: send, format, error handling, retry logic
- Mock Telegram API calls
- Test all components rendered correctly

**`backend/tests/routes/telegram.test.js`**
- Integration tests: connect flow, code validation
- Test race conditions (same user connecting multiple times)

### Modified Files

**`backend/src/routes/analyze.js`**
- Import telegramNotifier
- After analysis completes, check if signal changed
- If changed to BUY/SELL, call `telegramNotifier.send()` (non-blocking)

**`backend/src/db.js`**
- Add migration to create `telegramChatId` column
- Add migration to create `failed_notifications` table

**`backend/src/config.js`**
- Add `TELEGRAM_BOT_TOKEN` (from environment)
- Add `TELEGRAM_API_TIMEOUT` (5000ms default)
- Add `TELEGRAM_MAX_RETRIES` (3 default)

**`backend/src/app.js`**
- Register `/telegram` route

**`backend/src/scheduler.js`**
- Add job: retry failed notifications (every 1 minute)
- Exponential backoff: 1min, 5min, 30min, 1 hour

---

## Error Handling

### Telegram API Failures

If `telegramNotifier.send()` fails:
1. Log error with user ID, signal, error details
2. Store failure in `failed_notifications` table
3. Return immediately (don't block analyze)
4. Analyze endpoint returns 200 OK regardless

### Retry Logic

Scheduled job runs every 1 minute:
1. Query `failed_notifications` WHERE `nextRetryAt <= NOW()` AND `retryCount < 3`
2. Attempt retry for each failed notification
3. If succeeds: delete from table, log success
4. If fails again: increment retryCount, set nextRetryAt = now + exponential backoff
5. If reaches max retries (3): log warning, leave in table for manual inspection

### User Not Connected

If user has no `telegramChatId`:
1. Skip notification silently (no error logged)
2. User will see signal in app when they refresh

---

## Configuration

### Environment Variables

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
```

Obtained from BotFather when creating the bot.

### Config Values (backend/src/config.js)

```javascript
TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
TELEGRAM_API_TIMEOUT: 5000,  // milliseconds
TELEGRAM_MAX_RETRIES: 3,     // attempts
TELEGRAM_RETRY_BACKOFF: [60000, 300000, 1800000, 3600000],  // 1m, 5m, 30m, 1h
```

---

## Testing Strategy

### Unit Tests (telegramNotifier.test.js)

- ✅ Sends notification with correct message format
- ✅ Message includes all components (price, sentiment, Twitter, MA, Fibonacci)
- ✅ Confidence displayed correctly
- ✅ Emoji rendering correct
- ✅ Handles Telegram API timeout gracefully
- ✅ Handles Telegram API 400/401/403 errors
- ✅ Non-blocking (resolves immediately, async in background)
- ✅ Retry stores failure in DB
- ✅ Skips notification if no chat ID (silent, no error)
- ✅ Retry logic: exponential backoff intervals correct
- ✅ Retry logic: stops after max attempts

### Integration Tests (analyze.test.js)

- ✅ Analyze BUY signal → Telegram notif sent
- ✅ Analyze SELL signal → Telegram notif sent
- ✅ Analyze HOLD signal → no notification
- ✅ Signal unchanged (BUY → BUY) → no duplicate notification
- ✅ Signal changes HOLD → BUY → notification sent
- ✅ Analyze succeeds (200) even if Telegram API fails (500)
- ✅ User without Telegram connected → no notification, no error
- ✅ Multiple users with different signals → each gets correct notification

### Integration Tests (telegram.test.js)

- ✅ Generate auth code via `/telegram/connect`
- ✅ Code expires after 10 minutes
- ✅ Invalid code rejected
- ✅ Same user connecting twice invalidates first code
- ✅ Chat ID saved correctly after verification
- ✅ Chat ID unique constraint enforced

### Manual Testing

1. Start bot with `TELEGRAM_BOT_TOKEN` configured
2. User connects via /telegram/connect flow
3. Trigger manual analyze → BUY signal
4. Verify Telegram message received with correct format
5. Simulate Telegram API timeout → verify analyze still succeeds
6. Simulate retry scenario → verify message eventually arrives
7. Test on both desktop and mobile Telegram clients (emojis, formatting)

---

## Success Criteria

✅ **Speed:** BUY/SELL notification sent within 5 seconds of signal generation  
✅ **Content:** Notification includes all 5 components + confidence + summary  
✅ **Reliability:** Analyze endpoint succeeds even if Telegram API fails  
✅ **User Setup:** User can connect Telegram with unique code in <1 minute  
✅ **Retry:** Failed notifications retry automatically with exponential backoff  
✅ **Testing:** All 187 existing tests pass + 25+ new Telegram tests pass  
✅ **Performance:** No measurable impact on analyze endpoint latency  
✅ **Logging:** All failures logged with sufficient context for debugging  

---

## Implementation Phases

**Phase 1: Telegram Service & API Integration**
- Create telegramNotifier service with Telegram API client
- Mock Telegram API in tests
- Implement retry logic with exponential backoff
- ✓ Commit: feat: add telegram notifier service with retry logic

**Phase 2: Signal Change Detection**
- Modify analyze route to compare signals
- Integrate telegramNotifier into analyze endpoint
- Ensure non-blocking behavior (fire-and-forget async)
- ✓ Commit: feat: detect signal changes and trigger telegram notifications

**Phase 3: Telegram Connection Endpoint**
- Create `/telegram/connect` route (generate auth code)
- Create `/telegram/verify/:code` route (save chat ID)
- Database schema update (add telegramChatId column)
- ✓ Commit: feat: add telegram connection/verification endpoint

**Phase 4: Notification Retry Job**
- Create failed_notifications table
- Implement scheduler job for retries
- Exponential backoff logic
- ✓ Commit: feat: add retry job for failed telegram notifications

**Phase 5: Testing & Polish**
- Write all unit and integration tests
- Manual testing on real Telegram
- Polish error messages, logging
- ✓ Commit: test: add comprehensive telegram notification tests

---

## Glossary

- **Telegram Chat ID:** Unique identifier for a user's chat with the bot
- **Auth Code:** 6-digit code generated for user, verified in Telegram bot
- **Signal Change:** Transition from one recommendation (BUY/HOLD/SELL) to another
- **Fire-and-forget:** Async operation that doesn't block the caller
- **Exponential backoff:** Retry delays increase: 1m → 5m → 30m → 1h

---

## Future Extensions

Not in scope for this design, but possible enhancements:
- Telegram group notifications (notify group instead of individual)
- Webhook-based updates (real-time instead of poll-based)
- Notification preferences (BUY only, SELL only, confidence thresholds)
- Message history in Telegram (pinned message with latest signal)
- Two-way Telegram commands (user sends commands from Telegram to trigger analysis)

---

Generated by Brainstorming Skill | Signal Dashboard Telegram Notifications Feature
