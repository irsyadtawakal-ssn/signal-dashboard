# Auto-Analysis Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scheduled background job that runs AI analysis every 10 minutes and sends Telegram notifications to all connected users when signal changes to BUY/SELL or MA direction crosses.

**Architecture:** Move `getMaDirection` to `analysisService.js` as a shared helper. Add `runAnalysisUpdate` to `scheduler.js` following the existing `runPriceUpdate` pattern. Register the job in `server.js` only when both `analyzeFn` and `notifier` are available.

**Tech Stack:** Node.js/Express, better-sqlite3, vitest, node-telegram-bot-api

---

## File Map

| File | Change |
|---|---|
| `backend/src/analysisService.js` | Export `getMaDirection()` — moved from `analyze.js` |
| `backend/src/routes/analyze.js` | Import `getMaDirection` from `analysisService` (remove local definition) |
| `backend/src/config.js` | Add `analysisScheduleIntervalMs` (default 600000) |
| `backend/src/scheduler.js` | Add `runAnalysisUpdate()` |
| `backend/src/server.js` | Register `runAnalysisUpdate` job when both `analyzeFn` and `notifier` exist |
| `backend/tests/scheduler.test.js` | Add `describe('runAnalysisUpdate', ...)` suite |

---

## Task 1: Move `getMaDirection` to `analysisService.js`

**Files:**
- Modify: `backend/src/analysisService.js`
- Modify: `backend/src/routes/analyze.js`

- [ ] **Step 1: Add `getMaDirection` to `analysisService.js`**

Open `backend/src/analysisService.js`. Add this function and update the exports:

```js
const { getCache, setCache } = require('./db');

async function getAnalysis({ db, analyzeFn, ttlMs, force = false, now = Date.now }) {
  const cached = getCache(db, 'analysis');
  if (!force && cached && now() - cached.value.generatedAt < ttlMs) {
    return cached.value;
  }

  const price = getCache(db, 'price');
  const tweets = getCache(db, 'tweets');
  const news = getCache(db, 'news');

  const analysis = await analyzeFn({
    price: price ? price.value : null,
    tweets: tweets ? tweets.value : null,
    news: news ? news.value : null,
  });

  const result = { ...analysis, generatedAt: now() };
  setCache(db, 'analysis', result);
  return result;
}

function getPreviousSignal(db) {
  const lastSignal = getCache(db, 'lastSignal');
  return lastSignal ? lastSignal.value : null;
}

function getMaDirection(maText) {
  if (!maText) return null;
  const lower = maText.toLowerCase();
  if (lower.includes('above')) return 'above';
  if (lower.includes('below')) return 'below';
  return null;
}

module.exports = { getAnalysis, getPreviousSignal, getMaDirection };
```

- [ ] **Step 2: Update `analyze.js` to import `getMaDirection` from `analysisService`**

Open `backend/src/routes/analyze.js`. Replace the top of the file:

```js
const { Router } = require('express');
const { getAnalysis, getPreviousSignal, getMaDirection } = require('../analysisService');
const { setCache, getCache } = require('../db');
```

Then remove the local `getMaDirection` function definition (the 6-line block starting with `function getMaDirection`).

- [ ] **Step 3: Run tests to verify nothing broke**

```
cd backend && npx vitest run tests/analyze.test.js tests/analysisService.test.js
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```
git add backend/src/analysisService.js backend/src/routes/analyze.js
git commit -m "refactor: move getMaDirection to analysisService as shared helper"
```

---

## Task 2: Add `analysisScheduleIntervalMs` to config

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/tests/config.test.js` (check if config tests exist, add if needed)

- [ ] **Step 1: Add config field**

Open `backend/src/config.js`. Inside the returned object, add after `analysisTtlMs`:

```js
analysisTtlMs: Number(env.ANALYSIS_TTL_MS) || 600000,
analysisScheduleIntervalMs: Number(env.ANALYSIS_SCHEDULE_MS) || 600000,
```

- [ ] **Step 2: Run config tests**

```
cd backend && npx vitest run tests/config.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```
git add backend/src/config.js
git commit -m "feat: add analysisScheduleIntervalMs config (default 10 minutes)"
```

---

## Task 3: Add `runAnalysisUpdate` to `scheduler.js` (TDD)

**Files:**
- Modify: `backend/tests/scheduler.test.js`
- Modify: `backend/src/scheduler.js`

- [ ] **Step 1: Write failing tests**

Open `backend/tests/scheduler.test.js`.

First, update the top-level import to include `setCache`:

```js
import { createDb, getCache, setCache } from '../src/db.js';
```

Then, the `beforeEach` block already imports from scheduler. Add `runAnalysisUpdate` to it:

```js
let runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus, runAnalysisUpdate;

