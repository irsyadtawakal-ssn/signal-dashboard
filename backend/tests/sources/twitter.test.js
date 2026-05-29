import { describe, it, expect, vi } from 'vitest';
import { fetchTweets } from '../../src/sources/twitter.js';

const sample = [
  {
    id: 101,
    text: 'OCT breaking out',
    author: { userName: 'trader1' },
    url: 'https://x.com/trader1/status/101',
    createdAt: '2026-05-29T10:00:00Z',
  },
  {
    id: 102,
    text: 'whales loading OCT',
    author: { userName: 'whalewatch' },
    url: 'https://x.com/whalewatch/status/102',
    createdAt: '2026-05-29T09:00:00Z',
  },
];

describe('fetchTweets', () => {
  it('normalizes scraper results', async () => {
    const getJsonFn = vi.fn().mockResolvedValue(sample);
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toEqual([
      { id: '101', text: 'OCT breaking out', author: 'trader1', url: 'https://x.com/trader1/status/101', createdAt: '2026-05-29T10:00:00Z' },
      { id: '102', text: 'whales loading OCT', author: 'whalewatch', url: 'https://x.com/whalewatch/status/102', createdAt: '2026-05-29T09:00:00Z' },
    ]);
  });

  it('accepts a { results: [...] } wrapper as well as a bare array', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: sample });
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toHaveLength(2);
  });

  it('encodes keywords joined by OR into the request url', async () => {
    const getJsonFn = vi.fn().mockResolvedValue([]);
    await fetchTweets({ getJsonFn, keywords: ['Octra', '$OCT'] });
    const calledUrl = getJsonFn.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('Octra OR $OCT'));
  });

  it('includes the token in the url when provided', async () => {
    const getJsonFn = vi.fn().mockResolvedValue([]);
    await fetchTweets({ getJsonFn, keywords: ['Octra'], token: 'scrapetok' });
    expect(getJsonFn.mock.calls[0][0]).toContain('token=scrapetok');
  });

  it('returns [] when results are missing and caps at limit', async () => {
    const empty = vi.fn().mockResolvedValue({});
    expect(await fetchTweets({ getJsonFn: empty, keywords: ['x'] })).toEqual([]);

    const many = vi.fn().mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ id: i, text: `t${i}`, author: { userName: 'u' }, url: 'u', createdAt: 'x' }))
    );
    const items = await fetchTweets({ getJsonFn: many, keywords: ['x'], limit: 5 });
    expect(items).toHaveLength(5);
  });
});
