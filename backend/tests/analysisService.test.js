import { describe, it, expect, vi } from 'vitest';
import { getAnalysis } from '../src/analysisService.js';
import { createDb, getCache, setCache } from '../src/db.js';

const sample = { recommendation: 'BUY', confidence: 0.7, summary: 's', components: {} };

describe('getAnalysis', () => {
  it('returns the cached analysis without calling analyzeFn when fresh and not forced', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn();
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 10000, now: () => 5000 });
    expect(analyzeFn).not.toHaveBeenCalled();
    expect(result).toMatchObject(sample);
  });

  it('re-runs when force is true even if cache is fresh', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn().mockResolvedValue({ ...sample, recommendation: 'SELL' });
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 10000, force: true, now: () => 5000 });
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    expect(result.recommendation).toBe('SELL');
  });

  it('re-runs when the cached analysis is older than the TTL', async () => {
    const db = createDb(':memory:');
    setCache(db, 'analysis', { ...sample, generatedAt: 1000 });
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    await getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 50000 });
    expect(analyzeFn).toHaveBeenCalledTimes(1);
  });

  it('gathers price/tweets/news from cache (null when cold) and stamps generatedAt', async () => {
    const db = createDb(':memory:');
    setCache(db, 'price', { oct: 0.2 });
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    const result = await getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 777 });

    expect(analyzeFn).toHaveBeenCalledWith({ price: { oct: 0.2 }, tweets: null, news: null });
    expect(result.generatedAt).toBe(777);
    expect(getCache(db, 'analysis').value).toEqual({ ...sample, generatedAt: 777 });
  });

  it('does not cache and propagates when analyzeFn throws', async () => {
    const db = createDb(':memory:');
    const analyzeFn = vi.fn().mockRejectedValue(new Error('opus down'));
    await expect(getAnalysis({ db, analyzeFn, ttlMs: 1000, now: () => 1 })).rejects.toThrow('opus down');
    expect(getCache(db, 'analysis')).toBeNull();
  });
});
