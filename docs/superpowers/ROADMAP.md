# OCT Signal Intelligence — Project Roadmap

> Single source of truth for phase progress. Master design: `specs/2026-05-29-signal-intelligence-dashboard-design.md`.
> The master spec defines **3 official stages (Tahap)**; implementation decomposes them into **8 sub-phases** so each ships as its own spec → plan → tested code cycle.
> **Last updated:** 2026-05-29.

## Status at a glance

| Stage | Sub-phase | Spec | Plan | Status |
|-------|-----------|:----:|:----:|--------|
| **Tahap 1 — Backend, Auth & DB** | Phase 1 — backend auth foundation | (in plan) | ✅ | ✅ merged |
| **Tahap 2 — Integrasi & Caching API** | Phase 2a — price pipeline (DexScreener + CoinGecko) | (in plan) | ✅ | ✅ merged |
| | Phase 2b — news (CryptoPanic) | (in plan) | ✅ | ✅ merged ⚠️ |
| | Phase 2c — Twitter sentiment (Sonnet) | ✅ | ✅ | ✅ merged |
| | Phase 2d — Opus `POST /api/analyze` | ✅ | ✅ | ✅ merged |
| **Tahap 3 — UI Polish & Deployment** | Phase 3a — frontend auth + API wiring | ✅ | ⏳ | 🔵 spec ready |
| | Phase 3b — features (F4 portfolio, F5 signal scores) + UI polish | ⏳ | ⏳ | ⬜ not started |
| | Phase 3c — VPS deploy (HTTPS, process manager, prod scheduler) | ⏳ | ⏳ | ⬜ not started |

**Progress: 5 / 8 sub-phases merged.** Tahap 1 & 2 complete; Tahap 3 in progress.

Legend: ✅ done · 🔵 ready/in progress · ⏳ pending · ⬜ not started · ⚠️ has a known follow-up.

## Backend surface (all merged, behind Supabase JWT auth)

- `GET /api/health` — public liveness.
- `GET /api/price` — OCT (DexScreener) + BTC/ETH (CoinGecko) from cache.
- `GET /api/news` — CryptoPanic headlines from cache.
- `GET /api/tweets` — AI-classified tweets (Bullish/Bearish/Whale/Unrated) from cache.
- `POST /api/analyze` — Opus on-demand deep analysis (BUY/HOLD/SELL), cached with TTL + `force`.

Tests: **87 passing** (backend). AI is provider-abstracted (OpenRouter default, official Anthropic fallback). Everything built **mock-first** — runs/tests without live keys.

## Per-phase documents

| Phase | Spec | Plan |
|-------|------|------|
| 1 | — | `plans/2026-05-29-phase1-backend-auth-foundation.md` |
| 2a | — | `plans/2026-05-29-phase2a-price-pipeline.md` |
| 2b | — | `plans/2026-05-29-phase2b-news.md` |
| 2c | `specs/2026-05-29-phase2c-twitter-sentiment-design.md` | `plans/2026-05-29-phase2c-twitter-sentiment.md` |
| 2d | `specs/2026-05-29-phase2d-analyze-design.md` | `plans/2026-05-29-phase2d-analyze.md` |
| 3a | `specs/2026-05-29-phase3a-auth-api-wiring-design.md` | _(pending)_ |
| 3b | _(pending)_ | _(pending)_ |
| 3c | _(pending)_ | _(pending)_ |

## Open follow-ups (non-blocking)

- **Live keys not yet wired** (everything is mock-first until then):
  - AI: `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` — without it, tweets store `Unrated` and `/api/analyze` returns `503`.
  - Twitter scraper: `TWITTER_SCRAPER_TOKEN` (Apify/Xpoz) — without it the tweets feed stays `503`; confirm real field names at wiring time.
  - Supabase: project URL + anon key + JWT secret (needed for Phase 3a login).
- **Phase 2b CryptoPanic 404:** the public v1 endpoint is deprecated; set `CRYPTOPANIC_TOKEN` and confirm the current endpoint/path for real news data.
- **Phase 2d minors:** clamp `confidence` to `[0,1]`; assert system-prompt content in tests; add a code comment on the `getAnalysis` NaN-comparison guard.

## Out of scope (whole project, per master spec §5.2)

Automated trade execution / bots, multi-tenant public scale, native mobile app, direct CEX integration, sub-second real-time (WebSocket) data.
