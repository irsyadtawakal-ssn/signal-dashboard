# Phase 2d — `POST /api/analyze` (Opus On-Demand) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated `POST /api/analyze` that feeds cached `price` + `tweets` + `news` to Claude Opus (via the reused Phase 2c `complete()` abstraction), returns a structured BUY/HOLD/SELL analysis, and caches the result with a TTL + `force` bypass — all mock-first (no API keys needed to pass tests).

**Architecture:** `ai/analysis.js` (`analyzeMarket`) is provider-agnostic and calls the injected `complete({ system, user, model })` once with an Opus model; it throws on failure/malformed output. `analysisService.js` (`getAnalysis`) is the cost guard (cache-if-fresh + force). `routes/analyze.js` exposes `POST /` (503 no-key / 502 fail / 200). `server.js` builds `analyzeFn` and passes it into `createApp`.

**Tech Stack:** Existing stack (Express, better-sqlite3, vitest, supertest). No new dependencies — reuses `complete()` adapters, `getCache`/`setCache`, `requireAuth`.

**Reference spec:** `docs/superpowers/specs/2026-05-29-phase2d-analyze-design.md`. **Builds on:** Phase 1 + 2a + 2b + 2c (merged to `main`; 69 tests passing).

---

## File Structure

```
backend/src/
  config.js              # MODIFIED: analysisTtlMs + analysisModel
  ai/analysis.js         # NEW: analyzeMarket({ price, tweets, news, complete, model })
  analysisService.js     # NEW: getAnalysis({ db, analyzeFn, ttlMs, force, now })
  routes/analyze.js      # NEW: POST / (503/502/200)
  app.js                 # MODIFIED: createApp({ db, config, analyzeFn }) + mount analyze route
  server.js              # MODIFIED: build analyzeFn (Opus model), pass into createApp
backend/tests/
  config.test.js         # MODIFIED: assert new fields
  ai/analysis.test.js    # NEW
  analysisService.test.js# NEW
  analyze.test.js        # NEW (supertest 401/503/502/200 + force)
backend/.env.example     # MODIFIED
backend/README.md        # MODIFIED
```

Reference (already in the codebase, do not change):
- `getCache(db, key)` returns `{ value, updatedAt }` or `null`. `setCache(db, key, value)` JSON-stores `value`.
- `complete({ system, user, model })` is the AI interface from Phase 2c; the `model` arg overrides the adapter default per call.
- `app.js` currently: `app.use('/api', requireAuth(config), cacheRoute({ db }))` after `app.use(express.json())`.

---

## Task 1: Config fields for analysis

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/tests/config.test.js`

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe('loadConfig', ...)` in `backend/tests/config.test.js`:
```js
  it('parses analysis config with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.analysisTtlMs).toBe(600000);
    expect(cfg.analysisModel).toBeUndefined();
  });

  it('reads analysis config overrides', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret', ANALYSIS_TTL_MS: '60000', ANALYSIS_MODEL: 'custom-opus' });
    expect(cfg.analysisTtlMs).toBe(60000);
    expect(cfg.analysisModel).toBe('custom-opus');
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: FAIL — `analysisTtlMs` undefined.

- [ ] **Step 3: Add the fields in `backend/src/config.js`**

In the returned object, add after the `twitterKeywords` block:
```js
    analysisTtlMs: Number(env.ANALYSIS_TTL_MS) || 600000,
    analysisModel: env.ANALYSIS_MODEL || undefined,
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config.js backend/tests/config.test.js
git commit -m "feat(backend): add analysis TTL + model config fields"
```

---

## Task 2: analyzeMarket (provider-agnostic Opus analysis)

Depends only on the injected `complete`. Makes ONE call. **Throws** on rejection / malformed JSON / invalid recommendation (on-demand → surface errors; do not fabricate a HOLD). Does NOT add `generatedAt` (the service does that).

**Files:**
- Create: `backend/src/ai/analysis.js`
- Test: `backend/tests/ai/analysis.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/ai/analysis.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { analyzeMarket } from '../../src/ai/analysis.js';

const price = { oct: 0.21, btc: 68000 };
const tweets = [{ id: '1', text: 'OCT up', sentiment: 'Bullish' }];
const news = [{ title: 'OCT listed', sentiment: 'positive' }];