beforeEach(async () => {
  vi.resetModules();
  const scheduler = await import('../src/scheduler.js');
  runPriceUpdate = scheduler.runPriceUpdate;
  runCacheUpdate = scheduler.runCacheUpdate;
  startScheduler = scheduler.startScheduler;
  getFailureStatus = scheduler.getFailureStatus;
  runAnalysisUpdate = scheduler.runAnalysisUpdate;
});
```

Then add this describe block at the end of the file (before the last `}`):

```js
describe('runAnalysisUpdate', () => {
  function makeDb() {
    const db = createDb(':memory:');
    return db;
  }

  function addUser(db, id, chatId = null) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
    if (chatId) {
      db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run(chatId, id);
    }
  }


  it('sends notification to all users with telegramChatId when signal changes to BUY', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');
    addUser(db, 'user-2', '222222222');
    addUser(db, 'user-3'); // no chatId

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    let callCount = 0;
    const analyzeFn = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ recommendation: 'BUY', confidence: 0.8, summary: 's', components: {} });
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(2); // user-1 and user-2 only
  });

  it('sends notification to all users with telegramChatId when signal changes to SELL', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'SELL', confidence: 0.7, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('sends notification when MA direction crosses below to above', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'below');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('sends notification when MA direction crosses above to below', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'above');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price fell below 20-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('does not send notification when signal is unchanged', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not send notification when signal changes to HOLD', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not send notification when MA direction is unchanged', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'above');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price still above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not notify users without telegramChatId', async () => {
    const db = makeDb();
    addUser(db, 'user-no-chat'); // no chatId

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('sends only one notification when signal and MA both change', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'below');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.85, summary: 's',
      components: { movingAverage: 'Price above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('returns success even when notifier throws for one user', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');
    addUser(db, 'user-2', '222222222');

    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = {
      send: vi.fn()
        .mockRejectedValueOnce(new Error('Telegram down'))
        .mockResolvedValueOnce({ success: true })
    };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(result.status).toBe('success');
  });

  it('returns failed status when analyzeFn throws', async () => {
    const db = makeDb();
    const mockNotifier = { send: vi.fn() };
    const analyzeFn = vi.fn().mockRejectedValue(new Error('AI API down'));

    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('AI API down');
    expect(result.timestamp).toBeDefined();
    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('returns success with recommendation on successful run', async () => {
    const db = makeDb();
    // setCache imported at top of file
    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn() };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'SELL', confidence: 0.75, summary: 's', components: {}
    });

    addUser(db, 'user-1', '111111111');
    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(result.status).toBe('success');
    expect(result.recommendation).toBe('SELL');
    expect(result.timestamp).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && npx vitest run tests/scheduler.test.js 2>&1 | tail -20
```

Expected: new `runAnalysisUpdate` tests fail with `runAnalysisUpdate is not a function` or similar.

- [ ] **Step 3: Implement `runAnalysisUpdate` in `scheduler.js`**

Open `backend/src/scheduler.js`. Add imports at the top:

```js
const { setCache, getCache } = require('./db');
const { getAnalysis, getPreviousSignal, getMaDirection } = require('./analysisService');
```

Then add this function before `startScheduler`:

```js
async function runAnalysisUpdate({ db, analyzeFn, ttlMs, notifier }) {
  try {
    const result = await getAnalysis({ db, analyzeFn, ttlMs, force: true });
    const newSignal = result.recommendation;
    const previousSignal = getPreviousSignal(db);
    let notificationFired = false;

    // Trigger 1: signal changed to BUY or SELL
    if (previousSignal && previousSignal !== newSignal && ['BUY', 'SELL'].includes(newSignal)) {
      notificationFired = true;
      const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
      for (const user of users) {
        setImmediate(async () => {
          try {
            await notifier.send(result, user.id);
          } catch (err) {
            console.error(`[Scheduler] Signal notification failed for user ${user.id}:`, err.message);
          }
        });
      }
    }

    setCache(db, 'lastSignal', newSignal);

    // Trigger 2: MA direction crossed (only if signal trigger didn't fire)
    if (!notificationFired && result.components) {
      const newMaDir = getMaDirection(result.components.movingAverage);
      const prevMaDirCache = getCache(db, 'lastMADirection');
      const prevMaDir = prevMaDirCache ? prevMaDirCache.value : null;

      if (newMaDir && prevMaDir && newMaDir !== prevMaDir) {
        const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
        for (const user of users) {
          setImmediate(async () => {
            try {
              await notifier.send(result, user.id);
            } catch (err) {
              console.error(`[Scheduler] MA crossover notification failed for user ${user.id}:`, err.message);
            }
          });
        }
      }

      if (newMaDir) {
        setCache(db, 'lastMADirection', newMaDir);
      }
    }

    return { status: 'success', timestamp: Date.now(), recommendation: newSignal };
  } catch (err) {
    console.error('[Scheduler] Analysis update failed:', err.message);
    return { status: 'failed', error: err.message, timestamp: Date.now() };
  }
}
```

Also add `runAnalysisUpdate` to the module exports at the bottom:

```js
module.exports = { runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus, retryFailedNotifications, runAnalysisUpdate };
```

- [ ] **Step 4: Run scheduler tests**

```
cd backend && npx vitest run tests/scheduler.test.js
```

Expected: all tests PASS including the new `runAnalysisUpdate` suite.

- [ ] **Step 5: Run full test suite**

```
cd backend && npx vitest run
```

Expected: all tests PASS, no regressions.

- [ ] **Step 6: Commit**

```
git add backend/src/scheduler.js backend/tests/scheduler.test.js
git commit -m "feat: add runAnalysisUpdate to scheduler with signal and MA crossover detection"
```

---

## Task 4: Register job in `server.js`

**Files:**
- Modify: `backend/src/server.js`

- [ ] **Step 1: Import `runAnalysisUpdate` in `server.js`**

Open `backend/src/server.js`. Find the existing scheduler import line:

```js
const { runPriceUpdate, runCacheUpdate, startScheduler, retryFailedNotifications } = require('./scheduler');
```

Replace with:

```js
const { runPriceUpdate, runCacheUpdate, startScheduler, retryFailedNotifications, runAnalysisUpdate } = require('./scheduler');
```

- [ ] **Step 2: Register the auto-analysis job**

In `server.js`, find the `baseTasks` array definition. After the tweets task, add the analysis job conditionally:

```js
  // Add auto-analysis job if both AI and Telegram are configured
  if (analyzeFn && notifier) {
    baseTasks.push({
      run: () => runAnalysisUpdate({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }),
      intervalMs: config.analysisScheduleIntervalMs,
    });
    console.log(`[Server] Auto-analysis scheduler registered (every ${config.analysisScheduleIntervalMs / 1000 / 60} minutes)`);
  }
```

Place this block **before** the `startScheduler({ tasks: baseTasks })` call.

After this change, the relevant section of `server.js` should look like:

```js
  const baseTasks = [
    { run: () => runPriceUpdate({ db, buildPriceFn }), intervalMs: config.priceIntervalMs },
    {
      run: () => runCacheUpdate({ db, key: 'news', produceFn: () => fetchNews({ limit: 10 }) }),
      intervalMs: config.newsIntervalMs,
    },
    {
      run: () => runCacheUpdate({
        db, key: 'tweets',
        produceFn: () => buildTweets({
          fetchFn: () => fetchTweets({ getJsonFn: getJson, token: config.twitterToken, keywords: config.twitterKeywords }),
          classifyFn,
        }),
      }),
      intervalMs: config.twitterIntervalMs,
    },
  ];

  // Add auto-analysis job if both AI and Telegram are configured
  if (analyzeFn && notifier) {
    baseTasks.push({
      run: () => runAnalysisUpdate({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }),
      intervalMs: config.analysisScheduleIntervalMs,
    });
    console.log(`[Server] Auto-analysis scheduler registered (every ${config.analysisScheduleIntervalMs / 1000 / 60} minutes)`);
  }

  startScheduler({ tasks: baseTasks });
```

- [ ] **Step 3: Run full test suite one last time**

```
cd backend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```
git add backend/src/server.js backend/src/config.js
git commit -m "feat: register auto-analysis scheduler — runs every 10 minutes, notifies all Telegram users on signal/MA change"
```
