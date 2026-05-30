# Phase 3c — F4 Portfolio + F5 Signal Scores + Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make F4 (portfolio/exit tracker) and F5 (signal scores → BUY/HOLD/SELL) compute from real data by extracting their math into tested vanilla modules and wiring them to the backend, plus functional polish of the tweet feed. No layout redesign.

**Architecture:** Two new pure ES modules (`portfolio.js`, `signal.js`) unit-tested with vitest; `app.js` imports them and renders into the existing DOM, replacing the tangled inline `buildExits`/`calcPort`/`computeSignal`. MA is dropped from F5 (backend has no candle data).

**Tech Stack:** Vanilla ES modules + vitest/jsdom (the existing `frontend/` package). No new deps.

**Reference spec:** `docs/superpowers/specs/2026-05-29-phase3c-features-design.md`. **Builds on:** Phase 3a frontend (`frontend/js/{auth,api-client,app}.js`, 12 tests).

---

## File Structure

```
frontend/js/
  portfolio.js   # NEW (Task 1): EXIT_LEVELS, computePortfolio, computeExitLevels, nextTarget
  signal.js      # NEW (Task 2): WEIGHTS, deriveComponents, computeSignal
  app.js         # MODIFIED (Tasks 3,4): import + render F4/F5 from backend data
  index.html     # MODIFIED (Tasks 3,4): remove inline buildExits/calcPort/computeSignal/EXIT_LEVELS + dead tweet filters
frontend/tests/
  portfolio.test.js  # NEW (Task 1)
  signal.test.js     # NEW (Task 2)
```

Existing DOM ids (do not rename): F4 inputs `#oct-amt`, `#avg-buy`; F4 outputs `#pv`, `#ppnl`, `#ppnlp`, `#pnxt`, `#exits`. F5 outputs `#msig` (BUY/HOLD/SELL), `#mconf` (score text), `#scrd` (card, class `sb sig-card <SIG>`). Price source in app.js: `api.getPrice()` (field `octChange24h` for price action; `oct` for the live price).

---

## Task 1: `portfolio.js` (F4 math)

**Files:** Create `frontend/js/portfolio.js`, `frontend/tests/portfolio.test.js`

- [ ] **Step 1: Write the failing test** — `frontend/tests/portfolio.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { EXIT_LEVELS, computePortfolio, computeExitLevels, nextTarget } from '../js/portfolio.js';

describe('computePortfolio', () => {
  it('computes value, cost, pnl and pnlPct with full inputs', () => {
    expect(computePortfolio({ amount: 1000, avgBuy: 0.1, price: 0.2 }))
      .toEqual({ value: 200, cost: 100, pnl: 100, pnlPct: 100 });
  });
  it('value only when avgBuy missing (pnl null)', () => {
    expect(computePortfolio({ amount: 1000, avgBuy: 0, price: 0.2 }))
      .toEqual({ value: 200, cost: null, pnl: null, pnlPct: null });
  });
  it('value null when price missing', () => {
    expect(computePortfolio({ amount: 1000, avgBuy: 0.1, price: 0 }))
      .toEqual({ value: null, cost: 100, pnl: null, pnlPct: null });
  });
  it('handles negative pnl', () => {
    const r = computePortfolio({ amount: 100, avgBuy: 0.5, price: 0.25 });
    expect(r.pnl).toBe(-25);
    expect(r.pnlPct).toBe(-50);
  });
});

describe('computeExitLevels', () => {
  it('returns one row per level with sell amounts', () => {
    const rows = computeExitLevels({ price: 0, amount: 1000 });
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ p: 0.25, pct: 10, sellAmount: 100 });
  });
  it('marks done / current / pending by price band', () => {
    const rows = computeExitLevels({ price: 0.40, amount: 0 });
    expect(rows.find((r) => r.p === 0.25).status).toBe('done');    // 0.40 > 0.25*1.12
    expect(rows.find((r) => r.p === 0.40).status).toBe('current'); // within ±12%
    expect(rows.find((r) => r.p === 1.00).status).toBe('pending'); // below band
  });
  it('sellAmount null when amount is 0', () => {
    expect(computeExitLevels({ price: 0, amount: 0 })[0].sellAmount).toBeNull();
  });
});

describe('nextTarget', () => {
  it('returns the first level above the price', () => {
    expect(nextTarget({ price: 0.30 })).toMatchObject({ p: 0.40 });
  });
  it('returns null above the top level', () => {
    expect(nextTarget({ price: 5 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run tests/portfolio.test.js` → module not found.

