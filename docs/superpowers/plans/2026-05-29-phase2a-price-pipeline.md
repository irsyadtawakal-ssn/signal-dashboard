# Phase 2a — Price Data Pipeline + Auth Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `price` cache key with live OCT price (DexScreener) + BTC/ETH macro (CoinGecko) on a recurring schedule, so the already-built `GET /api/price` serves real data. Also harden the auth gate per the Phase 1 review.

**Architecture:** Small injectable units. A generic `getJson` HTTP helper (timeout + error normalization). Two "source" modules (`sources/dexscreener.js`, `sources/coingecko.js`) that each fetch + normalize one upstream. A `priceService` that combines both sources into one cached object (degrading gracefully if one source fails). A `scheduler` that runs the price update on an interval and writes to the SQLite cache via `setCache`. All upstreams here are free public APIs — no keys or accounts needed. Every unit takes its HTTP function as a parameter, so tests stub responses with zero network calls.

**Tech Stack:** Node.js global `fetch` (Node 22), existing Express/better-sqlite3/Vitest stack. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` (sections 7.3 `/api/price`, 7.4 cron 3–5 min, 7.5 DexScreener + CoinGecko). **Builds on:** Phase 1 (`backend/` exists; `getCache`/`setCache`, `createApp`, `requireAuth`, `loadConfig` all present and tested).

---

## File Structure

```
backend/src/
  http.js                 # getJson(url, { fetchFn, timeoutMs }) — generic JSON GET
  sources/
    dexscreener.js        # fetchOctPrice({ getJsonFn, tokenAddress }) -> { oct }
    coingecko.js          # fetchMacro({ getJsonFn }) -> { btc, eth }
  priceService.js         # buildPrice({ dexFn, macroFn }) -> combined price object
  scheduler.js            # startScheduler({ db, tasks }) + runPriceUpdate({ db, buildPriceFn })
  auth.js                 # MODIFIED: pin aud='authenticated', optional issuer
  config.js               # MODIFIED: add octTokenAddress, priceIntervalMs, optional supabaseJwtIssuer
  server.js               # MODIFIED: startup try/catch + start scheduler
backend/tests/
  http.test.js
  sources/dexscreener.test.js
  sources/coingecko.test.js
  priceService.test.js
  scheduler.test.js
  auth.test.js            # MODIFIED: add aud/issuer cases
```

Each source has one responsibility (fetch + normalize one API). `priceService` owns the combine/degrade logic. `scheduler` owns timing + cache writes. This keeps each file small and independently testable.

---

## Task 1: Auth hardening (audience pin + optional issuer + startup safety)

Addresses Phase 1 review findings: pin `aud`, allow optional `iss`, and wrap server startup so a bad config fails loudly.

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/auth.js`
- Modify: `backend/src/server.js`
- Modify: `backend/tests/auth.test.js`
- Modify: `backend/tests/config.test.js`

- [ ] **Step 1: Add config fields — write failing test**

Append to `backend/tests/config.test.js` inside the existing `describe('loadConfig', ...)`:
```js
  it('parses new optional fields with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.octTokenAddress).toBe('0x4647e1fe715c9e23959022c2416c71867f5a6e80');
    expect(cfg.priceIntervalMs).toBe(300000);
    expect(cfg.supabaseJwtIssuer).toBeUndefined();
  });

  it('reads overrides for new fields', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      OCT_TOKEN_ADDRESS: '0xabc',
      PRICE_INTERVAL_MS: '60000',
      SUPABASE_JWT_ISSUER: 'https://proj.supabase.co/auth/v1',
    });
    expect(cfg.octTokenAddress).toBe('0xabc');
    expect(cfg.priceIntervalMs).toBe(60000);
    expect(cfg.supabaseJwtIssuer).toBe('https://proj.supabase.co/auth/v1');
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: FAIL — `octTokenAddress` undefined.

- [ ] **Step 3: Update `backend/src/config.js`**

Replace the returned object so it reads:
```js
  return {
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || './data/cache.sqlite',
    supabaseJwtSecret: required('SUPABASE_JWT_SECRET'),
    supabaseJwtIssuer: env.SUPABASE_JWT_ISSUER || undefined,
    octTokenAddress: env.OCT_TOKEN_ADDRESS || '0x4647e1fe715c9e23959022c2416c71867f5a6e80',
    priceIntervalMs: Number(env.PRICE_INTERVAL_MS) || 300000,
  };
