# Phase 3a — Frontend Auth + Backend API Wiring — Design Spec

**Date:** 2026-05-29
**Status:** Approved design (pending spec review)
**Builds on:** Phases 1–2d (backend feature-complete on `main`; 87 tests passing). Backend endpoints: `GET /api/price`, `GET /api/news`, `GET /api/tweets`, `POST /api/analyze`, all behind Supabase JWT auth.
**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` — §6 (all `/api/*` behind auth; no keys in client), §7.1 (Supabase Auth, anon key in client; continue/tidy the v3.1 prototype, do **not** rebuild in a framework), §7.3 endpoints.
**Prototype:** `octra-dashboard-v3 (3).html` (887-line vanilla HTML/JS; DexScreener chart iframe + client-side Fibonacci; direct browser calls to CoinGecko / Anthropic / CryptoPanic / Twitter).

---

## Goal

Gate the dashboard behind Supabase email/password login and replace **every** direct-from-browser
third-party API call with authenticated calls to the existing backend. Built **config-driven and
mock-first**: the auth + API-client logic is unit-tested with injected mocks; real Supabase
activates by filling in `config.js` later. No framework, no build step.

## Scope

**In scope (Phase 3a):**
- New `frontend/` directory: cleaned `index.html` + extracted vanilla ES modules + own vitest setup.
- `auth.js` — Supabase login/logout/token (config-driven; injectable client).
- `api-client.js` — wraps the four backend endpoints with the Bearer token (injectable fetch).
- `app.js` — thin DOM glue: login gate, fetch+render into existing prototype elements, logout.
- Remove all direct browser API calls (CoinGecko / Anthropic / CryptoPanic / Twitter).
- Supabase setup checklist.

**Explicitly out of scope (later sub-phases):**
- **Phase 3b:** F4 portfolio/exit tracker, F5 deterministic signal scores, UI polish.
- **Phase 3c:** VPS deploy, HTTPS, process manager, prod scheduler.
- 3a keeps the prototype's existing rendering; it only changes the data **source** and adds the gate.

---

## Architecture

No framework, no bundler. `index.html` keeps its markup + CSS. The inline data/auth logic is
extracted into small ES modules that import nothing external, so they are unit-testable with
injected fakes. The browser supplies the real Supabase client from a CDN and passes its
`createClient` into `auth.js`.

```
index.html ── imports ──► CDN: @supabase/supabase-js (createClient)
     │ sets window.APP_CONFIG (from js/config.js)
     ▼
  js/app.js  ── init ──► auth.js (createAuth)  ──► getToken()
     │                        │                       │
     │                        ▼                       ▼
     └── fetch+render ──► api-client.js (createApiClient: getPrice/getNews/getTweets/analyze)
                                 │  Authorization: Bearer <token>
                                 ▼
                          Backend /api/* (existing)
```

### Files

| File | Status | Responsibility |
|------|--------|----------------|
| `frontend/index.html` | NEW (from prototype) | Cleaned v3 dashboard: markup + CSS kept; a login overlay added; a single `<script type="module">` block (or `app.js` import) is the only glue. DexScreener chart iframe retained. |
| `frontend/js/config.js` | NEW (gitignored) | Sets `window.APP_CONFIG = { supabaseUrl, anonKey, apiBaseUrl }`. Real values live here, never committed. |
| `frontend/js/config.example.js` | NEW (committed) | Template with placeholder values + comments. |
| `frontend/js/auth.js` | NEW | `createAuth({ createClient, supabaseUrl, anonKey })` → `{ isConfigured, login(email,pw), logout(), getToken(), getUser(), onChange(cb) }`. Imports nothing external. |
| `frontend/js/api-client.js` | NEW | `createApiClient({ baseUrl, getToken, fetchFn })` → `{ getPrice(), getNews(), getTweets(), analyze({ force }) }`. Imports nothing external. |
| `frontend/js/app.js` | NEW | Thin DOM glue (NOT unit-tested): init auth, gate UI, fetch + render into existing elements, logout, 401→re-login. |
| `frontend/package.json` | NEW | `devDependencies`: `vitest`, `jsdom`. Scripts: `test`, `test:watch`. |
| `frontend/tests/auth.test.js` | NEW | unit tests for `auth.js`. |
| `frontend/tests/api-client.test.js` | NEW | unit tests for `api-client.js`. |
| `frontend/.gitignore` | NEW | ignores `node_modules/`, `js/config.js`. |

### `api-client.js` contract

`createApiClient({ baseUrl, getToken, fetchFn = fetch })` returns an object whose methods call
the backend with the bearer token:

- `getPrice()` → `GET {baseUrl}/api/price`
- `getNews()` → `GET {baseUrl}/api/news`
- `getTweets()` → `GET {baseUrl}/api/tweets`
- `analyze({ force = false } = {})` → `POST {baseUrl}/api/analyze` with JSON body `{ force }`

Shared response handling:
- Build headers `{ Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json' }`.
- `res.ok` → `await res.json()`.
- `res.status === 401` → throw `AuthError` (an `Error` subclass) so the glue can trigger re-login.
- `res.status === 503` → return the sentinel `{ pending: true }` (UI shows "waiting for first fetch").
- Any other non-ok status → throw `Error('request failed: ' + status)`.

### `auth.js` contract

`createAuth({ createClient, supabaseUrl, anonKey })`:
- If `supabaseUrl` or `anonKey` is missing or still a placeholder (`startsWith('YOUR_')`), return
  `{ isConfigured: false, login: async () => { throw new Error('Supabase not configured'); }, logout: async () => {}, getToken: async () => null, getUser: async () => null, onChange: () => {} }`.
- Otherwise build `client = createClient(supabaseUrl, anonKey)` and return:
  - `isConfigured: true`
  - `login(email, password)` → `client.auth.signInWithPassword({ email, password })`; throw on error.
  - `logout()` → `client.auth.signOut()`.
  - `getToken()` → `(await client.auth.getSession()).data.session?.access_token ?? null`.
  - `getUser()` → `(await client.auth.getSession()).data.session?.user ?? null`.
  - `onChange(cb)` → `client.auth.onAuthStateChange((_e, session) => cb(session))`.

### `app.js` glue (thin, not unit-tested)

On `DOMContentLoaded`: read `window.APP_CONFIG`; `const auth = createAuth({ createClient, ...cfg })`;
`const api = createApiClient({ baseUrl: cfg.apiBaseUrl, getToken: auth.getToken })`. If no current
session → show the login overlay; on submit call `auth.login(...)`, on success hide overlay and
`refresh()`. `refresh()` calls `api.getPrice/getNews/getTweets` (and `analyze` on the existing
"deep analysis" button) and renders into the existing prototype DOM nodes; a `{ pending: true }`
result renders a "waiting for first data" state; an `AuthError` clears the session and re-shows login.
A logout button calls `auth.logout()` and re-shows the overlay.

### Removed direct calls

Delete from the prototype: the CoinGecko `fetch`es (price/macro), the **Anthropic** `fetch`es
(the API key was embedded in the client — the core security defect this phase fixes), the
CryptoPanic `fetch`, and the Twitter call. Each is replaced by the corresponding `api.*` call.
The **DexScreener chart iframe stays** (keyless public embed; the spec mandates this chart).

### Error / states

| Condition | UI behavior |
|-----------|-------------|
| Not logged in / no session | Login overlay shown; dashboard hidden. |
| Backend `401` (expired/invalid token) | Clear session, re-show login overlay. |
| Backend `503` (cold cache) | Per-panel "waiting for first data" placeholder; no error toast. |
| Network / other error | Per-panel error state; console-logged. |
| Supabase not configured | Login overlay shows a "Supabase not configured — see setup" notice. |

---

## Testing (mock-first, no keys, vitest + jsdom)

| Test file | Covers |
|-----------|--------|
| `tests/api-client.test.js` | each method hits the right URL with `Authorization: Bearer <token>` from `getToken` (mock `fetchFn`); 200 returns parsed json; 401 throws `AuthError`; 503 returns `{ pending: true }`; other non-ok throws; `analyze({force:true})` POSTs body `{ force: true }`. |
| `tests/auth.test.js` | injected fake `createClient`: `login` calls `signInWithPassword` with the credentials and throws on error; `getToken` returns the session `access_token` (and `null` when no session); `logout` calls `signOut`; placeholder/missing config → `isConfigured === false` and `login` throws "Supabase not configured". |

`frontend/package.json` test script runs `vitest run` with the `jsdom` environment. No live
Supabase or backend needed — all boundaries are injected.

---

## Supabase setup checklist (documented in `frontend/README.md`, performed when going live)

1. Create a Supabase project; from **Settings → API** copy the **Project URL**, the **anon public key**, and the **JWT secret**.
2. Set the backend's `SUPABASE_JWT_SECRET` (in `backend/.env`) to that JWT secret so the backend verifies tokens this project issues.
3. `cp frontend/js/config.example.js frontend/js/config.js` and fill `supabaseUrl`, `anonKey`, and `apiBaseUrl` (the backend origin).
4. In the Supabase dashboard, create the ≤5 user accounts manually (email + password). **Disable self-signup** (Authentication → Providers/Settings).
5. Serve `frontend/` (any static server during dev; real hosting is Phase 3c).

---

## Acceptance criteria

- [ ] `cd frontend && npm test` passes the new `auth` + `api-client` suites (vitest + jsdom).
- [ ] `api-client.js` attaches `Authorization: Bearer <token>` to every call, maps 200/401/503/other correctly, and `analyze` POSTs `{ force }`.
- [ ] `auth.js` logs in / out / returns the session token via an injected client, and degrades to `isConfigured:false` with a clear message when config is absent/placeholder.
- [ ] `index.html` shows a login overlay until authenticated, renders backend data after login, and has a logout control.
- [ ] No direct third-party API calls remain in the frontend (CoinGecko/Anthropic/CryptoPanic/Twitter all removed); the DexScreener chart iframe remains.
- [ ] `frontend/js/config.js` is gitignored; `config.example.js` is committed.

## Out of scope (later phases)

- **Phase 3b:** F4 portfolio/exit tracker, F5 deterministic signal scores, UI polish.
- **Phase 3c:** VPS deploy, HTTPS, process manager, prod scheduler.