- [ ] **Step 3: Implement `frontend/js/portfolio.js`**
```js
const EXIT_LEVELS = [
  { p: 0.25, pct: 10, lbl: 'T1 — Quick flip' },
  { p: 0.40, pct: 20, lbl: 'T2 — Capital recovery ⭐' },
  { p: 0.65, pct: 15, lbl: 'T3 — Profit zone' },
  { p: 1.00, pct: 20, lbl: 'T4 — 1x milestone' },
  { p: 1.50, pct: 15, lbl: 'T5 — Strong run' },
  { p: 2.20, pct: 10, lbl: 'T6 — Moonbag trim' },
  { p: 3.00, pct: 10, lbl: 'T7 — Target 🎯' },
];

function computePortfolio({ amount, avgBuy, price }) {
  const value = amount > 0 && price > 0 ? amount * price : null;
  const cost = amount > 0 && avgBuy > 0 ? amount * avgBuy : null;
  const pnl = value != null && cost != null ? value - cost : null;
  const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
  return { value, cost, pnl, pnlPct };
}

function computeExitLevels({ price, amount }) {
  return EXIT_LEVELS.map((l) => {
    let status = 'pending';
    if (price > 0) {
      if (price > l.p * 1.12) status = 'done';
      else if (price >= l.p * 0.88 && price <= l.p * 1.12) status = 'current';
    }
    const sellAmount = amount > 0 ? Math.round((amount * l.pct) / 100) : null;
    return { p: l.p, pct: l.pct, lbl: l.lbl, status, sellAmount };
  });
}

function nextTarget({ price }) {
  return EXIT_LEVELS.find((l) => l.p > price) || null;
}

export { EXIT_LEVELS, computePortfolio, computeExitLevels, nextTarget };
```

- [ ] **Step 4: Run, expect PASS** — `cd frontend && npx vitest run tests/portfolio.test.js` → 9 tests pass.

- [ ] **Step 5: Commit**
```bash
git add frontend/js/portfolio.js frontend/tests/portfolio.test.js
git commit -m "feat(frontend): add tested portfolio/exit-level math (F4)"
```

---

## Task 2: `signal.js` (F5 scoring)

**Files:** Create `frontend/js/signal.js`, `frontend/tests/signal.test.js`

- [ ] **Step 1: Write the failing test** — `frontend/tests/signal.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { WEIGHTS, deriveComponents, computeSignal } from '../js/signal.js';

describe('WEIGHTS', () => {
  it('sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

describe('deriveComponents', () => {
  it('maps price change to price action (clamped 0..100)', () => {
    expect(deriveComponents({ priceChange: 10 }).priceAction).toBe(80);
    expect(deriveComponents({ priceChange: 100 }).priceAction).toBe(100);
    expect(deriveComponents({ priceChange: -100 }).priceAction).toBe(0);
    expect(deriveComponents({ priceChange: 0 }).priceAction).toBe(50);
  });
  it('sentiment from bull/bear ratio; 50 when none rated', () => {
    const tweets = [{ sentiment: 'Bullish' }, { sentiment: 'Bullish' }, { sentiment: 'Bearish' }, { sentiment: 'Unrated' }];
    expect(deriveComponents({ tweets }).sentiment).toBeCloseTo(66.67, 1);
    expect(deriveComponents({ tweets: [] }).sentiment).toBe(50);
  });
  it('twitterBuzz rewards volume + whales; 50 when empty', () => {
    expect(deriveComponents({ tweets: [] }).twitterBuzz).toBe(50);
    const many = Array.from({ length: 20 }, () => ({ sentiment: 'Whale' }));
    expect(deriveComponents({ tweets: many }).twitterBuzz).toBe(100);
  });
  it('fibonacci from price position between swing low/high', () => {
    expect(deriveComponents({ price: 0.5, fib: { low: 0, high: 1 } }).fibonacci).toBe(50);
    expect(deriveComponents({ price: 1, fib: { low: 0, high: 1 } }).fibonacci).toBe(100);
    expect(deriveComponents({ price: 0.5, fib: null }).fibonacci).toBe(50);
  });
  it('news from positive/negative ratio; 50 when none', () => {
    expect(deriveComponents({ news: [{ sentiment: 'positive' }, { sentiment: 'negative' }] }).news).toBe(50);
    expect(deriveComponents({ news: [] }).news).toBe(50);
  });
});

describe('computeSignal', () => {
  it('BUY when all components high', () => {
    expect(computeSignal({ priceAction: 90, sentiment: 90, twitterBuzz: 90, fibonacci: 90, news: 90 }))
      .toEqual({ score: 90, recommendation: 'BUY' });
  });
  it('SELL when all low', () => {
    expect(computeSignal({ priceAction: 20, sentiment: 20, twitterBuzz: 20, fibonacci: 20, news: 20 }))
      .toEqual({ score: 20, recommendation: 'SELL' });
  });
  it('HOLD in the middle', () => {
    expect(computeSignal({ priceAction: 50, sentiment: 50, twitterBuzz: 50, fibonacci: 50, news: 50 }))
      .toEqual({ score: 50, recommendation: 'HOLD' });
  });
  it('BUY at the 62 boundary, SELL at the 37 boundary', () => {
    expect(computeSignal({ priceAction: 62, sentiment: 62, twitterBuzz: 62, fibonacci: 62, news: 62 }).recommendation).toBe('BUY');
    expect(computeSignal({ priceAction: 37, sentiment: 37, twitterBuzz: 37, fibonacci: 37, news: 37 }).recommendation).toBe('SELL');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run tests/signal.test.js` → module not found.

