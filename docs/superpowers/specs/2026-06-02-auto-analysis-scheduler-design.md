# Auto-Analysis Scheduler with Telegram Notifications - Design

**Date:** 2026-06-02
**Project:** OCT Signal Intelligence Dashboard
**Feature:** Scheduled background analysis that auto-detects signal/MA changes and notifies all connected Telegram users
**Status:** Design Approved

---

## Goal

Run AI analysis automatically every 10 minutes (configurable). When a signal changes to BUY/SELL or the Moving Average direction crosses (above↔below), send Telegram notifications to all users who have connected their Telegram account.

---

## Architecture

### Flow

```
Scheduler (every 10 minutes)
  ↓
runAnalysisUpdate({ db, analyzeFn, ttlMs, notifier })
  ↓
getAnalysis({ db, analyzeFn, ttlMs, force: true })
  ↓
detectSignalChange(newSignal, previousSignal)  ← shared helper in analysisService.js
detectMaCrossover(newComponents, prevMaDir)    ← shared helper in analysisService.js
  ↓
Query: SELECT id FROM users WHERE telegramChatId IS NOT NULL
  ↓
Loop each user → notifier.send(result, userId)  [fire-and-forget per user]
  ↓
setCache lastSignal + lastMADirection
```

### Trigger Rules (same as manual analyze route)

| Condition | Notification |
|---|---|
| Signal changed to BUY | ✅ Send to all connected users |
| Signal changed to SELL | ✅ Send to all connected users |
| MA crossed above→below or below→above | ✅ Send to all connected users |
| Signal and MA both change simultaneously | ✅ One notification (signal trigger wins) |
| Signal unchanged | ❌ Skip |
| Signal changed to HOLD | ❌ Skip |
| MA direction unchanged | ❌ Skip |
| User has no telegramChatId | ❌ Skip silently |

### State Sharing

`lastSignal` and `lastMADirection` are stored in the shared cache. Both the manual route (`analyze.js`) and the scheduler read/write the same keys, so:
- If user manually triggers analysis at 9:55 and scheduler runs at 10:00, no duplicate notification is sent (state already updated by the manual trigger)

---

## File Changes

### `backend/src/analysisService.js`

Move `getMaDirection()` here from `analyze.js` and export it. This makes it a shared helper used by both the route and the scheduler.

```js
function getMaDirection(maText) {
  if (!maText) return null;
  const lower = maText.toLowerCase();
  if (lower.includes('above')) return 'above';
  if (lower.includes('below')) return 'below';
  return null;
}

module.exports = { getAnalysis, getPreviousSignal, getMaDirection };
```

### `backend/src/routes/analyze.js`

Import `getMaDirection` from `analysisService` instead of defining it locally. No behavior change.

### `backend/src/scheduler.js`

Add `runAnalysisUpdate` function following the same pattern as `runPriceUpdate` and `runCacheUpdate`:

```js
async function runAnalysisUpdate({ db, analyzeFn, ttlMs, notifier }) {
  // 1. Run fresh analysis
  // 2. Detect signal change → notify all users if changed to BUY/SELL
  // 3. Detect MA crossover → notify all users if direction changed (only if signal trigger didn't fire)
  // 4. Update lastSignal and lastMADirection in cache
  // 5. Return { status, timestamp, recommendation }
}
```

- Notifications are fire-and-forget (`setImmediate`) per user
- Failures logged but do not throw — scheduler always returns `{ status: 'success' }` even if individual notifications fail
- If `analyzeFn` throws, return `{ status: 'failed', error: ... }`

### `backend/src/config.js`

Add:
```js
analysisScheduleIntervalMs: Number(env.ANALYSIS_SCHEDULE_MS) || 600000, // 10 minutes
```

### `backend/src/server.js`

Register the new scheduled job when both `analyzeFn` and `notifier` are available:

```js
if (analyzeFn && notifier) {
  baseTasks.push({
    run: () => runAnalysisUpdate({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }),
    intervalMs: config.analysisScheduleIntervalMs,
  });
}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `analyzeFn` throws | Log error, return `{ status: 'failed' }`, no notifications sent |
| Individual `notifier.send` fails | Log error per user, continue to next user |
| User disconnected between query and send | `notifier.send` returns `{ skipped: true }`, no error |
| No users with telegramChatId | No notifications, return `{ status: 'success' }` |
| `analyzeFn` or `notifier` not configured | Job not registered — no-op |

---

## Testing

New tests in `backend/tests/scheduler.test.js`:

- `runAnalysisUpdate` sends notification to all users with `telegramChatId` when signal changes to BUY
- `runAnalysisUpdate` sends notification to all users with `telegramChatId` when signal changes to SELL
- `runAnalysisUpdate` sends notification when MA direction crosses
- `runAnalysisUpdate` does NOT send notification when signal unchanged
- `runAnalysisUpdate` does NOT send notification when signal changes to HOLD
- `runAnalysisUpdate` does NOT send notification when MA direction unchanged
- `runAnalysisUpdate` does NOT notify users without `telegramChatId`
- `runAnalysisUpdate` sends only one notification when signal and MA both change
- `runAnalysisUpdate` returns `{ status: 'success' }` even when notifier throws
- `runAnalysisUpdate` returns `{ status: 'failed' }` when `analyzeFn` throws
- `runAnalysisUpdate` notifies multiple users independently (one failure doesn't stop others)

---

## Configuration

### Environment Variable

```bash
ANALYSIS_SCHEDULE_MS=600000  # optional, defaults to 10 minutes
```

### Behavior When Not Configured

- If `TELEGRAM_BOT_TOKEN` is not set: `notifier` is null → job not registered
- If `AI_PROVIDER` keys not set: `analyzeFn` is null → job not registered
- Both must be present for the scheduler to register the job

---

## Success Criteria

✅ Analysis runs automatically every 10 minutes when both AI and Telegram are configured
✅ All connected users receive notification when signal changes to BUY/SELL
✅ All connected users receive notification when MA crosses above↔below
✅ No duplicate notifications (state shared with manual route)
✅ One notification per analysis event (signal trigger wins over MA trigger)
✅ Scheduler never crashes on individual notification failure
✅ All existing tests continue to pass
✅ New scheduler tests cover all trigger/skip scenarios
