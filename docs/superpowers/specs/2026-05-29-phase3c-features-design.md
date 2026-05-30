# Phase 3c — F4 Portfolio + F5 Signal Scores + Functional Polish — Design Spec

**Date:** 2026-05-29
**Status:** Approved design (pending spec review)
**Builds on:** Phase 3a (frontend auth + API client) + deploy slice, merged to `main`. Frontend is vanilla ES modules + vitest/jsdom (12 tests). Backend feature-complete (87 tests).
**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` — **F4** (Portfolio & Exit Plan Tracker), **F5** (Signal Scores → BUY/HOLD/SELL).
**Prototype source:** `frontend/index.html` (the cleaned v3 dashboard; F4/F5 logic currently lives tangled in the inline `<script>`).

---

## Goal

Make the **F4 portfolio/exit tracker** and **F5 signal indicator** compute from real data, by
extracting their math into small **tested** vanilla modules (consistent with Phase 3a) and wiring
F5's inputs from the backend instead of scraping DOM text. Plus targeted **functional polish** of
the known tweet-feed gaps. No layout redesign — the spec says tidy, not rebuild.

## Scope

**In scope:**
- `frontend/js/portfolio.js` — pure F4 math (portfolio value/PnL, exit-level status, sell amounts).
- `frontend/js/signal.js` — pure F5 scoring (derive 5 components from data → weighted score → BUY/HOLD/SELL).
- Wire both into the existing DOM (replacing the tangled inline `buildExits`/`calcPort`/`computeSignal`).
- Functional polish: tweet filters mapped to backend sentiment labels; clean handling of missing tweet metadata.
- Unit tests for `portfolio.js` and `signal.js`.

**Out of scope:**
- Real Moving-Average / OHLC candle data (backend has none) — **MA is dropped from F5** (see below). The DexScreener chart still shows MAs visually.
- Visual/layout redesign; the F6 news panel and the chart are unchanged.

---

## Architecture

Same pattern as Phase 3a: pure logic in importable ES modules (unit-tested), thin DOM glue in
`app.js`/inline (not unit-tested). The two modules import nothing external.

### `frontend/js/portfolio.js`

```
EXIT_LEVELS  // T1–T7, $0.25→$3.00 (from the prototype):
  [{p:0.25,pct:10,lbl:'T1 — Quick flip'}, {p:0.40,pct:20,lbl:'T2 — Capital recovery ⭐'},
   {p:0.65,pct:15,lbl:'T3 — Profit zone'}, {p:1.00,pct:20,lbl:'T4 — 1x milestone'},
   {p:1.50,pct:15,lbl:'T5 — Strong run'},  {p:2.20,pct:10,lbl:'T6 — Moonbag trim'},
   {p:3.00,pct:10,lbl:'T7 — Target 🎯'}]   // sell-% sums to 100

computePortfolio({ amount, avgBuy, price }) -> { value, cost, pnl, pnlPct }
  // value = amount*price; cost = amount*avgBuy; pnl = value-cost; pnlPct = pnl/cost*100.
  // Any missing/zero input → that derived field is null (never NaN). amount/price only → value set, pnl null.

computeExitLevels({ price, amount }) -> [{ p, pct, lbl, status, sellAmount }]
  // status: 'done' if price > p*1.12; 'current' if p*0.88 <= price <= p*1.12; else 'pending'.
  // sellAmount = amount > 0 ? round(amount*pct/100) : null.

nextTarget({ price }) -> level | null   // first EXIT_LEVELS entry with p > price
```

### `frontend/js/signal.js`

```
WEIGHTS = { priceAction:0.30, sentiment:0.25, twitterBuzz:0.25, fibonacci:0.10, news:0.10 } // sums to 1.0

deriveComponents({ priceChange, tweets, news, fib }) -> { priceAction, sentiment, twitterBuzz, fibonacci, news }  // each 0..100
  // priceAction : clamp(50 + (priceChange||0)*3, 0, 100)
  // sentiment   : from tweets — bull/(bull+bear)*100 over rated tweets (Bullish/Bearish); 50 if none rated.
  // twitterBuzz : volume + whale signal — min(100, tweetCount*8) blended with whale share; 50 if no tweets.
  // fibonacci   : fib = { low, high } from the on-page Fibonacci calculator → clamp((price-low)/(high-low)*100,0,100); 50 if fib unset.
  // news        : positive/(positive+negative)*100 over news items with a sentiment; 50 if none.

