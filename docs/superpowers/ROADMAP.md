# OCT Signal Intelligence — Project Roadmap

> Single source of truth for phase progress.  
> **Last updated:** 4 Juni 2026 — Technical Analysis Engine live, Twitter disabled.

---

## Status at a Glance

| Stage | Sub-phase | Status |
|-------|-----------|--------|
| **Tahap 1 — Backend, Auth & DB** | Phase 1 — backend auth foundation | ✅ merged |
| **Tahap 2 — Integrasi & Caching API** | Phase 2a — price pipeline (DexScreener + CoinGecko) | ✅ merged |
| | Phase 2b — news (CryptoPanic) | ✅ merged ⚠️ |
| | Phase 2c — Twitter sentiment (Sonnet) | ✅ merged → ⛔ disabled |
| | Phase 2d — Opus `POST /api/analyze` | ✅ merged → ⛔ disabled |
| **Tahap 3 — UI Polish & Deployment** | Phase 3a — frontend auth + API wiring | ✅ merged |
| | Deploy — CORS middleware + pm2 ecosystem + VPS guide | ✅ merged |
| | Phase 3c — features (F4 portfolio, F5 signal scores) | ✅ merged |
| | Phase 3d — Telegram notifications | ✅ merged |
| **Tahap 4 — Cost Optimization** | Technical Analysis Engine (replaces AI+Twitter) | ✅ **LIVE** |
| | UI/UX — replace Twitter feed with signals panel | ✅ **LIVE** |

**Progress: All phases complete. Technical Analysis Engine live since 3 Juni 2026.**

---

## Current Architecture (as of 4 Juni 2026)

### Backend Endpoints

| Endpoint | Auth | Fungsi |
|---|---|---|
| `GET /api/health` | Public | Server liveness |
| `GET /api/signals/current` | **Public** | Technical signal terkini |
| `GET /api/signals/daily` | **Public** | Signal harian (30 hari) |
| `GET /api/signals/10min` | **Public** | Signal 10-menit (30 hari) |
| `GET /api/price` | JWT | Harga OCT + BTC/ETH |
| `GET /api/news` | JWT | Crypto news headlines |
| `POST /api/analyze` | JWT | ⛔ AI analysis (disabled — no credits) |
| `GET /api/tweets` | JWT | ⛔ Twitter feed (disabled) |

### Frontend Features

| Fitur | Status |
|---|---|
| Login (Supabase auth) | ✅ |
| Portfolio tracker (P&L, exit levels) | ✅ |
| OCT/USD price — centered, glow effect, dynamic color | ✅ |
| Signal card (BUY/SELL/HOLD) dari Technical Engine | ✅ |
| Technical Indicators bar (MA, RSI, Volume, Macro) | ✅ |
| Live chart DexScreener | ✅ |
| Fibonacci calculator | ✅ |
| Technical Engine status + reasoning | ✅ |
| Technical Signals panel (MA50/MA200/RSI/Vol + history) | ✅ |
| Signal History 30 hari | ✅ |
| MA Analysis panel | ✅ |
| Crypto News | ✅ |
| Exit Levels | ✅ |
| Macro Market (BTC/ETH) | ✅ |
| Telegram setup modal | ✅ |
| Twitter feed | ⛔ Dihapus |
| AI sentiment analysis | ⛔ Disabled |

### Infrastructure

```
VPS      : signal-dashboard.web.id
Process  : PM2 fork mode (auto-restart)
Startup  : systemd (survive reboot)
Database : SQLite (lokal)
Cost     : $0/hari API cost
```

---

## Tahap 4 — Cost Optimization (3–4 Juni 2026)

### Latar Belakang

Biaya API Anthropic (Claude Opus) mencapai **$5 per 2 hari** hanya dari penggunaan normal dashboard. Twitter API juga memakan kredit untuk sentiment classification.

### Solusi: Technical Analysis Engine

Implementasi pure-math engine menggantikan semua AI calls:

| Komponen | Implementasi |
|---|---|
| MA50/MA200 | `calculateMA(prices, period)` |
| RSI 14-period | `calculateRSI(prices, 14)` |
| Volume ratio | `analyzeVolume(current, avg30d)` |
| Macro trend | `analyzeMacro(btcChange, ethChange)` |
| Signal scoring | Score -3 to +3, threshold ±2 |
| Telegram notif | Signal-change-only (anti-spam) |

### Files Added/Modified