const goodReply = JSON.stringify({
  recommendation: 'BUY',
  confidence: 0.8,
  summary: 'Momentum positive',
  components: { priceAction: 'up', sentiment: 'bullish', twitterBuzz: 'high', movingAverage: 'above', fibonacci: 'near 0.5' },
});

describe('analyzeMarket', () => {
  it('makes a single call with a system prompt + data payload and returns the structured analysis', async () => {
    const complete = vi.fn().mockResolvedValue(goodReply);
    const result = await analyzeMarket({ price, tweets, news, complete, model: 'opus-x' });

    expect(complete).toHaveBeenCalledTimes(1);
    const arg = complete.mock.calls[0][0];
    expect(typeof arg.system).toBe('string');
    expect(arg.system.length).toBeGreaterThan(0);
    expect(arg.model).toBe('opus-x');
    expect(arg.user).toContain('68000'); // price data present
    expect(arg.user).toContain('Bullish'); // tweet data present

    expect(result).toEqual({
      recommendation: 'BUY',
      confidence: 0.8,
      summary: 'Momentum positive',
      components: { priceAction: 'up', sentiment: 'bullish', twitterBuzz: 'high', movingAverage: 'above', fibonacci: 'near 0.5' },
    });
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const complete = vi.fn().mockResolvedValue('```json\n' + goodReply + '\n```');
    const result = await analyzeMarket({ price, tweets, news, complete });
    expect(result.recommendation).toBe('BUY');
  });

  it('passes null for missing data sections', async () => {
    const complete = vi.fn().mockResolvedValue(goodReply);
    await analyzeMarket({ price: null, tweets: null, news: null, complete });
    expect(complete.mock.calls[0][0].user).toBe(JSON.stringify({ price: null, tweets: null, news: null }));
  });

  it('throws when the reply has no JSON object', async () => {
    const complete = vi.fn().mockResolvedValue('sorry, I cannot help');
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow();
  });

  it('throws when the recommendation is invalid', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ recommendation: 'MAYBE', summary: 'x' }));
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow('invalid recommendation');
  });

  it('propagates a rejected complete call', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('opus down'));
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow('opus down');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/ai/analysis.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/ai/analysis.js`**

```js
const VALID = new Set(['BUY', 'HOLD', 'SELL']);

const SYSTEM_PROMPT = [
  'You are a senior crypto trading analyst for the token Octra (OCT).',
  'You are given JSON with the latest cached market data: { price, tweets, news }.',
  'Any field may be null if that data is temporarily unavailable — reason with what you have',
  'and note the gap in your summary.',
  'Produce ONE combined recommendation and per-component reasoning.',
  'Respond with ONLY a JSON object (no prose, no markdown), of the exact shape:',
  '{',
  '  "recommendation": "BUY|HOLD|SELL",',
  '  "confidence": <number 0..1>,',
  '  "summary": "<2-4 sentence narrative>",',
  '  "components": {',
  '    "priceAction": "<one line>",',
  '    "sentiment": "<one line>",',
  '    "twitterBuzz": "<one line>",',
  '    "movingAverage": "<one line>",',
  '    "fibonacci": "<one line>"',
  '  }',
  '}',
].join('\n');

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object in analysis reply');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function analyzeMarket({ price, tweets, news, complete, model }) {
  const user = JSON.stringify({ price: price || null, tweets: tweets || null, news: news || null });
  const reply = await complete({ system: SYSTEM_PROMPT, user, model });
  const parsed = extractJsonObject(reply);

  if (!VALID.has(parsed.recommendation)) {
    throw new Error(`invalid recommendation: ${parsed.recommendation}`);
  }

  return {
    recommendation: parsed.recommendation,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    summary: parsed.summary || '',
    components: parsed.components || {},
  };
}

module.exports = { analyzeMarket, SYSTEM_PROMPT };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/ai/analysis.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/analysis.js backend/tests/ai/analysis.test.js
git commit -m "feat(backend): add provider-agnostic Opus market analysis"
```

---

## Task 3: getAnalysis (cost-guard service)

**Files:**
- Create: `backend/src/analysisService.js`
- Test: `backend/tests/analysisService.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/analysisService.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { getAnalysis } from '../src/analysisService.js';
import { createDb, getCache, setCache } from '../src/db.js';

const sample = { recommendation: 'BUY', confidence: 0.7, summary: 's', components: {} };

