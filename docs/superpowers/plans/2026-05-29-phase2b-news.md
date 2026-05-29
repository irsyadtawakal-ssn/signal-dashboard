# Phase 2b — CryptoPanic News Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch crypto news headlines from CryptoPanic on an hourly schedule into the `news` cache key, and serve them via a new protected `GET /api/news` endpoint.

**Architecture:** Reuses the Phase 2a pattern exactly. A `sources/cryptopanic.js` fetcher (injectable `getJsonFn`) normalizes CryptoPanic results into `{ title, url, source, publishedAt, sentiment }` and derives a simple bull/bear/neutral sentiment from the post's vote counts (matching the existing v3.1 prototype). A new generic `runCacheUpdate({ db, key, produceFn })` scheduler helper writes any produced value to a cache key (the news task uses it). A `/api/news` route reads the cache. The CryptoPanic public endpoint needs no API key; an optional token is supported via config.

**Tech Stack:** Existing stack — no new dependencies. Uses `getJson` (Phase 2a), `setCache`/`getCache`, `requireAuth`, the existing `scheduler.js` and `routes/cache.js`.

**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` (F6 News Feed; 7.4 cron 1 hour; 7.5 CryptoPanic Free Tier). **Builds on:** Phase 1 + Phase 2a (all merged to `main`; 32 tests passing). The v3.1 prototype used `https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news` and derived sentiment from `item.votes` (positive/liked vs negative/disliked).

---

## File Structure

```
backend/src/
  sources/cryptopanic.js   # NEW: fetchNews({ getJsonFn, token, limit }) -> normalized items
  scheduler.js             # MODIFIED: add generic runCacheUpdate({ db, key, produceFn })
  routes/cache.js          # MODIFIED: add GET /news
  server.js                # MODIFIED: schedule the news task hourly
  config.js                # MODIFIED: add newsIntervalMs + optional cryptopanicToken
backend/tests/
  sources/cryptopanic.test.js   # NEW
  scheduler.test.js             # MODIFIED: add runCacheUpdate cases
  news.test.js                  # NEW (supertest 401/503/200)
  config.test.js                # MODIFIED: assert new fields
```

---

## Task 1: Config fields for news

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/tests/config.test.js`

- [ ] **Step 1: Add failing test**

Append inside the existing `describe('loadConfig', ...)` in `backend/tests/config.test.js`:
```js
  it('parses news config with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.newsIntervalMs).toBe(3600000);
    expect(cfg.cryptopanicToken).toBeUndefined();
  });

  it('reads news config overrides', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      NEWS_INTERVAL_MS: '120000',
      CRYPTOPANIC_TOKEN: 'tok123',
    });
    expect(cfg.newsIntervalMs).toBe(120000);
    expect(cfg.cryptopanicToken).toBe('tok123');
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: FAIL — `newsIntervalMs` undefined.

- [ ] **Step 3: Add the fields in `backend/src/config.js`**

In the returned object, add these two properties (after `priceIntervalMs`):
```js
    newsIntervalMs: Number(env.NEWS_INTERVAL_MS) || 3600000,
    cryptopanicToken: env.CRYPTOPANIC_TOKEN || undefined,
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/config.js backend/tests/config.test.js
git commit -m "feat(backend): add news interval + optional cryptopanic token config"
```

---

## Task 2: CryptoPanic source

**Files:**
- Create: `backend/src/sources/cryptopanic.js`
- Test: `backend/tests/sources/cryptopanic.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/sources/cryptopanic.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchNews } from '../../src/sources/cryptopanic.js';

const sample = {
  results: [
    {
      title: 'OCT hits new high',
      url: 'https://example.com/a',
      published_at: '2026-05-29T10:00:00Z',
      source: { title: 'CoinDesk' },
      votes: { positive: 5, liked: 2, negative: 0, disliked: 0 },
    },
    {
      title: 'Market dips',
      url: 'https://example.com/b',
      published_at: '2026-05-29T09:00:00Z',
      source: { title: 'TheBlock' },
      votes: { positive: 0, negative: 4, disliked: 1 },
    },
    {
      title: 'Sideways action',
      url: 'https://example.com/c',
      published_at: '2026-05-29T08:00:00Z',
      votes: {},
    },
  ],
};

