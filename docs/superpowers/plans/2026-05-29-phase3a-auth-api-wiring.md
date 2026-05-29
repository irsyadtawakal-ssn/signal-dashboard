# Phase 3a — Frontend Auth + Backend API Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the dashboard behind Supabase email/password login and replace every direct-from-browser third-party API call with authenticated calls to the existing backend — built config-driven + mock-first (no API keys needed to pass tests), no framework, no build step.

**Architecture:** A new `frontend/` package with its own vitest+jsdom setup. Auth and API logic are extracted into small vanilla ES modules that import nothing external (`auth.js`, `api-client.js`) so they unit-test with injected fakes. A thin `app.js` glue wires them to the existing prototype DOM (login gate, fetch, render, logout) and is verified manually. `index.html` is the cleaned v3 prototype: markup/CSS/chart/Fibonacci kept, direct API functions removed, Supabase loaded from a CDN.

**Tech Stack:** Vanilla ES modules + vitest + jsdom. Supabase JS v2 (browser via esm.sh CDN; injected as a fake in tests). No bundler.

**Reference spec:** `docs/superpowers/specs/2026-05-29-phase3a-auth-api-wiring-design.md`. **Source prototype:** `octra-dashboard-v3 (3).html` (repo root). **Backend (already merged):** `GET /api/price|news|tweets`, `POST /api/analyze`, all behind Supabase JWT auth.

---

## File Structure

```
frontend/
  package.json            # NEW: type:module; vitest + jsdom devDeps
  vitest.config.js        # NEW: jsdom environment
  .gitignore              # NEW: node_modules/, js/config.js
  index.html              # NEW: cleaned from prototype (Task 4)
  README.md               # NEW: Supabase setup checklist (Task 6)
  js/
    config.example.js     # NEW (committed): window.APP_CONFIG template
    config.js             # NEW (gitignored, created by user from example) — NOT committed
    api-client.js         # NEW (Task 2): createApiClient + AuthError
    auth.js               # NEW (Task 3): createAuth
    app.js                # NEW (Task 5): thin DOM glue (not unit-tested)
  tests/
    api-client.test.js    # NEW (Task 2)
    auth.test.js          # NEW (Task 3)
```

Existing prototype DOM ids the glue renders into (do not rename): price `prc`/`psub`/`phi`/`plo`/`pvol`/`chg`; macro `btcv`/`btcc`/`btcp`/`ethv`/`ethp`/`mmood`; news `nf`; tweets `tw-feed`/`tw-cnt`/`tw-q`; signal `tws-t`/`tws-p`/`tws-n`/`tws-u`/`tws-a`; fib ref `fib-current-ref`.

---

## Task 1: Scaffold the `frontend/` package

**Files:**
- Create: `frontend/package.json`, `frontend/vitest.config.js`, `frontend/.gitignore`, `frontend/js/config.example.js`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "signal-dashboard-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "jsdom": "^25.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `frontend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom' },
});
```

- [ ] **Step 3: Create `frontend/.gitignore`**

```
node_modules/
js/config.js
```

- [ ] **Step 4: Create `frontend/js/config.example.js`**

```js
// Copy this file to `config.js` (gitignored) and fill in real values.
// The anon key is a public client key (safe in the browser); the JWT secret is NOT here.
window.APP_CONFIG = {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  anonKey: 'YOUR_ANON_KEY',
  apiBaseUrl: 'http://localhost:3000',
};
```

- [ ] **Step 5: Install deps**

Run: `cd frontend && npm install`
Expected: `node_modules/` created with vitest + jsdom; no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/vitest.config.js frontend/.gitignore frontend/js/config.example.js frontend/package-lock.json
git commit -m "chore(frontend): scaffold vanilla frontend package (vitest + jsdom)"
```

---

## Task 2: `api-client.js` (backend wrapper)

**Files:**
- Create: `frontend/js/api-client.js`
- Test: `frontend/tests/api-client.test.js`

- [ ] **Step 1: Write the failing test**

`frontend/tests/api-client.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createApiClient, AuthError } from '../js/api-client.js';

