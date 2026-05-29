import { describe, it, expect, vi } from 'vitest';
import { analyzeMarket } from '../../src/ai/analysis.js';

const price = { oct: 0.21, btc: 68000 };
const tweets = [{ id: '1', text: 'OCT up', sentiment: 'Bullish' }];
const news = [{ title: 'OCT listed', sentiment: 'positive' }];

const goodReply = JSON.stringify({
  recommendation: 'BUY',
  confidence: 0.8,
  summary: 'Momentum positive',
  components: { priceAction: 'up', sentiment: 'bullish', twitterBuzz: 'high', movingAverage: 'above', fibonacci: 'near 0.5' },
});

describe('analyzeMarket', () => {
  it('makes a single call with a system prompt + data payload and returns the structured analysis', async () => {
    const complete = vi.fn().mockResolvedValue(goodReply);
    const result = await analyzeMarket({ price, tweets, news, complete, model: 'opus-x' });

    expect(complete).toHaveBeenCalledTimes(1);
    const arg = complete.mock.calls[0][0];
    expect(typeof arg.system).toBe('string');
    expect(arg.system.length).toBeGreaterThan(0);
    expect(arg.model).toBe('opus-x');
    expect(arg.user).toContain('68000');
    expect(arg.user).toContain('Bullish');

    expect(result).toEqual({
      recommendation: 'BUY',
      confidence: 0.8,
      summary: 'Momentum positive',
      components: { priceAction: 'up', sentiment: 'bullish', twitterBuzz: 'high', movingAverage: 'above', fibonacci: 'near 0.5' },
    });
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const complete = vi.fn().mockResolvedValue('```json\n' + goodReply + '\n```');
    const result = await analyzeMarket({ price, tweets, news, complete });
    expect(result.recommendation).toBe('BUY');
  });

  it('passes null for missing data sections', async () => {
    const complete = vi.fn().mockResolvedValue(goodReply);
    await analyzeMarket({ price: null, tweets: null, news: null, complete });
    expect(complete.mock.calls[0][0].user).toBe(JSON.stringify({ price: null, tweets: null, news: null }));
  });

  it('throws when the reply has no JSON object', async () => {
    const complete = vi.fn().mockResolvedValue('sorry, I cannot help');
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow();
  });

  it('throws when the recommendation is invalid', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ recommendation: 'MAYBE', summary: 'x' }));
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow('invalid recommendation');
  });

  it('propagates a rejected complete call', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('opus down'));
    await expect(analyzeMarket({ price, tweets, news, complete })).rejects.toThrow('opus down');
  });
});