describe('fetchNews', () => {
  it('normalizes results and derives sentiment from votes', async () => {
    const getJsonFn = vi.fn().mockResolvedValue(sample);
    const items = await fetchNews({ getJsonFn });
    expect(items).toEqual([
      { title: 'OCT hits new high', url: 'https://example.com/a', source: 'CoinDesk', publishedAt: '2026-05-29T10:00:00Z', sentiment: 'positive' },
      { title: 'Market dips', url: 'https://example.com/b', source: 'TheBlock', publishedAt: '2026-05-29T09:00:00Z', sentiment: 'negative' },
      { title: 'Sideways action', url: 'https://example.com/c', source: 'CryptoPanic', publishedAt: '2026-05-29T08:00:00Z', sentiment: 'neutral' },
    ]);
  });

  it('uses the public endpoint when no token is given', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: [] });
    await fetchNews({ getJsonFn });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news',
      expect.any(Object)
    );
  });

  it('uses the auth_token endpoint when a token is given', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: [] });
    await fetchNews({ getJsonFn, token: 'tok123' });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://cryptopanic.com/api/v1/posts/?auth_token=tok123&filter=hot&kind=news',
      expect.any(Object)
    );
  });

  it('returns an empty array when results are missing', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({});
    expect(await fetchNews({ getJsonFn })).toEqual([]);
  });

  it('caps results at limit', async () => {
    const many = { results: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, published_at: 'x', votes: {} })) };
    const getJsonFn = vi.fn().mockResolvedValue(many);
    const items = await fetchNews({ getJsonFn, limit: 3 });
    expect(items).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/sources/cryptopanic.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/sources/cryptopanic.js`**

```js
const { getJson } = require('../http');

function deriveSentiment(votes = {}) {
  const positive = (votes.positive || 0) + (votes.liked || 0);
  const negative = (votes.negative || 0) + (votes.disliked || 0);
  if (positive > negative + 1) return 'positive';
  if (negative > positive + 1) return 'negative';
  return 'neutral';
}

async function fetchNews({ getJsonFn = getJson, token, limit = 10 }) {
  const url = token
    ? `https://cryptopanic.com/api/v1/posts/?auth_token=${token}&filter=hot&kind=news`
    : `https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news`;

  const data = await getJsonFn(url, {});
  const results = Array.isArray(data && data.results) ? data.results : [];

  return results.slice(0, limit).map((item) => ({
    title: item.title,
    url: item.url,
    source: (item.source && item.source.title) || 'CryptoPanic',
    publishedAt: item.published_at,
    sentiment: deriveSentiment(item.votes),
  }));
}

module.exports = { fetchNews };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/sources/cryptopanic.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sources/cryptopanic.js backend/tests/sources/cryptopanic.test.js
git commit -m "feat(backend): add CryptoPanic news source with vote-based sentiment"
```

---

## Task 3: Generic cache-update scheduler helper

Adds a generic `runCacheUpdate` alongside the existing `runPriceUpdate` (which stays unchanged). The news task uses the generic version.

**Files:**
- Modify: `backend/src/scheduler.js`
- Modify: `backend/tests/scheduler.test.js`

- [ ] **Step 1: Add failing tests**

Append a new `describe` block to `backend/tests/scheduler.test.js` (keep existing imports; add `runCacheUpdate` to the import from `../src/scheduler.js`):
```js
import { runPriceUpdate, runCacheUpdate, startScheduler } from '../src/scheduler.js';
```
```js
describe('runCacheUpdate', () => {
  it('writes the produced value under the given key', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockResolvedValue([{ title: 'hi' }]);
    await runCacheUpdate({ db, key: 'news', produceFn });
    expect(getCache(db, 'news').value).toEqual([{ title: 'hi' }]);
  });

  it('does not throw and skips write when produceFn fails', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runCacheUpdate({ db, key: 'news', produceFn })).resolves.toBeUndefined();
    expect(getCache(db, 'news')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/scheduler.test.js`
Expected: FAIL — `runCacheUpdate` is not exported.

- [ ] **Step 3: Add `runCacheUpdate` to `backend/src/scheduler.js`**

Add this function and include it in `module.exports` (leave `runPriceUpdate` and `startScheduler` unchanged):
```js
async function runCacheUpdate({ db, key, produceFn }) {
  try {
    const value = await produceFn();
    setCache(db, key, value);
  } catch (err) {
    console.error(`cache update failed for ${key}:`, err.message);
  }
}
```
Update exports to:
```js
module.exports = { runPriceUpdate, runCacheUpdate, startScheduler };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/scheduler.test.js`
Expected: PASS (5 tests — 2 price/cacheUpdate pairs + 1 scheduler).

- [ ] **Step 5: Commit**

```bash
git add backend/src/scheduler.js backend/tests/scheduler.test.js
git commit -m "feat(backend): add generic runCacheUpdate scheduler helper"
```

---

## Task 4: GET /api/news route

**Files:**
- Modify: `backend/src/routes/cache.js`
- Test: `backend/tests/news.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/news.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, setCache } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

let app, db;
beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET } });
});

