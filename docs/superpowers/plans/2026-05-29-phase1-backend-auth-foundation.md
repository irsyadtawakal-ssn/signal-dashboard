# Phase 1 — Backend, Auth & SQLite Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure Node.js backend that holds all API credentials server-side, gates every data endpoint behind Supabase JWT auth, and serves data from a SQLite cache layer.

**Architecture:** Express app factory wired from focused modules — `config` (env validation), `db` (SQLite cache helpers), `auth` (Supabase JWT verification middleware), and route modules. A public `/api/health` route and a protected `/api/price` route (reading from cache) prove the auth gate end-to-end. Integrations (Twitter/Claude/CoinGecko/cron) come in Phase 2; this phase establishes the skeleton + security boundary.

**Tech Stack:** Node.js, Express, better-sqlite3, jsonwebtoken (verify Supabase HS256 JWT locally via project JWT secret), dotenv. Tests: Vitest + Supertest.

**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` (sections 7.1–7.4, F0).

---

## File Structure

```
backend/
  package.json            # deps + test scripts
  .env.example            # documents required env vars (no secrets)
  vitest.config.js        # test runner config
  src/
    config.js             # loadConfig(env): validate & return config
    db.js                 # createDb / getCache / setCache
    auth.js               # requireAuth(config): Supabase JWT middleware
    app.js                # createApp({ db, config }): wire routes
    server.js             # entrypoint: load config, open db, listen
    routes/
      health.js           # GET /api/health (public)
      cache.js            # GET /api/price (protected, reads cache)
  tests/
    helpers.js            # signTestToken() using a known secret
    config.test.js
    db.test.js
    auth.test.js
    health.test.js
    price.test.js
```

Each module has one responsibility and is unit-testable in isolation. Routes are factories that receive their deps (`db`, `config`) so tests can inject in-memory state.

---

## Task 1: Project scaffold

**Files:**
- Create: `backend/package.json`
- Create: `backend/vitest.config.js`
- Create: `backend/.env.example`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "signal-dashboard-backend",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `backend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Create `backend/.env.example`**

```bash
# Server
PORT=3000

# SQLite cache file (relative to backend/ working dir)
DB_PATH=./data/cache.sqlite

# Supabase project JWT secret (Settings → API → JWT Secret).
# Used to verify access tokens locally. NEVER commit the real value.
SUPABASE_JWT_SECRET=replace-with-supabase-jwt-secret
```

- [ ] **Step 4: Install dependencies**

Run: `cd backend && npm install`
Expected: `node_modules/` created, no error. (`better-sqlite3` compiles a native binding — on Windows this needs build tools; if it fails, run `npm install --build-from-source` or ensure Visual Studio Build Tools are present.)

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/vitest.config.js backend/.env.example backend/package-lock.json
git commit -m "chore(backend): scaffold Node.js project with vitest"
```

---

## Task 2: Config module (env validation)

**Files:**
- Create: `backend/src/config.js`
- Test: `backend/tests/config.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/config.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns config from a complete env', () => {
    const cfg = loadConfig({
      PORT: '4000',
      DB_PATH: '/tmp/x.sqlite',
      SUPABASE_JWT_SECRET: 'secret',
    });
    expect(cfg.port).toBe(4000);
    expect(cfg.dbPath).toBe('/tmp/x.sqlite');
    expect(cfg.supabaseJwtSecret).toBe('secret');
  });

  it('applies defaults for port and dbPath', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.port).toBe(3000);
    expect(cfg.dbPath).toBe('./data/cache.sqlite');
  });

  it('throws when SUPABASE_JWT_SECRET is missing', () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_JWT_SECRET/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Write minimal implementation**

`backend/src/config.js`:
```js
function loadConfig(env = process.env) {
  const required = (name) => {
    const v = env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  return {
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || './data/cache.sqlite',
    supabaseJwtSecret: required('SUPABASE_JWT_SECRET'),
  };
}

module.exports = { loadConfig };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/config.js backend/tests/config.test.js
git commit -m "feat(backend): add config loader with env validation"
```

---

## Task 3: SQLite cache layer

**Files:**
- Create: `backend/src/db.js`
- Test: `backend/tests/db.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/db.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, getCache, setCache } from '../src/db.js';

let db;
beforeEach(() => {
  db = createDb(':memory:');
});

describe('cache layer', () => {
  it('returns null for a missing key', () => {
    expect(getCache(db, 'nope')).toBeNull();
  });

  it('stores and retrieves a JSON value', () => {
    setCache(db, 'price', { oct: 0.21 });
    const hit = getCache(db, 'price');
    expect(hit.value).toEqual({ oct: 0.21 });
    expect(typeof hit.updatedAt).toBe('number');
  });

  it('upserts (overwrites) an existing key', () => {
    setCache(db, 'price', { oct: 0.21 });
    setCache(db, 'price', { oct: 0.25 });
    expect(getCache(db, 'price').value).toEqual({ oct: 0.25 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/db.test.js`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 3: Write minimal implementation**

`backend/src/db.js`:
```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}

function setCache(db, key, value) {
  db.prepare(`
    INSERT INTO cache (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), Date.now());
}

