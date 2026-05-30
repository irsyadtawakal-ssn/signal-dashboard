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