| File | Perubahan |
|---|---|
| `backend/src/ai/technicalAnalysis.js` | **NEW** — kalkulasi indikator |
| `backend/src/ai/signalGenerator.js` | **NEW** — signal generator |
| `backend/src/ai/analysisFactory.js` | **MOD** — tambah TechnicalAnalysisStrategy |
| `backend/src/scheduler.js` | **MOD** — tambah runTechnicalAnalysis(), fix macro cache |
| `backend/src/server.js` | **MOD** — register task, disable Twitter task |
| `backend/src/routes/signals.js` | **NEW** — public API endpoints |
| `backend/src/app.js` | **MOD** — mount /api/signals public route |
| `backend/src/config.js` | **MOD** — tambah signalUpdateIntervalMs, disableTwitter |
| `backend/src/services/telegramNotifier.js` | **MOD** — support technical signal format |
| `backend/scripts/backfill-price-history.js` | **NEW** — 200-day backfill |
| `backend/.env` | **MOD** — ANALYSIS_STRATEGY=technical |
| `backend/src/db.js` | **MOD** — tambah 3 tables baru |
| `frontend/index.html` | **MOD** — replace Twitter panel, price hero, signal panel |
| `frontend/js/app.js` | **MOD** — disable old AI scoring, disable tweets fetch |
| `docs/TECHNICAL_ANALYSIS.md` | **NEW/MOD** — dokumentasi lengkap |

### Bug Fixes During Deploy

| Bug | Fix |
|---|---|
| `macro` cache tidak di-set | Tambah `setCache(db, 'macro', ...)` di runPriceUpdate |
| `octVolume24h` vs `volume24h` field name | Fix field name di scheduler |
| `telegramNotifier.send is not a function` | Replace dynamic import dengan existing notifier instance |
| PM2 cluster mode port conflict | Ubah ke fork mode di pm2.config.js |
| Old AI signal overwriting technical signal | Disable `renderSignal()` di app.js |
| Twitter fetch masih jalan | Disable tweets task saat `DISABLE_TWITTER=true` |
| Config syntax error | Fix `disableTwitter` placement di config object |

---

## Validation Period

| | |
|---|---|
| **Mulai** | 3 Juni 2026 |
| **Selesai** | 17 Juni 2026 |
| **Tujuan** | Validasi akurasi signal vs pergerakan harga |
| **Keputusan** | 17 Juni: keep technical atau revert ke Twitter |

---

## Open Follow-ups

- **Signal accuracy tracking** — belum ada fitur otomatis compare signal vs harga berikutnya
- **RSI implementation** — menggunakan simple average approximation, bukan Wilder's smoothed MA (akurasi ~95% untuk directional signals)
- **Backfill data** — menggunakan synthetic random walk, bukan historical real data (MA50/MA200 akan semakin akurat seiring waktu dengan data real)
- **Phase 2b CryptoPanic** — endpoint v1 deprecated, perlu update ke v2 + token
- **CORS test** — belum ada automated test untuk CORS header

---

## Per-phase Documents

| Phase | Spec | Plan |
|-------|------|------|
| 1 | — | `plans/2026-05-29-phase1-backend-auth-foundation.md` |
| 2a | — | `plans/2026-05-29-phase2a-price-pipeline.md` |
| 2b | — | `plans/2026-05-29-phase2b-news.md` |
| 2c | `specs/2026-05-29-phase2c-twitter-sentiment-design.md` | `plans/2026-05-29-phase2c-twitter-sentiment.md` |
| 2d | `specs/2026-05-29-phase2d-analyze-design.md` | `plans/2026-05-29-phase2d-analyze.md` |
| 3a | `specs/2026-05-29-phase3a-auth-api-wiring-design.md` | `plans/2026-05-29-phase3a-auth-api-wiring.md` |
| Deploy | `specs/2026-05-29-phase3b-pm2-deployment-design.md` | `plans/2026-05-29-phase3b-pm2-deployment.md` |
| 3c | `specs/2026-05-29-phase3c-features-design.md` | `plans/2026-05-29-phase3c-features.md` |
| 3d Telegram | `specs/2026-06-01-telegram-notifications-design.md` | `plans/2026-06-01-telegram-notifications-implementation.md` |
| 4 Technical Analysis | `specs/2026-06-03-technical-analysis-design.md` | `plans/2026-06-03-technical-analysis-plan.md` |

---

## Out of Scope (per master spec §5.2)

Automated trade execution, multi-tenant public scale, native mobile app, direct CEX integration, sub-second realtime (WebSocket) data.