describe('getAnalysis', () => {
  it('returns the cached analysis without calling analyzeFn when fresh and not forced', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn();
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 10000, now: () => 5000 });
    expect(analyzeFn).not.toHaveBeenCalled();
    expect(result).toMatchObject(sample);
  });

  it('re-runs when force is true even if cache is fresh', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn().mockResolvedValue({ ...sample, recommendation: 'SELL' });
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 10000, force: true, now: () => 5000 });
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    expect(result.recommendation).toBe('SELL');
  });

  it('re-runs when the cached analysis is older than the TTL', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    await getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 50000 });
    expect(analyzeFn).toHaveBeenCalledTimes(1);
  });

  it('gathers price/tweets/news from cache (null when cold) and stamps generatedAt', async () => {
    const db = createDb(':memory:');
    setCache(db, 'price', { oct: 0.2 });
    // tweets + news intentionally cold
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 777 });

    expect(analyzeFn).toHaveBeenCalledWith({ price: { oct: 0.2 }, tweets: null, news: null });
    expect(result.generatedAt).toBe(777);
    expect(getCache(db, 'analysis').value).toEqual({ ...sample, generatedAt: 777 });
  });

  it('does not cache and propagates when analyzeFn throws', async () => {
    const db = createDb(':memory:');
    const analyzeFn = vi.fn().mockRejectedValue(new Error('opus down'));
    await expect(getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 1 })).rejects.toThrow('opus down');
    expect(getCache(db, 'analysis')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/analysisService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/analysisService.js`**

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

module.exports = { getAnalysis };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/analysisService.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/analysisService.js backend/tests/analysisService.test.js
git commit -m "feat(backend): add getAnalysis cost-guard service (cache TTL + force)"
```

---

## Task 4: POST /api/analyze route + app wiring

**Files:**
- Create: `backend/src/routes/analyze.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/analyze.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/analyze.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

const sample = { recommendation: 'BUY', confidence: 0.8, summary: 's', components: {} };

function makeApp(analyzeFn) {
  const db = createDb(':memory:');
  const app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET, analysisTtlMs: 600000 }, analyzeFn });
  return app;
}

describe('POST /api/analyze', () => {
  it('returns 401 without a token', async () => {
    const res = await request(makeApp(vi.fn())).post('/api/analyze').send({});
    expect(res.status).toBe(401);
  });

  it('returns 503 when no analyzeFn is configured', async () => {
    const res = await request(makeApp(undefined))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(503);
  });

  it('returns 200 with the analysis (incl. generatedAt) when configured', async () => {
    const res = await request(makeApp(vi.fn().mockResolvedValue(sample)))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(sample);
    expect(typeof res.body.generatedAt).toBe('number');
  });

  it('returns 502 when analysis fails', async () => {
    const res = await request(makeApp(vi.fn().mockRejectedValue(new Error('opus down'))))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(502);
  });

  it('caches: a second call without force does not re-run; force:true does', async () => {
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    const app = makeApp(analyzeFn);
    const auth = `Bearer ${signTestToken()}`;
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
    expect(analyzeFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/analyze.test.js`
Expected: FAIL — `createApp` does not mount `/api/analyze` (most assertions fail).

- [ ] **Step 3: Create `backend/src/routes/analyze.js`**

```js
const { Router } = require('express');
const { getAnalysis } = require('../analysisService');

module.exports = function analyzeRoute({ db, analyzeFn, ttlMs }) {
  const r = Router();

  r.post('/', async (req, res) => {
    if (!analyzeFn) return res.status(503).json({ error: 'analysis unavailable' });
    const force = !!(req.body && req.body.force === true);
    try {
      const result = await getAnalysis({ db, analyzeFn, ttlMs, force });
      return res.json(result);
    } catch (err) {
      console.error('analyze failed:', err.message);
      return res.status(502).json({ error: 'analysis failed' });
    }
  });

  return r;
};
```

- [ ] **Step 4: Modify `backend/src/app.js`**

Add the require near the other route requires:
```js
const analyzeRoute = require('./routes/analyze');
```
Change the signature and mount the analyze route BEFORE the `/api` cache mount. The function becomes:
```js
function createApp({ db, config, analyzeFn }) {
  const app = express();
  app.use(express.json());

  // Public
  app.use('/api/health', healthRoute());

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api/analyze', requireAuth(config), analyzeRoute({ db, analyzeFn, ttlMs: config.analysisTtlMs }));
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}
```
(Leave the `require` lines for `express`, `requireAuth`, `healthRoute`, `cacheRoute` and the `module.exports` unchanged.)

- [ ] **Step 5: Run, expect PASS**

Run: `cd backend && npx vitest run tests/analyze.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/analyze.js backend/src/app.js backend/tests/analyze.test.js
git commit -m "feat(backend): add protected POST /api/analyze route + app wiring"
```

---

## Task 5: Wire analyzeFn into server + docs + full suite

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

- [ ] **Step 1: Wire `analyzeFn` into `backend/src/server.js`**

Add the require near the other AI requires:
```js
const { analyzeMarket } = require('./ai/analysis');
```

The current server builds `const app = createApp({ db, config });` early (right after `createDb`), but `complete` is built later. **Move the `createApp` call down** so it runs AFTER the AI wiring, and add `analyzeFn`. Concretely:

1. DELETE the existing line `  const app = createApp({ db, config });` (near the top of the `try` block).
2. After the existing `const classifyFn = ...` block, add:
```js
  const analysisModel =
    config.analysisModel ||
    (config.aiProvider === 'anthropic' ? 'claude-opus-4-8' : 'anthropic/claude-opus-4.8');
  const analyzeFn = complete
    ? (data) => analyzeMarket({ ...data, complete, model: analysisModel })
    : null;

  const app = createApp({ db, config, analyzeFn });
```
(The `buildPriceFn`, `buildComplete`, `complete`, `classifyFn`, `startScheduler`, and `app.listen` logic stay otherwise unchanged. Ensure `createApp` is now called before `app.listen`.)

- [ ] **Step 2: Append to `backend/.env.example`**

```bash

# Deep analysis (Opus on-demand) — POST /api/analyze
# Cache TTL in ms for the last analysis (default 10 min). Re-runs after expiry or with { "force": true }.
ANALYSIS_TTL_MS=600000
# Optional model override (defaults to a provider-appropriate Opus id)
# ANALYSIS_MODEL=
```

- [ ] **Step 3: Update `backend/README.md`**

Add under `## Endpoints` (after the `/api/tweets` bullet):
```markdown
- `POST /api/analyze` — **protected**; runs Claude Opus on the cached price/tweets/news and
  returns `{ recommendation: BUY|HOLD|SELL, confidence, summary, components, generatedAt }`.
  The result is cached for `ANALYSIS_TTL_MS` (default 10 min); send `{ "force": true }` to
  re-run immediately. `503` if no AI key is configured; `502` if the analysis call fails.
```
And in the `## Background jobs` section, add:
```markdown
`POST /api/analyze` is **on-demand** (not scheduled): it reads the existing cache keys, calls
Opus via `AI_PROVIDER`, and stores the result under the `analysis` cache key with a TTL to
keep Opus cost low.
```

- [ ] **Step 4: Full suite**

Run: `cd backend && npm test`
Expected: ALL pass. Before Phase 2d there were 69 tests; new tests add: config +2, analysis +6, analysisService +5, analyze +5 → expect about 87 tests passing.

Do NOT run `server.js` directly (it would start the server/scheduler and make live calls). The suite is the gate. There is no live smoke for this phase (no keys).

- [ ] **Step 5: Commit + push**

```bash
git add backend/src/server.js backend/.env.example backend/README.md
git commit -m "feat(backend): wire Opus analyzeFn into server (POST /api/analyze)"
git push origin <current-branch>
```

---

## Done Criteria (Phase 2d)

- [ ] `npm test` passes all suites including new analysis/analysisService/analyze tests.
- [ ] `analyzeMarket` makes **one** `complete` call with the Opus model and returns the structured shape; throws on rejection/malformed/invalid recommendation.
- [ ] `getAnalysis` returns a fresh cached analysis without calling Opus; `force: true` and TTL expiry both trigger a re-run; only successful runs are cached; cold price/tweets/news pass as `null`.
- [ ] `POST /api/analyze` returns `401` unauthed, `503` with no AI key, `502` on failure, `200` with the analysis (incl. `generatedAt`) otherwise.
- [ ] Prompt caching applies to the analysis system prompt (via the existing adapter `cache_control`).

## Out of Scope (later phases)

- **Phase 3:** Supabase login UI, frontend v3.1 wiring (deterministic F5 component scores + F4 portfolio tracker), VPS deploy.
- Real Apify/Xpoz scraper + real AI key wiring (env-var change).