computeSignal(components, weights = WEIGHTS) -> { score, recommendation }
  // score = Σ component*weight (0..100, rounded).
  // recommendation: score >= 62 → 'BUY'; score <= 37 → 'SELL'; else 'HOLD'.
```

**MA dropped:** the prototype's 5th component (momentum/MA, weight .25) is removed; its weight is
redistributed across Price Action (+.10), Sentiment/Twitter Buzz (+.05 each), Fibonacci/News
(unchanged), giving the weights above. F5 thus reports the **four spec components** (Price Action,
Sentiment, Twitter Buzz, Fibonacci) plus a minor **News** input.

### DOM wiring (glue, not unit-tested)

- **F4:** existing inputs `#oct-amt`, `#avg-buy` (their `oninput` already calls a portfolio refresh).
  The glue calls `computePortfolio` + `computeExitLevels` + `nextTarget` and renders into
  `#pv` (value), `#ppnl`/`#ppnlp` (PnL $/%), `#pnxt` (next target), `#exits` (level rows). Render
  also re-runs on each price refresh (so status/PnL track the live price held in the page's `CUR_PRICE`).
- **F5:** in `app.js refresh()`, after fetching price/tweets/news, build `deriveComponents({ priceChange: price.octChange24h, tweets, news, fib })`, call `computeSignal`, and render the component bars + the `#msig`/`#mconf`/`#scrd` recommendation card. `fib` comes from the existing Fibonacci calculator's swing low/high inputs.

### Functional polish

- **Tweet filters** (`twFilter`): map the filter buttons to the backend's real labels — `all`,
  `Bullish`, `Bearish`, `Whale`. Remove the dead `listing/dev/fib` buttons (no backend field backs them).
- **Tweet metadata:** the backend tweet shape has no likes/retweets — render those rows omitted
  (no `❤️ 0 / 🔁 0` noise) rather than zeros.

---

## Testing (mock-first, vitest + jsdom)

| Test file | Covers |
|-----------|--------|
| `frontend/tests/portfolio.test.js` | `computePortfolio` value/cost/pnl/pnlPct incl. null-safety (no avgBuy → pnl null; no price → value null); `computeExitLevels` status transitions (done/current/pending across the ±12% bands) + `sellAmount`; `nextTarget` selection + null past the top level. |
| `frontend/tests/signal.test.js` | `deriveComponents` mapping from sample price/tweets/news/fib (bull-heavy → high sentiment; whale-heavy → high buzz; price near swing-high → high fib); default 50s when data absent; `computeSignal` weighted score + BUY/HOLD/SELL thresholds; WEIGHTS sum to 1.0. |

Glue (`app.js`/inline DOM rendering) is verified by manual smoke, not unit-tested (per Phase 3a precedent).

---

## Acceptance criteria

- [ ] `cd frontend && npm test` passes the existing 12 plus new `portfolio` + `signal` suites.
- [ ] `computePortfolio`/`computeExitLevels`/`nextTarget` are pure, null-safe, and tested.
- [ ] `deriveComponents`/`computeSignal` produce the 5 components (MA excluded) with weights summing to 1.0, and the BUY/HOLD/SELL thresholds (≥62 / ≤37).
- [ ] F4 panel shows live portfolio value, PnL, next target, and exit-level statuses driven by the live price.
- [ ] F5 indicator shows real component bars + a combined recommendation derived from backend data (not DOM-scraped).
- [ ] Tweet filters match backend labels (all/Bullish/Bearish/Whale); dead filters removed; no fake likes/retweets shown.

## Out of scope (future)

- Real MA/OHLC candle data in the backend (would re-add the MA component).
- Visual/layout redesign and any new panels.
- After this phase, **all of F1–F6 are implemented** — remaining work is operational (live keys, deploy hardening).