```
(Leave the `required` helper and the rest of the function unchanged.)

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Harden auth — write failing tests**

Append to `backend/tests/auth.test.js` inside the existing `describe('requireAuth', ...)`:
```js
  it('rejects a token with the wrong audience', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'someone-else' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a token with aud=authenticated', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'authenticated' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a token with the wrong issuer when issuer is configured', () => {
    const cfgWithIss = { supabaseJwtSecret: TEST_SECRET, supabaseJwtIssuer: 'https://good.example' };
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'authenticated', iss: 'https://evil.example' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(cfgWithIss)(req, res, next);
    expect(res.statusCode).toBe(401);
  });
```
Also update the existing valid-token tests: the default `signTestToken()` payload must now include `aud: 'authenticated'`. In `backend/tests/helpers.js`, change the default payload:
```js
function signTestToken(payload = {}, secret = TEST_SECRET) {
  return jwt.sign(
    { sub: 'user-123', email: 'trader@example.com', aud: 'authenticated', ...payload },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}
```

- [ ] **Step 6: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/auth.test.js`
Expected: FAIL — wrong-audience token currently passes (no aud check yet).

- [ ] **Step 7: Update `backend/src/auth.js`**

Replace the `jwt.verify` call and verify options:
```js
const jwt = require('jsonwebtoken');

function requireAuth(config) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'missing bearer token' });
    }
    try {
      const options = { algorithms: ['HS256'], audience: 'authenticated' };
      if (config.supabaseJwtIssuer) options.issuer = config.supabaseJwtIssuer;
      const payload = jwt.verify(token, config.supabaseJwtSecret, options);
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = { requireAuth };
```

- [ ] **Step 8: Run, expect PASS**

Run: `cd backend && npx vitest run tests/auth.test.js`
Expected: PASS (7 tests).

- [ ] **Step 9: Startup safety in `backend/src/server.js`**

Wrap the wiring in try/catch so a bad config exits with a clear message:
```js
require('dotenv').config();
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

try {
  const config = loadConfig();
  const db = createDb(config.dbPath);
  const app = createApp({ db, config });
  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
```
(Scheduler wiring is added in Task 6 — leave it for now.)

- [ ] **Step 10: Full suite + commit**

Run: `cd backend && npm test`  → Expected: all pass.
```bash
git add backend/src/config.js backend/src/auth.js backend/src/server.js backend/tests/config.test.js backend/tests/auth.test.js backend/tests/helpers.js
git commit -m "feat(backend): harden auth (aud pin + optional issuer) and add price config"
```

---

## Task 2: Generic JSON HTTP helper

**Files:**
- Create: `backend/src/http.js`
- Test: `backend/tests/http.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/http.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { getJson } from '../src/http.js';

function fakeFetch(response) {
  return vi.fn().mockResolvedValue(response);
}

describe('getJson', () => {
  it('returns parsed JSON on 200', async () => {
    const fetchFn = fakeFetch({ ok: true, status: 200, json: async () => ({ hello: 'world' }) });
    const data = await getJson('https://x.test', { fetchFn });
    expect(data).toEqual({ hello: 'world' });
    expect(fetchFn).toHaveBeenCalledWith('https://x.test', expect.any(Object));
  });

  it('throws on non-2xx status', async () => {
    const fetchFn = fakeFetch({ ok: false, status: 429, json: async () => ({}) });
    await expect(getJson('https://x.test', { fetchFn })).rejects.toThrow(/429/);
  });

  it('throws when fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(getJson('https://x.test', { fetchFn })).rejects.toThrow(/network down/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/http.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/http.js`**

```js
async function getJson(url, { fetchFn = fetch, timeoutMs = 8000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Request to ${url} failed with status ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getJson };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/http.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/http.js backend/tests/http.test.js
git commit -m "feat(backend): add generic getJson HTTP helper with timeout"
```

---

## Task 3: DexScreener source (OCT price)

DexScreener tokens endpoint: `GET https://api.dexscreener.com/latest/dex/tokens/{tokenAddress}` returns `{ pairs: [{ priceUsd, priceChange: { h24 }, ... }] }`. We take the first pair's `priceUsd`.

**Files:**
- Create: `backend/src/sources/dexscreener.js`
- Test: `backend/tests/sources/dexscreener.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/sources/dexscreener.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchOctPrice } from '../../src/sources/dexscreener.js';

describe('fetchOctPrice', () => {
  const tokenAddress = '0xToken';

  it('calls the tokens endpoint with the token address and returns oct price', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({
      pairs: [{ priceUsd: '0.2134', priceChange: { h24: 5.2 } }],
    });
    const result = await fetchOctPrice({ getJsonFn, tokenAddress });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://api.dexscreener.com/latest/dex/tokens/0xToken',
      expect.any(Object)
    );
    expect(result).toEqual({ oct: 0.2134, octChange24h: 5.2 });
  });

  it('throws when there are no pairs', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ pairs: [] });
    await expect(fetchOctPrice({ getJsonFn, tokenAddress })).rejects.toThrow(/no pairs/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/sources/dexscreener.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/sources/dexscreener.js`**

```js
const { getJson } = require('../http');

async function fetchOctPrice({ getJsonFn = getJson, tokenAddress }) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const data = await getJsonFn(url, {});
  const pair = data && Array.isArray(data.pairs) ? data.pairs[0] : null;
  if (!pair) {
    throw new Error('DexScreener returned no pairs for token');
  }
  return {
    oct: Number(pair.priceUsd),
    octChange24h: pair.priceChange ? Number(pair.priceChange.h24) : null,
  };
}

module.exports = { fetchOctPrice };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/sources/dexscreener.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sources/dexscreener.js backend/tests/sources/dexscreener.test.js
git commit -m "feat(backend): add DexScreener source for OCT price"
```

---

## Task 4: CoinGecko source (BTC/ETH macro)

CoinGecko simple price: `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true` → `{ bitcoin: { usd, usd_24h_change }, ethereum: { usd, usd_24h_change } }`.

**Files:**
- Create: `backend/src/sources/coingecko.js`
- Test: `backend/tests/sources/coingecko.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/sources/coingecko.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchMacro } from '../../src/sources/coingecko.js';

describe('fetchMacro', () => {
  it('returns btc and eth prices with 24h change', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({
      bitcoin: { usd: 68000, usd_24h_change: 1.5 },
      ethereum: { usd: 3500, usd_24h_change: -2.1 },
    });
    const result = await fetchMacro({ getJsonFn });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      expect.any(Object)
    );
    expect(result).toEqual({
      btc: 68000, btcChange24h: 1.5,
      eth: 3500, ethChange24h: -2.1,
    });
  });

  it('throws when expected keys are missing', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({});
    await expect(fetchMacro({ getJsonFn })).rejects.toThrow(/coingecko/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/sources/coingecko.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/sources/coingecko.js`**

```js
const { getJson } = require('../http');

const URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

async function fetchMacro({ getJsonFn = getJson }) {
  const data = await getJsonFn(URL, {});
  if (!data || !data.bitcoin || !data.ethereum) {
    throw new Error('CoinGecko response missing bitcoin/ethereum');
  }
  return {
    btc: Number(data.bitcoin.usd),
    btcChange24h: Number(data.bitcoin.usd_24h_change),
    eth: Number(data.ethereum.usd),
    ethChange24h: Number(data.ethereum.usd_24h_change),
  };
}

module.exports = { fetchMacro };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/sources/coingecko.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sources/coingecko.js backend/tests/sources/coingecko.test.js
git commit -m "feat(backend): add CoinGecko source for BTC/ETH macro"
```

---

## Task 5: Price service (combine + graceful degrade)

Combines the two sources into one object. If one source throws, keep the other's data and mark the failed part `null` — the dashboard should not go fully blank when one upstream hiccups.

**Files:**
- Create: `backend/src/priceService.js`
- Test: `backend/tests/priceService.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/priceService.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { buildPrice } from '../src/priceService.js';

describe('buildPrice', () => {
  it('merges oct + macro into one object with a timestamp', async () => {
    const dexFn = vi.fn().mockResolvedValue({ oct: 0.21, octChange24h: 5 });
    const macroFn = vi.fn().mockResolvedValue({ btc: 68000, btcChange24h: 1, eth: 3500, ethChange24h: -2 });
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBe(0.21);
    expect(result.btc).toBe(68000);
    expect(result.eth).toBe(3500);
    expect(typeof result.fetchedAt).toBe('number');
  });

  it('degrades: keeps macro when dex source fails', async () => {
    const dexFn = vi.fn().mockRejectedValue(new Error('dex down'));
    const macroFn = vi.fn().mockResolvedValue({ btc: 68000, btcChange24h: 1, eth: 3500, ethChange24h: -2 });
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBeNull();
    expect(result.btc).toBe(68000);
  });

  it('degrades: keeps oct when macro source fails', async () => {
    const dexFn = vi.fn().mockResolvedValue({ oct: 0.21, octChange24h: 5 });
    const macroFn = vi.fn().mockRejectedValue(new Error('cg down'));
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBe(0.21);
    expect(result.btc).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/priceService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/priceService.js`**

```js
async function buildPrice({ dexFn, macroFn }) {
  const [dexResult, macroResult] = await Promise.allSettled([dexFn(), macroFn()]);

  const dex = dexResult.status === 'fulfilled'
    ? dexResult.value
    : { oct: null, octChange24h: null };
  const macro = macroResult.status === 'fulfilled'
    ? macroResult.value
    : { btc: null, btcChange24h: null, eth: null, ethChange24h: null };

  return { ...dex, ...macro, fetchedAt: Date.now() };
}

module.exports = { buildPrice };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/priceService.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/priceService.js backend/tests/priceService.test.js
git commit -m "feat(backend): add price service combining sources with graceful degrade"
```

---

## Task 6: Scheduler (write cache on interval) + wire into server

**Files:**
- Create: `backend/src/scheduler.js`
- Test: `backend/tests/scheduler.test.js`
- Modify: `backend/src/server.js`
- Modify: `backend/README.md`
- Modify: `backend/.env.example`

- [ ] **Step 1: Write the failing test**

`backend/tests/scheduler.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { runPriceUpdate, startScheduler } from '../src/scheduler.js';
import { createDb, getCache } from '../src/db.js';

describe('runPriceUpdate', () => {
  it('writes the built price into the cache under key "price"', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockResolvedValue({ oct: 0.21, btc: 68000, fetchedAt: 123 });
    await runPriceUpdate({ db, buildPriceFn });
    expect(getCache(db, 'price').value).toEqual({ oct: 0.21, btc: 68000, fetchedAt: 123 });
  });

  it('does not throw if buildPrice fails (logs and skips write)', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runPriceUpdate({ db, buildPriceFn })).resolves.toBeUndefined();
    expect(getCache(db, 'price')).toBeNull();
  });
});

describe('startScheduler', () => {
  it('runs each task immediately and returns stop handles', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue(undefined);
    const stop = startScheduler({ tasks: [{ run: task, intervalMs: 1000 }] });
    expect(task).toHaveBeenCalledTimes(1); // immediate run on start
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(2); // no more after stop
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/scheduler.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/scheduler.js`**

```js
const { setCache } = require('./db');

async function runPriceUpdate({ db, buildPriceFn }) {
  try {
    const price = await buildPriceFn();
    setCache(db, 'price', price);
  } catch (err) {
    console.error('price update failed:', err.message);
  }
}

function startScheduler({ tasks }) {
  const timers = tasks.map(({ run, intervalMs }) => {
    run(); // run immediately on start
    return setInterval(run, intervalMs);
  });
  return function stop() {
    timers.forEach(clearInterval);
  };
}

module.exports = { runPriceUpdate, startScheduler };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/scheduler.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the scheduler into `backend/src/server.js`**

Replace the file with:
```js
require('dotenv').config();
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');
const { getJson } = require('./http');
const { fetchOctPrice } = require('./sources/dexscreener');
const { fetchMacro } = require('./sources/coingecko');
const { buildPrice } = require('./priceService');
const { runPriceUpdate, startScheduler } = require('./scheduler');

try {
  const config = loadConfig();
  const db = createDb(config.dbPath);
  const app = createApp({ db, config });

  const buildPriceFn = () =>
    buildPrice({
      dexFn: () => fetchOctPrice({ getJsonFn: getJson, tokenAddress: config.octTokenAddress }),
      macroFn: () => fetchMacro({ getJsonFn: getJson }),
    });

  startScheduler({
    tasks: [
      { run: () => runPriceUpdate({ db, buildPriceFn }), intervalMs: config.priceIntervalMs },
    ],
  });

  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
```

- [ ] **Step 6: Update `backend/.env.example`**

Add these lines under the existing content:
```bash

# OCT token address on Ethereum (DexScreener tokens lookup)
OCT_TOKEN_ADDRESS=0x4647e1fe715c9e23959022c2416c71867f5a6e80
# Price refresh interval in ms (default 5 min)
PRICE_INTERVAL_MS=300000
# Optional: pin Supabase token issuer, e.g. https://<ref>.supabase.co/auth/v1
# SUPABASE_JWT_ISSUER=
```

- [ ] **Step 7: Update `backend/README.md`**

Under the `## Endpoints` section, update the `/api/price` line and add a note:
```markdown
- `GET /api/price` — **protected**; returns the cached price object
  `{ oct, octChange24h, btc, btcChange24h, eth, ethChange24h, fetchedAt }`,
  or `503` until the first scheduled fetch completes.

## Background jobs

On startup the server schedules a price update (DexScreener for OCT, CoinGecko
for BTC/ETH) every `PRICE_INTERVAL_MS` (default 5 min) and writes it to the
`price` cache key. If one upstream fails, the other's data is still served (the
failed fields are `null`).
```

- [ ] **Step 8: Full suite + manual smoke test**

Run: `cd backend && npm test` → Expected: all suites pass.

Manual (real network, no keys needed):
```bash
cd backend
echo "SUPABASE_JWT_SECRET=dummy-smoke" > .env
node -e "const {getJson}=require('./src/http');const {fetchMacro}=require('./src/sources/coingecko');fetchMacro({getJsonFn:getJson}).then(r=>console.log('macro ok',r)).catch(e=>console.error('macro ERR',e.message));"
node -e "const {getJson}=require('./src/http');const {fetchOctPrice}=require('./src/sources/dexscreener');fetchOctPrice({getJsonFn:getJson,tokenAddress:'0x4647e1fe715c9e23959022c2416c71867f5a6e80'}).then(r=>console.log('oct ok',r)).catch(e=>console.error('oct ERR',e.message));"
rm .env
```
Expected: `macro ok { btc: ..., eth: ... }` and `oct ok { oct: ..., ... }` with real numbers. (If DexScreener returns no pairs for that token, report it — the address may need updating; do not silently change it.)

- [ ] **Step 9: Commit + push**

```bash
git add backend/src/scheduler.js backend/tests/scheduler.test.js backend/src/server.js backend/README.md backend/.env.example
git commit -m "feat(backend): schedule price updates into cache (DexScreener + CoinGecko)"
git push origin <current-branch>
```

---

## Done Criteria (Phase 2a)

- [ ] `npm test` passes all suites (config, db, auth, health, price, http, dexscreener, coingecko, priceService, scheduler).
- [ ] Auth pins `aud='authenticated'` and honors optional `SUPABASE_JWT_ISSUER`; wrong-audience token → 401.
- [ ] Server starts a scheduler that writes a combined price object to the `price` cache key every `PRICE_INTERVAL_MS`.
- [ ] `GET /api/price` (authed) returns real OCT + BTC/ETH data once the first fetch completes.
- [ ] One failing upstream does not blank the whole response (graceful degrade).
- [ ] Manual smoke test shows real numbers from both upstreams.
- [ ] Server startup is wrapped so bad config exits with a clear message.

## Out of Scope (later sub-plans)

- **Phase 2b:** CryptoPanic news fetcher + `/api/news` + hourly cron task.
- **Phase 2c:** Twitter scraper (Apify/Xpoz) + Claude Sonnet sentiment classification (with prompt caching) + Opus on-demand `/api/analyze` + `/api/tweets`.
- **Phase 3:** Supabase login UI + frontend v3.1 wiring + VPS deploy.
