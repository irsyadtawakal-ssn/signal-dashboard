# OCT Signal Intelligence — Project Roadmap

> Single source of truth for phase progress. Master design: `specs/2026-05-29-signal-intelligence-dashboard-design.md`.
> The master spec defines **3 official stages (Tahap)**; implementation decomposes them into sub-phases so each ships as its own spec → plan → tested code cycle.
> **Last updated:** 2026-05-30 (Phase 3c merged — all features F1–F6 implemented).

## Status at a glance

| Stage | Sub-phase | Spec | Plan | Status |
|-------|-----------|:----:|:----:|--------|
| **Tahap 1 — Backend, Auth & DB** | Phase 1 — backend auth foundation | (in plan) | ✅ | ✅ merged |
| **Tahap 2 — Integrasi & Caching API** | Phase 2a — price pipeline (DexScreener + CoinGecko) | (in plan) | ✅ | ✅ merged |
| | Phase 2b — news (CryptoPanic) | (in plan) | ✅ | ✅ merged ⚠️ |
| | Phase 2c — Twitter sentiment (Sonnet) | ✅ | ✅ | ✅ merged |
| | Phase 2d — Opus `POST /api/analyze` | ✅ | ✅ | ✅ merged |
| **Tahap 3 — UI Polish & Deployment** | Phase 3a — frontend auth + API wiring | ✅ | ✅ | ✅ merged |
| | Deploy — CORS middleware + pm2 ecosystem + VPS guide | ✅ | ✅ | ✅ merged |
| | Phase 3c — features (F4 portfolio, F5 signal scores) + polish | ✅ | ✅ | ✅ merged |

**Progress: 8 / 8 sub-phases merged. 🎉 All features F1–F6 implemented.** Remaining work is operational only (live keys, deploy, the noted follow-ups).

Legend: ✅ done · 🔵 ready/in progress · ⏳ pending · ⬜ not started · ⚠️ has a known follow-up.

> **Phasing note:** the deploy slice (CORS + pm2) was completed concurrently and merged into
> `main` (commit `9704737`) ahead of the F4/F5 feature work — so the original "3b = features,
> 3c = deploy" numbering no longer holds. The table above reflects what actually landed: **deploy
> is done; the remaining work is the F4/F5 dashboard features + polish.** Its spec/plan live at
> `specs/…phase3b-pm2-deployment-design.md` and `plans/…phase3b-pm2-deployment.md` (labeled "3b"
> by that session). The CORS + pm2 commits did not pass this project's TDD/review loop but were
> reviewed post-hoc: clean, no blocking issues (no CORS header test; `pm2 instances:1` correct for
> the in-process scheduler + SQLite).

## Backend surface (all merged, behind Supabase JWT auth)

- `GET /api/health` — public liveness.
- `GET /api/price` — OCT (DexScreener) + BTC/ETH (CoinGecko) from cache.
- `GET /api/news` — CryptoPanic headlines from cache.
- `GET /api/tweets` — AI-classified tweets (Bullish/Bearish/Whale/Unrated) from cache.
- `POST /api/analyze` — Opus on-demand deep analysis (BUY/HOLD/SELL), cached with TTL + `force`.

CORS is configurable via `CORS_ORIGIN` (allow-all by default — fine for a private VPS). Deploy via pm2 (`backend/pm2.config.js`, single instance to keep the in-process scheduler + SQLite consistent).

Tests: **87 passing** (backend) + **31 passing** (frontend: `auth`, `api-client`, `portfolio`, `signal`). AI is provider-abstracted (OpenRouter default, official Anthropic fallback). Everything built **mock-first** — runs/tests without live keys.

Frontend (vanilla, no build): Supabase login gate + backend API client (3a); F4 portfolio/exit tracker + F5 signal scores BUY/HOLD/SELL from live data (3c). MA dropped from F5 (no candle data backend-side).

## Per-phase documents

| Phase | Spec | Plan |
|-------|------|------|
| 1 | — | `plans/2026-05-29-phase1-backend-auth-foundation.md` |
| 2a | — | `plans/2026-05-29-phase2a-price-pipeline.md` |
| 2b | — | `plans/2026-05-29-phase2b-news.md` |
| 2c | `specs/2026-05-29-phase2c-twitter-sentiment-design.md` | `plans/2026-05-29-phase2c-twitter-sentiment.md` |
| 2d | `specs/2026-05-29-phase2d-analyze-design.md` | `plans/2026-05-29-phase2d-analyze.md` |
| 3a | `specs/2026-05-29-phase3a-auth-api-wiring-design.md` | `plans/2026-05-29-phase3a-auth-api-wiring.md` |
| Deploy ("3b") | `specs/2026-05-29-phase3b-pm2-deployment-design.md` | `plans/2026-05-29-phase3b-pm2-deployment.md` |
| 3c (F4/F5 + polish) | `specs/2026-05-29-phase3c-features-design.md` | `plans/2026-05-29-phase3c-features.md` |

## Open follow-ups (non-blocking)

- **Live keys not yet wired** (everything is mock-first until then):
  - AI: `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` — without it, tweets store `Unrated` and `/api/analyze` returns `503`.
  - Twitter scraper: `TWITTER_SCRAPER_TOKEN` (Apify/Xpoz) — without it the tweets feed stays `503`; confirm real field names at wiring time.
  - Supabase: project URL + anon key + JWT secret (needed for Phase 3a login).
- **Phase 2b CryptoPanic 404:** the public v1 endpoint is deprecated; set `CRYPTOPANIC_TOKEN` and confirm the current endpoint/path for real news data.
- **Phase 2d minors:** clamp `confidence` to `[0,1]`; assert system-prompt content in tests; add a code comment on the `getAnalysis` NaN-comparison guard.
- **Phase 3a minors:** `auth.getUser()` untested; `auth.onChange()` implemented but not wired in `app.js` (re-login is reactive via 401); add `Array.isArray` guards in the `app.js` render mappers.
- **Deploy minors:** no CORS-header test (supertest assert `Access-Control-Allow-Origin`); `pm2 env_file:'.env'` is redundant (server.js already loads dotenv).
- **Phase 3c minors:** F5 `MA Trend` bar stays empty by design (MA dropped); whale tweets count toward Twitter Buzz, not the Sentiment ratio (per spec); add an exit-boundary test at exactly `p*1.12`/`p*0.88`.
- **No feature work remains** — F1–F6 are all implemented. What's left is operational: wire the live keys (now in `backend/.env`), run the pm2 deploy on the VPS, and address the 2b/2d/3a/deploy minors above.

## Out of scope (whole project, per master spec §5.2)

Automated trade execution / bots, multi-tenant public scale, native mobile app, direct CEX integration, sub-second real-time (WebSocket) data.
