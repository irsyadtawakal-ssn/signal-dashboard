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
      expect(rsi).toBeGreaterThan(70); // Uptrend = overbought
    });

    it('should return null if insufficient data', () => {
      const prices = [1, 2, 3];
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toBeNull();
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
  });
});
