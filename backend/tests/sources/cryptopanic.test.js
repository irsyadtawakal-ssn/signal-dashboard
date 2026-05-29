import { describe, it, expect, vi } from 'vitest';
import { fetchNews } from '../../src/sources/cryptopanic.js';

const sample = {
  results: [
    {
      title: 'OCT hits new high',
      url: 'https://example.com/a',
      published_at: '2026-05-29T10:00:00Z',
      source: { title: 'CoinDesk' },
      votes: { positive: 5, liked: 2, negative: 0, disliked: 0 },
    },
    {
      title: 'Market dips',
      url: 'https://example.com/b',
      published_at: '2026-05-29T09:00:00Z',
      source: { title: 'TheBlock' },
      votes: { positive: 0, negative: 4, disliked: 1 },
    },
    {
      title: 'Sideways action',
      url: 'https://example.com/c',
      published_at: '2026-05-29T08:00:00Z',
      votes: {},
    },
  ],
};

describe('fetchNews', () => {
  it('normalizes results and derives sentiment from votes', async () => {
    const getJsonFn = vi.fn().mockResolvedValue(sample);
    const items = await fetchNews({ getJsonFn });
    expect(items).toEqual([
      { title: 'OCT hits new high', url: 'https://example.com/a', source: 'CoinDesk', publishedAt: '2026-05-29T10:00:00Z', sentiment: 'positive' },
      { title: 'Market dips', url: 'https://example.com/b', source: 'TheBlock', publishedAt: '2026-05-29T09:00:00Z', sentiment: 'negative' },
      { title: 'Sideways action', url: 'https://example.com/c', source: 'CryptoPanic', publishedAt: '2026-05-29T08:00:00Z', sentiment: 'neutral' },
    ]);
  });

  it('uses the public endpoint when no token is given', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: [] });
    await fetchNews({ getJsonFn });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news',
      expect.any(Object)
    );
  });

  it('uses the auth_token endpoint when a token is given', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: [] });
    await fetchNews({ getJsonFn, token: 'tok123' });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://cryptopanic.com/api/v1/posts/?auth_token=tok123&filter=hot&kind=news',
      expect.any(Object)
    );
  });

  it('returns an empty array when results are missing', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({});
    expect(await fetchNews({ getJsonFn })).toEqual([]);
  });

  it('caps results at limit', async () => {
    const many = { results: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, published_at: 'x', votes: {} })) };
    const getJsonFn = vi.fn().mockResolvedValue(many);
    const items = await fetchNews({ getJsonFn, limit: 3 });
    expect(items).toHaveLength(3);
  });
});
