# Phase 2d — `POST /api/analyze` (Opus On-Demand) — Design Spec

**Date:** 2026-05-29
**Status:** Approved design (pending spec review)
**Builds on:** Phase 1 + 2a + 2b + 2c, all merged to `main` (69 tests passing).
**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` — §6 endpoint `POST /api/analyze` (Opus on-demand), F5 (Signal Scores: Price Action / Sentiment / Twitter Buzz / MA / Fibonacci → BUY/HOLD/SELL), §7.1 AI (Opus on-demand + prompt caching), cost ≤ Rp 1jt/bln.

---

## Goal

An authenticated `POST /api/analyze` that feeds the already-cached `price` + `tweets` +
`news` data to Claude **Opus**, returns a **structured** BUY/HOLD/SELL analysis, and caches
the result with a short TTL to control cost. Built **mock-first**: the AI call goes through
the injectable `complete()` interface from Phase 2c, so the feature is fully testable with
**no API keys**.

## Scope

**In scope (Phase 2d):**
- `ai/analysis.js` — provider-agnostic `analyzeMarket` (one Opus call → structured JSON).
- `analysisService.js` — cost guard: cache-if-fresh + `force` bypass.
- `routes/analyze.js` — `POST /api/analyze` (401 / 503 / 502 / 200).
- `app.js` / `server.js` / `config.js` wiring.

**Explicitly out of scope:**
- The deterministic, always-on F5 component **scores** (computed in code, no AI) and the F4
  portfolio/exit tracker — these are frontend / Phase 3 concerns.
- Real AI key wiring (set `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` later; no code change).

---

## Architecture

Reuses the Phase 2c AI abstraction unchanged. `analyzeMarket` depends only on the injected
`complete({ system, user, model })`; the Opus model id is passed per-call via the `model`
argument, so no new adapter work is needed.

```
POST /api/analyze ──► routes/analyze.js ──► analysisService.getAnalysis
                                                   │ (cost guard: cache TTL + force)
                                                   ├─ getCache price | tweets | news
                                                   └─ analyzeFn ─► ai/analysis.analyzeMarket
                                                                        │ complete({...,model:OPUS})
                                                                        ▼
                                                              setCache('analysis', {...,generatedAt})
```

### Files

| File | Status | Responsibility |
|------|--------|----------------|
| `src/ai/analysis.js` | NEW | `analyzeMarket({ price, tweets, news, complete, model })` → builds system prompt (strict-JSON instruction) + user payload, calls `complete` **once**, parses + validates. **Throws** on AI failure / malformed JSON / invalid recommendation. Mirrors `ai/sentiment.js`. |
| `src/analysisService.js` | NEW | `getAnalysis({ db, analyzeFn, ttlMs, force, now })` — returns cached `analysis` if `!force` and `now() - generatedAt < ttlMs`; else gathers warm caches, calls `analyzeFn`, stamps `generatedAt`, writes `analysis` cache, returns it. Caches **only** successful runs. |
| `src/routes/analyze.js` | NEW | `POST /` — `503` if `analyzeFn` is absent; reads `force` from body; `502` if `analyzeFn`/`getAnalysis` throws; `200` with analysis otherwise. Kept separate so `routes/cache.js` remains GET-only. |
| `src/app.js` | MODIFY | `createApp({ db, config, analyzeFn })`; mount `app.use('/api/analyze', requireAuth(config), analyzeRoute({ db, analyzeFn, ttlMs: config.analysisTtlMs }))` **before** the `/api` cache mount. `analyzeFn` optional → existing callers unaffected. |
| `src/config.js` | MODIFY | add `analysisTtlMs` (default `600000`) + `analysisModel` (optional override). |
| `src/server.js` | MODIFY | build `complete` (provider+key, as today), derive Opus default per provider, wrap `analyzeFn`, pass into `createApp`. |

### Opus model selection (`server.js`)

One `complete` is built from the active provider + key (unchanged from Phase 2c). For analysis
the Opus model id is chosen as:
```
analysisModel = config.analysisModel
  || (config.aiProvider === 'anthropic' ? 'claude-opus-4-8' : 'anthropic/claude-opus-4.8')
