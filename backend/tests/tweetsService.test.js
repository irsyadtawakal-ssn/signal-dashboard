import { describe, it, expect, vi } from 'vitest';
import { buildTweets } from '../src/tweetsService.js';

describe('buildTweets', () => {
  it('scrapes then classifies, returning the enriched tweets', async () => {
    const raw = [{ id: '1', text: 'x', author: 'a', url: 'u', createdAt: 't' }];
    const fetchFn = vi.fn().mockResolvedValue(raw);
    const classifyFn = vi.fn().mockResolvedValue([{ ...raw[0], sentiment: 'Bullish' }]);
    const result = await buildTweets({ fetchFn, classifyFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(classifyFn).toHaveBeenCalledWith(raw);
    expect(result).toEqual([{ id: '1', text: 'x', author: 'a', url: 'u', createdAt: 't', sentiment: 'Bullish' }]);
  });

  it('propagates a scraper failure (so the scheduler skips the cache write)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('scraper blocked'));
    const classifyFn = vi.fn();
    await expect(buildTweets({ fetchFn, classifyFn })).rejects.toThrow('scraper blocked');
    expect(classifyFn).not.toHaveBeenCalled();
  });
});