function getCache(db, key) {
  const row = db.prepare('SELECT value, updated_at FROM cache WHERE key = ?').get(key);
  if (!row) return null;
  return { value: JSON.parse(row.value), updatedAt: row.updated_at };
}

module.exports = { createDb, setCache, getCache };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/db.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.js backend/tests/db.test.js
git commit -m "feat(backend): add SQLite cache layer (get/set/upsert)"
```

---

## Task 4: Auth middleware (Supabase JWT)

**Files:**
- Create: `backend/src/auth.js`
- Create: `backend/tests/helpers.js`
- Test: `backend/tests/auth.test.js`

Supabase access tokens are HS256 JWTs signed with the project JWT secret. We verify them locally (no network call) and attach `req.user`.

- [ ] **Step 1: Create the test helper**

`backend/tests/helpers.js`:
```js
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-secret';

function signTestToken(payload = {}, secret = TEST_SECRET) {
  return jwt.sign(
    { sub: 'user-123', email: 'trader@example.com', ...payload },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

module.exports = { signTestToken, TEST_SECRET };
```

- [ ] **Step 2: Write the failing test**

`backend/tests/auth.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../src/auth.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

const config = { supabaseJwtSecret: TEST_SECRET };

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a tampered/invalid token', () => {
    const req = { headers: { authorization: 'Bearer not.a.jwt' } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({}, 'wrong-secret')}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid token and attaches req.user', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken()}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'user-123', email: 'trader@example.com' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/auth.test.js`
Expected: FAIL — cannot find module `../src/auth.js`.

- [ ] **Step 4: Write minimal implementation**

`backend/src/auth.js`:
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
      const payload = jwt.verify(token, config.supabaseJwtSecret, { algorithms: ['HS256'] });
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = { requireAuth };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/auth.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth.js backend/tests/auth.test.js backend/tests/helpers.js
git commit -m "feat(backend): add Supabase JWT auth middleware"
```

---

## Task 5: Public health route + app factory

**Files:**
- Create: `backend/src/routes/health.js`
- Create: `backend/src/app.js`
- Test: `backend/tests/health.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/health.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { TEST_SECRET } from './helpers.js';

let app;
beforeEach(() => {
  const db = createDb(':memory:');
  app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET } });
});

