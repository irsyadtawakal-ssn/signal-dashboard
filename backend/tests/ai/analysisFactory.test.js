import { describe, it, expect, vi } from 'vitest';
import { AnalysisFactory, TwitterAnalysisStrategy, TechnicalAnalysisStrategy } from '../../src/ai/analysisFactory.js';

describe('Analysis Factory', () => {
  describe('factory.create()', () => {
    it('should create technical analysis strategy', () => {
      const strategy = AnalysisFactory.create('technical');
      expect(strategy).toBeDefined();
      expect(strategy).toBeInstanceOf(TechnicalAnalysisStrategy);
    });

    it('should create twitter analysis strategy', () => {
      const mockComplete = vi.fn();
      const strategy = AnalysisFactory.create('twitter', { complete: mockComplete, model: 'test-model' });
      expect(strategy).toBeDefined();
      expect(strategy).toBeInstanceOf(TwitterAnalysisStrategy);
    });

    it('should throw error for unknown strategy type', () => {
      expect(() => AnalysisFactory.create('unknown')).toThrow('Unknown analysis strategy: unknown');
    });

    it('should be case insensitive', () => {
      const strategy1 = AnalysisFactory.create('TECHNICAL');
      const strategy2 = AnalysisFactory.create('Technical');
      expect(strategy1).toBeInstanceOf(TechnicalAnalysisStrategy);
      expect(strategy2).toBeInstanceOf(TechnicalAnalysisStrategy);
    });
  });

  describe('TechnicalAnalysisStrategy', () => {
    it('should have correct name', () => {
      const strategy = AnalysisFactory.create('technical');
      expect(strategy.getName()).toBe('TECHNICAL');
    });

    it('should have analyze method', () => {
      const strategy = AnalysisFactory.create('technical');
      expect(typeof strategy.analyze).toBe('function');
    });

    it('should analyze data and return signal with confidence', async () => {
      const strategy = AnalysisFactory.create('technical');

      const data = {
        priceHistory: Array.from({ length: 200 }, (_, i) => ({
          oct_price: 0.001 + (i * 0.0000005) // Deterministic uptrend
        })),
        price: {
          oct: 0.21
        },
        macro: {
          btc: { change24h: 2.5 },
          eth: { change24h: 1.8 }
        },
        volume: {
          current: 100000,
          avg: 80000
        }
      };

      const result = await strategy.analyze(data);

      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('reasoning');
      expect(['BUY', 'SELL', 'HOLD']).toContain(result.signal);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Error cases', () => {
    it('should throw for unknown strategy type', () => {
      expect(() => {
        AnalysisFactory.create('unknown_type');
      }).toThrow();
    });

    it('TechnicalAnalysis should throw for invalid priceHistory', async () => {
      const strategy = AnalysisFactory.create('technical');
      const invalidData = {
        priceHistory: null,
        price: { oct: 0.001 },
        macro: { btc: { change24h: 1 }, eth: { change24h: 1 } },
        volume: { current: 100000, avg: 100000 }
      };

      await expect(strategy.analyze(invalidData)).rejects.toThrow('priceHistory');
    });

    it('TechnicalAnalysis should throw for missing price.oct', async () => {
      const strategy = AnalysisFactory.create('technical');
      const prices = Array.from({ length: 200 }, (_, i) => 0.001 + i * 0.000001);
      const invalidData = {
        priceHistory: prices.map((p, i) => ({ oct_price: p, date: `2025-${i % 12 + 1}-01` })),
        price: null, // Invalid
        macro: { btc: { change24h: 1 }, eth: { change24h: 1 } },
        volume: { current: 100000, avg: 100000 }
      };

      await expect(strategy.analyze(invalidData)).rejects.toThrow('price');
    });

    it('TechnicalAnalysis should throw for missing macro.btc.change24h', async () => {
      const strategy = AnalysisFactory.create('technical');
      const prices = Array.from({ length: 200 }, (_, i) => 0.001 + i * 0.000001);
      const invalidData = {
        priceHistory: prices.map((p, i) => ({ oct_price: p })),
        price: { oct: 0.00145 },
        macro: { btc: {}, eth: { change24h: 1 } }, // Missing btc.change24h
        volume: { current: 100000, avg: 100000 }
      };

      await expect(strategy.analyze(invalidData)).rejects.toThrow('macro');
    });

    it('TechnicalAnalysis should throw for missing volume data', async () => {
      const strategy = AnalysisFactory.create('technical');
      const prices = Array.from({ length: 200 }, (_, i) => 0.001 + i * 0.000001);
      const invalidData = {
        priceHistory: prices.map((p, i) => ({ oct_price: p })),
        price: { oct: 0.00145 },
        macro: { btc: { change24h: 1 }, eth: { change24h: 1 } },
        volume: undefined // Invalid
      };

      await expect(strategy.analyze(invalidData)).rejects.toThrow('volume');
    });
  });

  describe('TwitterAnalysisStrategy', () => {
    it('should have correct name', () => {
      const mockComplete = vi.fn();
      const strategy = AnalysisFactory.create('twitter', { complete: mockComplete, model: 'test-model' });
      expect(strategy.getName()).toBe('TWITTER');
    });

    it('should have analyze method', () => {
      const mockComplete = vi.fn();
      const strategy = AnalysisFactory.create('twitter', { complete: mockComplete, model: 'test-model' });
      expect(typeof strategy.analyze).toBe('function');
    });

    it('should analyze market data using AI', async () => {
      const mockReply = JSON.stringify({
        recommendation: 'BUY',
        confidence: 0.85,
        summary: 'Market looks bullish',
        components: {
          priceAction: 'up',
          sentiment: 'bullish',
          twitterBuzz: 'high',
          movingAverage: 'above',
          fibonacci: 'near resistance'
        }
      });

      const mockComplete = vi.fn().mockResolvedValue(mockReply);
      const strategy = AnalysisFactory.create('twitter', { complete: mockComplete, model: 'test-model' });

      const data = {
        price: { oct: 0.21, btc: 68000 },
        tweets: [{ id: '1', text: 'OCT up', sentiment: 'Bullish' }],
        news: [{ title: 'OCT listed', sentiment: 'positive' }]
      };

      const result = await strategy.analyze(data);

      expect(result.signal).toBe('BUY');
      expect(result.recommendation).toBe('BUY');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('Market looks bullish');
      expect(mockComplete).toHaveBeenCalled();
    });
  });
});