function res(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
const getToken = async () => 'tok123';

describe('createApiClient', () => {
  it('GETs /api/price with a bearer token and returns parsed json', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { oct: 0.2 }));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    expect(await api.getPrice()).toEqual({ oct: 0.2 });
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('http://b/api/price');
    expect(opts.headers.Authorization).toBe('Bearer tok123');
  });

  it('getNews and getTweets hit their paths', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, []));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.getNews();
    await api.getTweets();
    expect(fetchFn.mock.calls[0][0]).toBe('http://b/api/news');
    expect(fetchFn.mock.calls[1][0]).toBe('http://b/api/tweets');
  });

  it('analyze POSTs { force: true } when forced', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { recommendation: 'BUY' }));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.analyze({ force: true });
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('http://b/api/analyze');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ force: true });
  });

  it('analyze defaults force to false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.analyze();
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ force: false });
  });

  it('throws AuthError on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(401, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await expect(api.getPrice()).rejects.toBeInstanceOf(AuthError);
  });

  it('returns the pending sentinel on 503', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(503, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    expect(await api.getPrice()).toEqual({ pending: true });
  });

  it('throws on other non-ok statuses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(500, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await expect(api.getPrice()).rejects.toThrow('request failed: 500');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd frontend && npx vitest run tests/api-client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/js/api-client.js`**

```js
class AuthError extends Error {
  constructor(message = 'unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

function createApiClient({ baseUrl, getToken, fetchFn = fetch }) {
  async function call(path, options = {}) {
    const token = await getToken();
    const res = await fetchFn(baseUrl + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) throw new AuthError();
    if (res.status === 503) return { pending: true };
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return res.json();
  }

  return {
    getPrice: () => call('/api/price'),
    getNews: () => call('/api/news'),
    getTweets: () => call('/api/tweets'),
    analyze: ({ force = false } = {}) =>
      call('/api/analyze', { method: 'POST', body: JSON.stringify({ force }) }),
  };
}

export { createApiClient, AuthError };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd frontend && npx vitest run tests/api-client.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/js/api-client.js frontend/tests/api-client.test.js
git commit -m "feat(frontend): add backend api-client with bearer auth + status handling"
```

---

## Task 3: `auth.js` (Supabase wrapper)

**Files:**
- Create: `frontend/js/auth.js`
- Test: `frontend/tests/auth.test.js`

- [ ] **Step 1: Write the failing test**

`frontend/tests/auth.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createAuth } from '../js/auth.js';

function fakeClient({ session = null } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      onAuthStateChange: vi.fn(),
    },
  };
}
const URL = 'https://x.supabase.co';

describe('createAuth', () => {
  it('is not configured with placeholder config; login throws and getToken is null', async () => {
    const auth = createAuth({ createClient: vi.fn(), supabaseUrl: 'YOUR_SUPABASE_URL', anonKey: 'YOUR_ANON_KEY' });
    expect(auth.isConfigured).toBe(false);
    await expect(auth.login('a@b.c', 'pw')).rejects.toThrow('Supabase not configured');
    expect(await auth.getToken()).toBeNull();
  });

  it('builds a client and logs in via signInWithPassword', async () => {
    const client = fakeClient();
    const createClient = vi.fn().mockReturnValue(client);
    const auth = createAuth({ createClient, supabaseUrl: URL, anonKey: 'anon' });
    expect(auth.isConfigured).toBe(true);
    expect(createClient).toHaveBeenCalledWith(URL, 'anon');
    await auth.login('a@b.c', 'pw');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
  });

  it('login throws when supabase returns an error', async () => {
    const client = fakeClient();
    client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('bad creds') });
    const auth = createAuth({ createClient: () => client, supabaseUrl: URL, anonKey: 'anon' });
    await expect(auth.login('a@b.c', 'x')).rejects.toThrow('bad creds');
  });

  it('getToken returns the session access_token, or null when no session', async () => {
    const withSession = createAuth({ createClient: () => fakeClient({ session: { access_token: 'abc' } }), supabaseUrl: URL, anonKey: 'anon' });
    expect(await withSession.getToken()).toBe('abc');
    const noSession = createAuth({ createClient: () => fakeClient({ session: null }), supabaseUrl: URL, anonKey: 'anon' });
    expect(await noSession.getToken()).toBeNull();
  });

  it('logout calls signOut', async () => {
    const client = fakeClient();
    const auth = createAuth({ createClient: () => client, supabaseUrl: URL, anonKey: 'anon' });
    await auth.logout();
    expect(client.auth.signOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd frontend && npx vitest run tests/auth.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/js/auth.js`**

```js
function isPlaceholder(v) {
  return !v || v.startsWith('YOUR_');
}

function createAuth({ createClient, supabaseUrl, anonKey }) {
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey)) {
    return {
      isConfigured: false,
      login: async () => { throw new Error('Supabase not configured'); },
      logout: async () => {},
      getToken: async () => null,
      getUser: async () => null,
      onChange: () => {},
    };
  }

  const client = createClient(supabaseUrl, anonKey);

  return {
    isConfigured: true,
    async login(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    logout: () => client.auth.signOut(),
    async getToken() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
    async getUser() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.user : null;
    },
    onChange(cb) {
      client.auth.onAuthStateChange((_event, session) => cb(session));
    },
  };
}

export { createAuth };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd frontend && npx vitest run tests/auth.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/js/auth.js frontend/tests/auth.test.js
git commit -m "feat(frontend): add config-driven Supabase auth wrapper"
```

---

## Task 4: Create `frontend/index.html` from the prototype (markup + cleanup)

This task has no unit test — it is verified by Task 6's manual smoke. It is integration/judgment work; **use a capable model when executing.**

**Files:**
- Create: `frontend/index.html` (from `octra-dashboard-v3 (3).html`)

- [ ] **Step 1: Copy the prototype into the frontend dir**

From the repo root, copy `octra-dashboard-v3 (3).html` to `frontend/index.html` (keep the original at the repo root untouched). PowerShell:
```powershell
Copy-Item "octra-dashboard-v3 (3).html" "frontend/index.html"
```

- [ ] **Step 2: Add the login overlay + logout button markup**

In `frontend/index.html`, immediately after the opening `<body>` tag, add this overlay markup:
```html
<div id="login-overlay" style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:#0a0e17">
  <form id="login-form" style="background:#121826;border:1px solid #243049;padding:28px;width:320px;font-family:'Space Mono',monospace">
    <div style="color:#ff6b35;letter-spacing:2px;font-size:11px;margin-bottom:16px">OCT SIGNAL — LOGIN</div>
    <input id="login-email" type="email" placeholder="email" required style="width:100%;margin-bottom:10px;padding:9px;background:#0d1320;border:1px solid #243049;color:#e6edf7" />
    <input id="login-password" type="password" placeholder="password" required style="width:100%;margin-bottom:14px;padding:9px;background:#0d1320;border:1px solid #243049;color:#e6edf7" />
    <button type="submit" style="width:100%;padding:10px;background:#ff6b35;border:0;color:#0a0e17;font-weight:700;cursor:pointer">SIGN IN</button>
    <div id="login-error" style="color:#ff5470;font-size:10px;margin-top:10px;min-height:14px"></div>
  </form>
</div>
```
Then, inside the existing top header bar (near the `<div class="logo">…</div>` around line 182 of the prototype), add a logout button:
```html
<button id="logout-btn" style="margin-left:auto;font-size:9px;padding:4px 10px;background:transparent;border:1px solid #243049;color:#8aa0c0;cursor:pointer">LOGOUT</button>
```

- [ ] **Step 3: Delete the direct-API functions from the inline `<script>`**

In the inline `<script>` (starts ~line 411), DELETE these function definitions entirely (they make direct third-party calls — CoinGecko, Twitter, CryptoPanic, and Anthropic with an embedded key):
- `async function fetchPrice` (CoinGecko)
- `async function fetchMacro` (CoinGecko)
- `async function fetchTweets` (direct)
- `async function fetchNews` (CryptoPanic)
- `async function genAI` (Anthropic — **this is the embedded-key security defect**)
- `async function doRefresh` (replaced by app.js `refresh()`)
- Also delete any module-scope `setInterval(...)`/`doRefresh()` bootstrap calls and any direct `fetch('https://api.anthropic.com...'`, `api.coingecko`, `cryptopanic.com` references that remain.

KEEP these (no API keys; reused by the glue): `setFibDir`, `calcFib`, the DexScreener chart/`dex-frame`/`itabs` interval logic, `fallbackTweets`, `renderTweets`, `twFilter`, `updateTwStats`, `avCol1`, `avCol2`, `renderNews`, `renderStaticNews`, `buildExits`, `calcPort`, `computeSignal`, `defAI`, `fmtP`, `fmtL`, `ago`, `setBar`. Export the render/format helpers the glue needs by attaching them to `window` (e.g. at the end of the inline script add `window.renderTweets = renderTweets; window.renderNews = renderNews; window.computeSignal = computeSignal; window.fmtP = fmtP; window.fmtL = fmtL;` and any others `app.js` calls), OR leave them as inline functions and have `app.js` dispatch a `window` event the inline script listens to. Prefer the `window.*` export approach for simplicity.

- [ ] **Step 4: Add the config + Supabase + app module script tags**

Just before the closing `</body>` (after the existing inline `<script>`), add:
```html
<script src="js/config.js"></script>
<script type="module" src="js/app.js"></script>
```
(The CDN import of Supabase happens inside `app.js`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): clean prototype into frontend/index.html (login overlay, remove direct API calls)"
```

---

## Task 5: `app.js` glue (auth gate + fetch + render + logout)

No unit test (DOM glue); verified by Task 6 manual smoke. **Use a capable model when executing** and adapt the render mapping to the actual backend response shapes below.

Backend response shapes (for mapping):
- `getPrice()` → `{ oct, octChange24h, btc, btcChange24h, eth, ethChange24h, fetchedAt }` (any field may be `null`).
- `getNews()` → `[{ title, url, source, publishedAt, sentiment }]`.
- `getTweets()` → `[{ id, text, author, url, createdAt, sentiment }]` (`sentiment` ∈ Bullish/Bearish/Whale/Unrated).
- `analyze({force})` → `{ recommendation, confidence, summary, components, generatedAt }`.
- Any of the above may instead be `{ pending: true }` (cold cache) → render a "waiting for first data" placeholder.

**Files:**
- Create: `frontend/js/app.js`

- [ ] **Step 1: Implement `frontend/js/app.js`**

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuth } from './auth.js';
import { createApiClient, AuthError } from './api-client.js';

const cfg = window.APP_CONFIG || {};
const auth = createAuth({ createClient, supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey });
const api = createApiClient({ baseUrl: cfg.apiBaseUrl, getToken: auth.getToken });

const $ = (id) => document.getElementById(id);
const overlay = $('login-overlay');
const loginForm = $('login-form');
const loginError = $('login-error');

function showLogin(msg) {
  if (overlay) overlay.style.display = 'flex';
  if (loginError) loginError.textContent = msg || '';
}
function hideLogin() {
  if (overlay) overlay.style.display = 'none';
}

async function refresh() {
  try {
    const price = await api.getPrice();
    renderPrice(price);
    const news = await api.getNews();
    if (window.renderNews && !news.pending) window.renderNews(news);
    const tweets = await api.getTweets();
    if (window.renderTweets && !tweets.pending) window.renderTweets(tweets);
    if (window.computeSignal) window.computeSignal();
  } catch (err) {
    if (err instanceof AuthError) {
      await auth.logout();
      showLogin('Session expired — sign in again.');
    } else {
      console.error('refresh failed:', err);
    }
  }
}

function renderPrice(p) {
  if (p && p.pending) return; // cold cache — leave placeholders
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  set('prc', p.oct != null ? `$${p.oct}` : '—');
  set('chg', p.octChange24h != null ? `${p.octChange24h}%` : '—');
  set('btcp', p.btc != null ? `$${p.btc}` : '—');
  set('ethp', p.eth != null ? `$${p.eth}` : '—');
  set('fib-current-ref', p.oct != null ? `$${p.oct}` : '—');
}

async function runAnalyze() {
  try {
    const a = await api.analyze({ force: true });
    if (!a.pending && window.defAI) window.defAI(a);
  } catch (err) {
    console.error('analyze failed:', err);
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await auth.login($('login-email').value, $('login-password').value);
      hideLogin();
      await refresh();
    } catch (err) {
      showLogin(err.message || 'Login failed');
    }
  });
}

const logoutBtn = $('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await auth.logout(); showLogin(); });

const analyzeBtn = document.getElementById('btn-analyze');
if (analyzeBtn) analyzeBtn.addEventListener('click', runAnalyze);

(async function init() {
  if (!auth.isConfigured) { showLogin('Supabase not configured — see frontend/README.md'); return; }
  const token = await auth.getToken();
  if (token) { hideLogin(); await refresh(); } else { showLogin(); }
})();
```

Note on the render helpers: `window.renderNews`, `window.renderTweets`, `window.computeSignal`, `window.defAI` must be exposed from the inline script in Task 4 Step 3. If their existing signatures differ from the backend shapes above, adapt the call sites here (or add a thin adapter inside `refresh()`) so the existing render functions receive the data they expect. Wire the existing "deep analysis" button to id `btn-analyze` (add the id to that button in `index.html` if it lacks one).

- [ ] **Step 2: Commit**

```bash
git add frontend/js/app.js frontend/index.html
git commit -m "feat(frontend): add app glue (login gate, backend fetch+render, logout, analyze)"
```

---

## Task 6: README setup checklist + full frontend suite + manual smoke

**Files:**
- Create: `frontend/README.md`

- [ ] **Step 1: Create `frontend/README.md`**

```markdown
# Signal Dashboard — Frontend (v3.1, vanilla)

Static dashboard. No build step. Auth via Supabase; all data comes from the backend
(`/api/*`) — no third-party keys live in the browser.

## Run tests
`cd frontend && npm install && npm test` (vitest + jsdom — unit tests for `auth.js` and `api-client.js`).

## Go live (Supabase setup)
1. Create a Supabase project. From **Settings → API** copy the **Project URL**, the **anon public key**, and the **JWT secret**.
2. Set the backend `SUPABASE_JWT_SECRET` (in `backend/.env`) to that JWT secret so the backend accepts tokens this project issues.
3. `cp js/config.example.js js/config.js` and fill `supabaseUrl`, `anonKey`, and `apiBaseUrl` (the backend origin, e.g. `http://localhost:3000`).
4. In Supabase → Authentication, create the ≤5 user accounts manually and **disable self-signup**.
5. Serve the folder with any static server (e.g. `npx serve frontend`) and open it; the backend must be running.

## Notes
- `js/config.js` is gitignored (only `config.example.js` is committed).
- The DexScreener chart is a keyless public embed and is intentionally kept.
- Portfolio (F4) and signal scores (F5) UI are completed in Phase 3b.
```

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS — `api-client` (7) + `auth` (5) = 12 tests.

- [ ] **Step 3: Manual smoke (no keys required)**

Serve the folder (`npx serve frontend` or any static server) and open `index.html`. Expected without `config.js`/Supabase: the **login overlay is shown** with the "Supabase not configured" message and the dashboard is gated behind it (proves the gate works). With a real `config.js` + running backend + a Supabase user, signing in hides the overlay and panels populate (or show "waiting for first data" if caches are cold). Report what you observed.

- [ ] **Step 4: Commit + push**

```bash
git add frontend/README.md
git commit -m "docs(frontend): add Supabase setup checklist + run notes"
git push origin <current-branch>
```

---

## Done Criteria (Phase 3a)

- [ ] `cd frontend && npm test` passes the `auth` (5) + `api-client` (7) suites.
- [ ] `api-client.js` attaches `Authorization: Bearer <token>`, maps 200/401(AuthError)/503(pending)/other correctly, and `analyze` POSTs `{ force }`.
- [ ] `auth.js` logs in/out and returns the session token via an injected client, and degrades to `isConfigured:false` with a clear message when config is placeholder/missing.
- [ ] `index.html` shows a login overlay until authenticated, renders backend data after login, and has a logout control.
- [ ] No direct third-party API calls remain in the frontend (CoinGecko/Anthropic/CryptoPanic/Twitter removed); the DexScreener chart iframe remains.
- [ ] `frontend/js/config.js` is gitignored; `config.example.js` is committed.

## Out of Scope (later phases)

- **Phase 3b:** F4 portfolio/exit tracker, F5 deterministic signal scores, UI polish.
- **Phase 3c:** VPS deploy, HTTPS, process manager, prod scheduler.
