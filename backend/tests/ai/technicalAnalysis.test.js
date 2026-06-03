import { describe, it, expect } from 'vitest';
import { calculateMA, calculateRSI, analyzeVolume, analyzeMacro } from '../../src/ai/technicalAnalysis.js';

describe('Technical Analysis', () => {
  describe('calculateMA', () => {
    it('should calculate 3-period MA correctly', () => {
      const prices = [1, 2, 3, 4, 5];
      const ma = calculateMA(prices, 3);
      expect(ma).toBe(4); // (3 + 4 + 5) / 3
    });

    it('should return null if insufficient data', () => {
      const prices = [1, 2];
      const ma = calculateMA(prices, 3);
      expect(ma).toBeNull();
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI for increasing prices', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i + 1);
      const rsi = calculateRSI(prices, 14);
      // For perfect uptrend, RSI should be very high (99+)
      expect(rsi).toBeGreaterThan(98);
    });

    it('should return null if insufficient data', () => {
      const prices = [1, 2, 3];
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toBeNull();
    });

    it('should calculate RSI for decreasing prices', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 20 - i); // Downtrend
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toBeLessThan(30); // Downtrend = oversold
    });

    it('should return 50 for flat prices', () => {
      const prices = Array(20).fill(10); // All prices the same
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toBe(50); // Neutral
    });
  });

  describe('analyzeVolume', () => {
    it('should detect high volume', () => {
      const result = analyzeVolume(1600, 1000);
      expect(result.signal).toBe('HIGH_VOLUME');
      expect(result.score).toBe(1);
    });

    it('should detect low volume', () => {
      const result = analyzeVolume(300, 1000);
      expect(result.signal).toBe('LOW_VOLUME');
      expect(result.score).toBe(-1);
    });

    it('should detect above-average volume', () => {
      const result = analyzeVolume(1200, 1000);
      expect(result.signal).toBe('ABOVE_AVERAGE');
      expect(result.score).toBe(0.5);
    });

    it('should detect below-average volume', () => {
      const result = analyzeVolume(700, 1000);
      expect(result.signal).toBe('BELOW_AVERAGE');
      expect(result.score).toBe(-0.5);
    });
  });

  describe('analyzeMacro', () => {
    it('should detect bull market', () => {
      const result = analyzeMacro(3, 3);
      expect(result.signal).toBe('STRONG_BULL');
      expect(result.score).toBe(1);
    });

    it('should detect bear market', () => {
      const result = analyzeMacro(-3, -3);
      expect(result.signal).toBe('STRONG_BEAR');
      expect(result.score).toBe(-1);
    });

    it('should detect mild bull market', () => {
      const result = analyzeMacro(1, 1);
      expect(result.signal).toBe('MILD_BULL');
      expect(result.score).toBe(0.5);
    });

    it('should detect mild bear market', () => {
      const result = analyzeMacro(-1, -1);
      expect(result.signal).toBe('MILD_BEAR');
      expect(result.score).toBe(-0.5);
    });

    it('should detect mixed market (conflicting signals)', () => {
      const result = analyzeMacro(3, -1); // BTC up, ETH down
      expect(result.signal).toBe('MIXED');
      expect(result.score).toBe(0);
    });
  });
});