- [ ] **Step 3: Implement `frontend/js/signal.js`**
```js
const WEIGHTS = { priceAction: 0.30, sentiment: 0.25, twitterBuzz: 0.25, fibonacci: 0.10, news: 0.10 };

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function priceActionScore(priceChange) {
  return clamp(50 + (priceChange || 0) * 3, 0, 100);
}

function sentimentScore(tweets) {
  if (!Array.isArray(tweets)) return 50;
  let bull = 0, bear = 0;
  for (const t of tweets) {
    if (t.sentiment === 'Bullish') bull++;
    else if (t.sentiment === 'Bearish') bear++;
  }
  return bull + bear === 0 ? 50 : (bull / (bull + bear)) * 100;
}

function twitterBuzzScore(tweets) {
  if (!Array.isArray(tweets) || tweets.length === 0) return 50;
  const volume = clamp(tweets.length * 8, 0, 100);
  const whales = tweets.filter((t) => t.sentiment === 'Whale').length;
  const whaleBonus = clamp((whales / tweets.length) * 100, 0, 100);
  return clamp(volume * 0.7 + whaleBonus * 0.3, 0, 100);
}

function fibonacciScore(price, fib) {
  if (!fib || !(fib.high > fib.low) || !(price > 0)) return 50;
  return clamp(((price - fib.low) / (fib.high - fib.low)) * 100, 0, 100);
}

function newsScore(news) {
  if (!Array.isArray(news)) return 50;
  let pos = 0, neg = 0;
  for (const n of news) {
    if (n.sentiment === 'positive') pos++;
    else if (n.sentiment === 'negative') neg++;
  }
  return pos + neg === 0 ? 50 : (pos / (pos + neg)) * 100;
}

function deriveComponents({ priceChange, price, tweets, news, fib } = {}) {
  return {
    priceAction: priceActionScore(priceChange),
    sentiment: sentimentScore(tweets),
    twitterBuzz: twitterBuzzScore(tweets),
    fibonacci: fibonacciScore(price, fib),
    news: newsScore(news),
  };
}

function computeSignal(components, weights = WEIGHTS) {
  const score = Math.round(
    components.priceAction * weights.priceAction +
    components.sentiment * weights.sentiment +
    components.twitterBuzz * weights.twitterBuzz +
    components.fibonacci * weights.fibonacci +
    components.news * weights.news
  );
  let recommendation = 'HOLD';
  if (score >= 62) recommendation = 'BUY';
  else if (score <= 37) recommendation = 'SELL';
  return { score, recommendation };
}

export { WEIGHTS, deriveComponents, computeSignal };
```

- [ ] **Step 4: Run, expect PASS** — `cd frontend && npx vitest run tests/signal.test.js` → all pass.

- [ ] **Step 5: Commit**
```bash
git add frontend/js/signal.js frontend/tests/signal.test.js
git commit -m "feat(frontend): add tested signal-score engine (F5, MA dropped)"
```

---

## Task 3: Wire F4 into the dashboard (integration, manual-verified)

No unit test — verified by Task 5 smoke. **Use a capable model;** read `frontend/index.html` and `frontend/js/app.js` first.

**Files:** Modify `frontend/js/app.js`, `frontend/index.html`