describe('GET /api/health', () => {
  it('is public and returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/health.test.js`
Expected: FAIL — cannot find module `../src/app.js`.

- [ ] **Step 3: Create the health route**

`backend/src/routes/health.js`:
```js
const { Router } = require('express');

module.exports = function healthRoute() {
  const r = Router();
  r.get('/', (req, res) => res.json({ status: 'ok' }));
  return r;
};
```

- [ ] **Step 4: Create the app factory**

`backend/src/app.js`:
```js
const express = require('express');
const { requireAuth } = require('./auth');
const healthRoute = require('./routes/health');
const cacheRoute = require('./routes/cache');

function createApp({ db, config }) {
  const app = express();
  app.use(express.json());

  // Public
  app.use('/api/health', healthRoute());

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}

module.exports = { createApp };
```

Note: `cacheRoute` is created in Task 6. Run this task's test only after Task 6's file exists, OR create an empty stub now:

`backend/src/routes/cache.js` (stub — replaced in Task 6):
```js
const { Router } = require('express');
module.exports = function cacheRoute() { return Router(); };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/health.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.js backend/src/routes/health.js backend/src/routes/cache.js backend/tests/health.test.js
git commit -m "feat(backend): add app factory and public health route"
```

---

## Task 6: Protected price route (reads cache)

**Files:**
- Modify: `backend/src/routes/cache.js` (replace Task 5 stub)
- Test: `backend/tests/price.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/price.test.js`:
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

describe('GET /api/price', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/price');
    expect(res.status).toBe(401);
  });

  it('returns 503 when authed but cache is empty', async () => {
    const res = await request(app)
      .get('/api/price')
      .set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(503);
  });

  it('returns cached price when authed and cache is warm', async () => {
    setCache(db, 'price', { oct: 0.21, btc: 68000 });
    const res = await request(app)
      .get('/api/price')
      .set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ oct: 0.21, btc: 68000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/price.test.js`
Expected: FAIL — `/api/price` returns 404 (stub router has no routes), so the 401/503/200 assertions fail.

- [ ] **Step 3: Replace the stub with the real route**

`backend/src/routes/cache.js`:
```js
const { Router } = require('express');
const { getCache } = require('../db');

module.exports = function cacheRoute({ db }) {
  const r = Router();

  r.get('/price', (req, res) => {
    const hit = getCache(db, 'price');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });

  return r;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/price.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS — all suites (config, db, auth, health, price).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/cache.js backend/tests/price.test.js
git commit -m "feat(backend): add protected /api/price route reading from cache"
```

---

## Task 7: Server entrypoint + run docs

**Files:**
- Create: `backend/src/server.js`
- Create: `backend/README.md`

- [ ] **Step 1: Create the entrypoint**

`backend/src/server.js`:
```js
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

const config = loadConfig();
const db = createDb(config.dbPath);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`Signal Dashboard backend listening on :${config.port}`);
});
```

- [ ] **Step 2: Create `backend/README.md`**

````markdown
# Signal Dashboard — Backend

Secure API layer for the OCT Signal Intelligence dashboard. Holds all third-party
API credentials, gates data endpoints behind Supabase JWT auth, serves from a
SQLite cache.

## Setup

1. `cd backend && npm install`
2. Copy env: `cp .env.example .env` and fill `SUPABASE_JWT_SECRET`
   (Supabase dashboard → Settings → API → JWT Secret).
3. Run tests: `npm test`
4. Start: `npm start` (or `npm run dev` to auto-reload).

## Endpoints

- `GET /api/health` — public liveness check → `{ "status": "ok" }`
- `GET /api/price` — **protected** (requires `Authorization: Bearer <supabase-jwt>`);
  returns cached price JSON, or `503` if the cache is empty.

## Auth

Send the Supabase access token as `Authorization: Bearer <token>`. The backend
verifies it locally (HS256) against `SUPABASE_JWT_SECRET`. No token / invalid
token → `401`.

> Cache-population (cron pulling DexScreener / CoinGecko / Twitter / Claude /
> CryptoPanic) is implemented in Phase 2.
````

- [ ] **Step 3: Manual smoke test**

Run (with a real `.env` containing your Supabase JWT secret):
```bash
cd backend && npm start
```
In another shell:
```bash
curl -s http://localhost:3000/api/health
# Expected: {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/price
# Expected: 401  (no token)
```
Stop the server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.js backend/README.md
git commit -m "feat(backend): add server entrypoint and run docs"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Done Criteria (Phase 1)

- [ ] `npm test` passes all suites (config, db, auth, health, price).
- [ ] `/api/health` is reachable without a token.
- [ ] `/api/price` returns `401` without a valid token, `503` when cache empty, `200` with cached data when authed.
- [ ] No API keys or secrets in source or client; `.env` is gitignored (covered by root `.gitignore`).
- [ ] Backend starts via `npm start`.

## Out of Scope (later phases)

- **Phase 2:** real integrations (DexScreener, CoinGecko, Twitter scraper, Claude Sonnet/Opus, CryptoPanic), cron scheduler writing to cache, prompt caching, `/api/tweets` `/api/news` `/api/analyze` routes.
- **Phase 3:** Supabase login page + session guard in the v3.1 frontend, wiring dashboard to these endpoints, deploy to VPS (pm2/systemd), 24/7 ops.