describe('GET /api/news', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(401);
  });

  it('returns 503 when authed but cache is empty', async () => {
    const res = await request(app).get('/api/news').set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(503);
  });

  it('returns cached news when authed and cache is warm', async () => {
    const items = [{ title: 'OCT news', url: 'https://x', source: 'CP', publishedAt: 'now', sentiment: 'positive' }];
    setCache(db, 'news', items);
    const res = await request(app).get('/api/news').set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/news.test.js`
Expected: FAIL — `/api/news` 404s (route not defined), so 503/200 assertions fail.

- [ ] **Step 3: Add the route in `backend/src/routes/cache.js`**

Inside `module.exports = function cacheRoute({ db }) { ... }`, after the existing `r.get('/price', ...)` block and before `return r;`, add:
```js
  r.get('/news', (req, res) => {
    const hit = getCache(db, 'news');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });
```
(`getCache` is already imported at the top of this file.)

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/news.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/cache.js backend/tests/news.test.js
git commit -m "feat(backend): add protected /api/news route reading from cache"
```

---

## Task 5: Schedule the news task + docs + smoke

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

- [ ] **Step 1: Wire the news task into `backend/src/server.js`**

Add the require near the other source requires:
```js
const { fetchNews } = require('./sources/cryptopanic');
```
Change the destructure of scheduler to include `runCacheUpdate`:
```js
const { runPriceUpdate, runCacheUpdate, startScheduler } = require('./scheduler');
```
Add a second task to the `startScheduler({ tasks: [ ... ] })` array (after the price task):
```js
      {
        run: () =>
          runCacheUpdate({
            db,
            key: 'news',
            produceFn: () => fetchNews({ getJsonFn: getJson, token: config.cryptopanicToken }),
          }),
        intervalMs: config.newsIntervalMs,
      },
```

- [ ] **Step 2: Append to `backend/.env.example`**

```bash

# News refresh interval in ms (default 1 hour)
NEWS_INTERVAL_MS=3600000
# Optional CryptoPanic API token (free public endpoint used if blank)
# CRYPTOPANIC_TOKEN=
```

- [ ] **Step 3: Update `backend/README.md`**

Add under `## Endpoints`:
```markdown
- `GET /api/news` — **protected**; returns cached crypto-news items
  `[{ title, url, source, publishedAt, sentiment }]`, or `503` until the first
  scheduled fetch completes.
```
And in the `## Background jobs` section, add a sentence:
```markdown
A news update (CryptoPanic, hourly by default via `NEWS_INTERVAL_MS`) writes the
`news` cache key. The free public endpoint is used unless `CRYPTOPANIC_TOKEN` is set.
```

- [ ] **Step 4: Full suite + smoke test**

Run: `cd backend && npm test` → Expected: ALL pass.

Live smoke (real network, no token needed — the public endpoint):
```bash
cd backend
node -e "const {getJson}=require('./src/http');const {fetchNews}=require('./src/sources/cryptopanic');fetchNews({getJsonFn:getJson,limit:3}).then(r=>console.log('news ok',JSON.stringify(r,null,2))).catch(e=>console.error('news ERR',e.message));"
```
Expected: `news ok` followed by up to 3 normalized items with real titles/urls.
NOTE: CryptoPanic's public endpoint sometimes rate-limits or requires a token depending on their current policy. If it returns an error or empty array, that's acceptable for this task — REPORT the actual output (status DONE_WITH_CONCERNS). The unit tests already prove the normalization logic; the live endpoint behavior can be tuned later (e.g. by setting `CRYPTOPANIC_TOKEN`). Do NOT change the endpoint URL to chase a 200 — report instead.

- [ ] **Step 5: Commit + push**

```bash
git add backend/src/server.js backend/.env.example backend/README.md
git commit -m "feat(backend): schedule hourly CryptoPanic news updates into cache"
git push origin <current-branch>
```

---

## Done Criteria (Phase 2b)

- [ ] `npm test` passes all suites including new `cryptopanic` and `news` tests.
- [ ] `fetchNews` normalizes CryptoPanic results to `{ title, url, source, publishedAt, sentiment }` and derives bull/bear/neutral from votes.
- [ ] News fetcher uses the public endpoint by default, the `auth_token` endpoint when `CRYPTOPANIC_TOKEN` is set.
- [ ] Server schedules an hourly news update writing the `news` cache key (via generic `runCacheUpdate`).
- [ ] `GET /api/news` returns `401` unauthed, `503` cold, `200` with cached items when warm.
- [ ] Live smoke output reported (real items, or a noted limitation if the public endpoint is restricted).

## Out of Scope (later sub-plans)

- **Phase 2c:** Twitter scraper (Apify/Xpoz) + Claude Sonnet sentiment classification (prompt caching) + Opus on-demand `/api/analyze` + `/api/tweets`.
- **Phase 3:** Supabase login UI + frontend v3.1 wiring + VPS deploy.