- [ ] **Step 1: Remove the inline F4 code from `frontend/index.html`**
In the inline `<script>`, DELETE the `EXIT_LEVELS` const, the `buildExits()` function, the `calcPort()` function, and the bottom `buildExits();` INIT call. Remove the `oninput="calcPort()"` attribute from `#oct-amt` and `#avg-buy` (keep the inputs + ids). If any kept code still references `buildExits`/`calcPort`/`EXIT_LEVELS`, remove those references.

- [ ] **Step 2: Wire F4 in `frontend/js/app.js`**
Add near the other imports:
```js
import { computePortfolio, computeExitLevels, nextTarget } from './portfolio.js';
```
Add a module-scope `let lastPrice = null;` and this renderer (adapt the row markup to the existing `.exit-row` CSS classes used by the prototype — `exit-row`, `exit-row done`, `exit-row cur`):
```js
function fmtMoney(n) { return n == null ? '—' : (Math.abs(n) >= 1000 ? (n/1000).toFixed(1)+'K' : n.toFixed(2)); }

function renderPortfolio() {
  const amount = parseFloat(document.getElementById('oct-amt')?.value) || 0;
  const avgBuy = parseFloat(document.getElementById('avg-buy')?.value) || 0;
  const price = lastPrice || 0;
  const { value, pnl, pnlPct } = computePortfolio({ amount, avgBuy, price });
  const set = (id, txt, color) => { const el = document.getElementById(id); if (el) { if (txt != null) el.textContent = txt; if (color) el.style.color = color; } };
  set('pv', value != null ? '$' + fmtMoney(value) : '—');
  if (pnl != null) {
    set('ppnl', (pnl >= 0 ? '+$' : '-$') + fmtMoney(Math.abs(pnl)), pnl >= 0 ? 'var(--green)' : 'var(--red)');
    set('ppnlp', (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%', pnl >= 0 ? 'var(--green)' : 'var(--red)');
  }
  const nxt = nextTarget({ price });
  if (nxt) set('pnxt', '$' + nxt.p + ' — ' + nxt.lbl.split('—')[1].trim());
  const exits = document.getElementById('exits');
  if (exits) {
    exits.innerHTML = computeExitLevels({ price, amount }).map((l) => {
      const cls = l.status === 'done' ? 'exit-row done' : l.status === 'current' ? 'exit-row cur' : 'exit-row';
      const icon = l.status === 'done' ? '✅' : l.status === 'current' ? '⚡' : '○';
      const sa = l.sellAmount != null ? `<span style="color:var(--accent);font-size:8px">~${l.sellAmount} OCT</span>` : '';
      return `<div class="${cls}"><span>${icon}</span><span style="font-weight:700;width:44px;font-size:10px">$${l.p}</span><span style="color:var(--accent2);width:26px;font-size:8px">${l.pct}%</span><span style="color:var(--muted2);flex:1;font-size:9px">${l.lbl}</span>${sa}</div>`;
    }).join('');
  }
}
```
Wire the inputs + initial render (place after the `api`/`auth` setup):
```js
['oct-amt', 'avg-buy'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderPortfolio);
});
```
In `refresh()`, after the price is fetched and `renderPrice(price)` runs, set `lastPrice = (price && !price.pending) ? price.oct : lastPrice;` then call `renderPortfolio();`. Also call `renderPortfolio()` once in the `init()` success path so the exit ladder renders before the first price.

- [ ] **Step 3: Verify the suite still passes** — `cd frontend && npx vitest run` → still 21 tests (12 + 9 from Task 1). app.js is not imported by tests, so it cannot break them; confirm no test regressions.

- [ ] **Step 4: Commit**
```bash
git add frontend/js/app.js frontend/index.html
git commit -m "feat(frontend): wire F4 portfolio/exit tracker to portfolio.js + live price"
```

---

## Task 4: Wire F5 + tweet-filter polish (integration, manual-verified)

No unit test — verified by Task 5 smoke. **Use a capable model;** inspect the inline `computeSignal`, `twFilter`, and the `setTweets` glue first.

**Files:** Modify `frontend/js/app.js`, `frontend/index.html`

- [ ] **Step 1: Remove the inline `computeSignal` from `frontend/index.html`** and the `window.computeSignal = ...` export line. Keep the signal-card DOM (`#msig`, `#mconf`, `#scrd`) and the per-component bar elements.

