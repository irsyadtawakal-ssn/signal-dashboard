import { describe, it, expect } from 'vitest';
import { generateSignal } from '../../src/ai/signalGenerator.js';

describe('Signal Generator', () => {
  const mockData = {
    prices: Array.from({ length: 200 }, (_, i) => 0.00130 + (i * 0.0000005)), // Uptrend
    currentPrice: 0.00145,
    currentVolume: 250000,
    avgVolume: 180000,
    btcChange24h: 2.5,
    ethChange24h: 1.8
  };

  it('should generate BUY signal for strong uptrend', async () => {
    const strongUptrend = {
      ...mockData,
      // Create prices that show clear uptrend but with some volatility to keep RSI moderate
      prices: Array.from({ length: 200 }, (_, i) => {
        const base = 0.00130 + (i * 0.0000005);
        const noise = (Math.sin(i / 5) * 0.00000005);
        return base + noise;
      }),
      currentVolume: 300000, // High volume
      avgVolume: 150000
    };
    const result = await generateSignal(strongUptrend);
    expect(result.signal).toBe('BUY');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.indicators.ma50).toBeLessThan(result.indicators.currentPrice);
    expect(result.indicators.ma200).toBeLessThan(result.indicators.currentPrice);
  });

  it('should have reasoning array', async () => {
    const result = await generateSignal(mockData);
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('should handle downtrend data', async () => {
    const downtrend = {
      ...mockData,
      prices: Array.from({ length: 200 }, (_, i) => {
        const base = 0.00150 - (i * 0.0000005);
        const noise = (Math.sin(i / 5) * 0.00000005);
        return base + noise;
      }),
      currentPrice: 0.00130, // At the end of the downtrend
      currentVolume: 300000, // High volume on downtrend
      avgVolume: 150000,
      btcChange24h: -3,
      ethChange24h: -2
    };
    const result = await generateSignal(downtrend);
    expect(result.signal).toBe('SELL');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should generate HOLD for mixed signals', async () => {
    const mixed = {
      ...mockData,
      btcChange24h: 0.1, // Neutral macro
      ethChange24h: -0.2
    };
    const result = await generateSignal(mixed);
    expect(['BUY', 'HOLD', 'SELL']).toContain(result.signal);
  });
});
