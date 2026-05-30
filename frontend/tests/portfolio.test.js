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
    expect(rows.find((r) => r.p === 0.25).status).toBe('done');
    expect(rows.find((r) => r.p === 0.40).status).toBe('current');
    expect(rows.find((r) => r.p === 1.00).status).toBe('pending');
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