- [ ] **Step 2: Read the on-page Fibonacci inputs**
Find the swing-low / swing-high inputs used by the kept `calcFib`/`setFibDir` logic (ids around `#fib-low` / `#fib-high`). In app.js add a helper:
```js
function readFib() {
  const low = parseFloat(document.getElementById('fib-low')?.value);
  const high = parseFloat(document.getElementById('fib-high')?.value);
  return (low > 0 && high > low) ? { low, high } : null;
}
```

- [ ] **Step 3: Wire F5 in `frontend/js/app.js`**
Add import:
```js
import { deriveComponents, computeSignal } from './signal.js';
```
Add a renderer (adapt the component-bar element ids to those present in the markup; if a bar id is absent, skip it):
```js
function renderSignal({ price, tweets, news }) {
  const components = deriveComponents({
    priceChange: price && !price.pending ? price.octChange24h : 0,
    price: price && !price.pending ? price.oct : 0,
    tweets: Array.isArray(tweets) ? tweets : [],
    news: Array.isArray(news) ? news : [],
    fib: readFib(),
  });
  const { score, recommendation } = computeSignal(components);
  const sig = document.getElementById('msig');
  if (sig) { sig.textContent = recommendation; sig.className = 'sv ' + recommendation; }
  const card = document.getElementById('scrd');
  if (card) card.className = 'sb sig-card ' + recommendation;
  const conf = document.getElementById('mconf');
  if (conf) conf.textContent = 'Score: ' + score + '/100 · ' + new Date().toLocaleTimeString('id-ID');
}
```
In `refresh()`, after price/tweets/news are all fetched, call `renderSignal({ price, tweets, news })` (pass the same values already fetched; guard `pending`).

- [ ] **Step 4: Tweet-filter polish in `frontend/index.html`**
The filter buttons call `twFilter('all'|'pos'|'neg'|'whale'|'listing'|'dev'|'fib', this)`. Remove the three dead buttons (`listing`, `dev`, `fib`) that have no backing backend field. Ensure the remaining buttons map to data the `setTweets` glue actually sets — keep `all`, and the sentiment ones. If the kept `twFilter`/`setTweets` use `positive/negative/whale` tags, leave that mapping intact (the 3a glue already maps backend Bullish→positive / Bearish→negative / Whale→whale). Do not introduce fake likes/retweets — if the tweet row template renders `❤️`/`🔁`, leave them only if the glue supplies real values; otherwise they already default to 0 (acceptable — do not invent data).

- [ ] **Step 5: Verify the suite** — `cd frontend && npx vitest run` → all pass (no regressions; app.js not imported by tests).

- [ ] **Step 6: Commit**
```bash
git add frontend/js/app.js frontend/index.html
git commit -m "feat(frontend): wire F5 signal scores to signal.js + tidy tweet filters"
```

---

## Task 5: Full suite + manual smoke

**Files:** none (verification)

- [ ] **Step 1: Full frontend suite** — `cd frontend && npm test`
Expected: PASS — 12 (existing) + 9 (portfolio) + signal tests ≈ **30+ tests** across 4 files. Report the exact count.

- [ ] **Step 2: Manual smoke (no keys needed)**
Serve the folder (`npx serve frontend`) and open it. Without `config.js` the login overlay still gates (Phase 3a). With a real `config.js` + running backend + login: enter an OCT amount + avg buy → portfolio value, PnL, and the T1–T7 exit ladder render and update with the live price; the F5 card shows a BUY/HOLD/SELL with a numeric score; tweet filter buttons are limited to all/sentiment/whale. Report what you observed (or, if you can't run a live backend, confirm the page loads, the overlay shows, and there are no console errors from app.js).

- [ ] **Step 3: Commit (if any tweaks) + push**
```bash
git push origin <current-branch>
```

---

## Done Criteria (Phase 3c)

- [ ] `cd frontend && npm test` passes the existing 12 plus new `portfolio` + `signal` suites.
- [ ] `portfolio.js` math is pure, null-safe, tested; F4 panel shows live value/PnL/next-target/exit statuses.
- [ ] `signal.js` produces 5 components (MA excluded), weights sum to 1.0, BUY/HOLD/SELL at ≥62 / ≤37; F5 card shows a real derived recommendation.
- [ ] Inline `buildExits`/`calcPort`/`computeSignal`/`EXIT_LEVELS` removed; F4/F5 now driven by the modules + backend data.
- [ ] Tweet filters limited to backend-backed labels (dead listing/dev/fib removed); no invented tweet metadata.

## Out of Scope

- Real MA/OHLC candle data (would re-add the MA component) — future backend work.
- Visual/layout redesign. After this phase, **F1–F6 are all implemented**.
