import { describe, it, expect, vi } from 'vitest';
import { fetchTweets } from '../../src/sources/twitter.js';

const sample = [
  {
    id: '101',
    text: 'OCT breaking out',
    url: 'https://x.com/trader1/status/101',
    createdAt: 'Sat May 30 02:54:17 +0000 2026',
    author: { userName: 'trader1' },
    retweetCount: 1,
    likeCount: 5,
  },
  {
    id: '102',
    text: 'whales loading OCT',
    url: 'https://x.com/whalewatch/status/102',
    createdAt: 'Sat May 30 02:40:36 +0000 2026',
    author: { userName: 'whalewatch' },
    retweetCount: 0,
    likeCount: 2,
  },
];

describe('fetchTweets', () => {
  it('normalizes scraper results and extracts author.userName', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ tweets: sample });
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toEqual([
      { id: '101', text: 'OCT breaking out', author: 'trader1', url: 'https://x.com/trader1/status/101', createdAt: 'Sat May 30 02:54:17 +0000 2026' },
      { id: '102', text: 'whales loading OCT', author: 'whalewatch', url: 'https://x.com/whalewatch/status/102', createdAt: 'Sat May 30 02:40:36 +0000 2026' },
    ]);
  });

  it('accepts a bare array as well as { tweets: [...] } wrapper', async () => {
    const getJsonFn = vi.fn().mockResolvedValue(sample);
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toHaveLength(2);
  });

  it('accepts a { results: [...] } wrapper', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: sample });
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toHaveLength(2);
  });

  it('encodes keywords joined by OR into the request url', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ tweets: [] });
    await fetchTweets({ getJsonFn, keywords: ['Octra', '$OCT'] });
    const calledUrl = getJsonFn.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('Octra OR $OCT'));
  });

  it('passes X-API-Key header when token is provided', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ tweets: [] });
    await fetchTweets({ getJsonFn, keywords: ['Octra'], token: 'mytoken' });
    const headers = getJsonFn.mock.calls[0][1].headers;
    expect(headers['X-API-Key']).toBe('mytoken');
  });

  it('returns [] when results are missing and caps at limit', async () => {
    const empty = vi.fn().mockResolvedValue({});
    expect(await fetchTweets({ getJsonFn: empty, keywords: ['x'] })).toEqual([]);

    const many = vi.fn().mockResolvedValue({
      tweets: Array.from({ length: 30 }, (_, i) => ({
        id: String(i), text: `t${i}`, url: `https://x.com/u/status/${i}`,
        createdAt: 'x', author: { userName: 'u' },
      }))
    });
    const items = await fetchTweets({ getJsonFn: many, keywords: ['x'], limit: 5 });
    expect(items).toHaveLength(5);
  });

  it('returns unknown author when author field is missing', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ tweets: [{ id: '1', text: 'hi', url: null, createdAt: 'x' }] });
    const items = await fetchTweets({ getJsonFn, keywords: ['x'] });
    expect(items[0].author).toBe('unknown');
  });
});
