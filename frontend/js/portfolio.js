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