```
`analyzeFn = (data) => analyzeMarket({ ...data, complete, model: analysisModel })`. When no
provider key is set, `complete` is `null` → `analyzeFn` is `null` → the route returns `503`.

### Prompt + parsing

- **System prompt** (cacheable via the adapter's existing `cache_control`): instructs Opus to
  act as an OCT trading analyst and return ONLY a JSON object of the shape below — a
  recommendation, a 0–1 confidence, a concise summary, and a one-line note per F5 component.
- **User payload:** `JSON.stringify({ price, tweets, news })` with `null` for any cold cache;
  the prompt tells Opus to reason with partial data and note what's missing.
- **Parsing:** extract the first `{ … }` block (tolerates markdown fences), `JSON.parse`,
  validate `recommendation ∈ { BUY, HOLD, SELL }`. Anything else → throw (becomes a `502`).

### Response shape (`200`)

```json
{
  "recommendation": "BUY | HOLD | SELL",
  "confidence": 0.0,
  "summary": "<concise narrative>",
  "components": {
    "priceAction": "...",
    "sentiment": "...",
    "twitterBuzz": "...",
    "movingAverage": "...",
    "fibonacci": "..."
  },
  "generatedAt": 1717000000000
}
```

`POST {}` → returns the cached analysis if fresh, else re-runs Opus.
`POST { "force": true }` → bypasses the cache and re-runs Opus.

### Error behavior

| Condition | Response |
|-----------|----------|
| No valid Supabase JWT | `401` (existing `requireAuth`) |
| No AI key configured (`analyzeFn` absent) | `503 { error: 'analysis unavailable' }` |
| Opus call fails / malformed JSON / invalid recommendation | `502 { error: 'analysis failed' }`, nothing cached |
| `price`/`tweets`/`news` cold | proceed with partial data (nulls noted), `200` |

---

## Testing (mock-first, no keys)

| Test file | Covers |
|-----------|--------|
| `tests/ai/analysis.test.js` | system prompt + user payload built from data; single `complete` call; parses structured JSON (incl. markdown fences); throws on malformed output / invalid recommendation / `complete` rejection. |
| `tests/analysisService.test.js` | fresh-cache hit returns without calling `analyzeFn`; `force: true` bypasses; stale (past TTL) re-runs; gathers price/tweets/news from cache and passes them (partial/null ok); stamps `generatedAt` + writes cache; does NOT cache when `analyzeFn` throws (error propagates). |
| `tests/analyze.test.js` | supertest: `401` unauthed; `503` when `analyzeFn` not provided; `200` with analysis when injected; `force` passed through; `502` when `analyzeFn` throws. |
| `tests/config.test.js` | `analysisTtlMs` + `analysisModel` defaults + overrides. |

No live smoke (no keys). The mock suite proves all logic.

---

## Acceptance criteria

- [ ] `npm test` passes all suites including the new analysis/analyze tests.
- [ ] `analyzeMarket` makes **one** `complete` call with an Opus model and returns the structured shape; throws on failure/malformed/invalid output.
- [ ] `getAnalysis` returns a fresh cached analysis without calling Opus; `force: true` and TTL expiry both trigger a re-run; only successful runs are cached.
- [ ] `POST /api/analyze` returns `401` unauthed, `503` with no AI key, `502` on analysis failure, `200` with the analysis (incl. `generatedAt`) otherwise.
- [ ] Cold price/tweets/news still yields a `200` (partial data).
- [ ] Prompt caching applies to the analysis system prompt (via the existing adapter `cache_control`).

## Out of scope (later phases)

- **Phase 3:** Supabase login UI, frontend v3.1 wiring (incl. deterministic F5 component scores + F4 portfolio tracker), VPS deploy.
- Real Apify/Xpoz scraper + real AI key wiring.
