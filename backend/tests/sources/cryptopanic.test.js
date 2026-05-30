import { describe, it, expect, vi } from 'vitest';
import { fetchNews } from '../../src/sources/cryptopanic.js';

const sampleFeed = {
  items: [
    { title: 'Bitcoin hits new high', link: 'https://coindesk.com/a', pubDate: 'Sat, 30 May 2026 10:00:00 +0000' },
    { title: 'Market dips sharply', link: 'https://coindesk.com/b', pubDate: 'Sat, 30 May 2026 09:00:00 +0000' },
    { title: 'Ethereum update incoming', link: 'https://coindesk.com/c', pubDate: 'Sat, 30 May 2026 08:00:00 +0000' },
  ],
};

describe('fetchNews', () => {
  it('normalizes RSS items to expected shape', async () => {
    const parserFn = () => ({ parseURL: vi.fn().mockResolvedValue(sampleFeed) });
    const items = await fetchNews({ parserFn, limit: 3 });
    expect(items).toEqual([
      { title: 'Bitcoin hits new high', url: 'https://coindesk.com/a', source: 'CoinDesk', publishedAt: 'Sat, 30 May 2026 10:00:00 +0000', sentiment: 'neutral' },
      { title: 'Market dips sharply', url: 'https://coindesk.com/b', source: 'CoinDesk', publishedAt: 'Sat, 30 May 2026 09:00:00 +0000', sentiment: 'neutral' },
      { title: 'Ethereum update incoming', url: 'https://coindesk.com/c', source: 'CoinDesk', publishedAt: 'Sat, 30 May 2026 08:00:00 +0000', sentiment: 'neutral' },
    ]);
  });

  it('caps results at limit', async () => {
    const bigFeed = { items: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, link: `u${i}`, pubDate: 'x' })) };
    const parserFn = () => ({ parseURL: vi.fn().mockResolvedValue(bigFeed) });
    const items = await fetchNews({ parserFn, limit: 5 });
    expect(items).toHaveLength(5);
  });

  it('returns empty array when feed has no items', async () => {
    const parserFn = () => ({ parseURL: vi.fn().mockResolvedValue({ items: [] }) });
    expect(await fetchNews({ parserFn })).toEqual([]);
  });

  it('handles missing link and pubDate gracefully', async () => {
    const parserFn = () => ({ parseURL: vi.fn().mockResolvedValue({ items: [{ title: 'No link' }] }) });
    const items = await fetchNews({ parserFn });
    expect(items[0]).toMatchObject({ title: 'No link', url: null, publishedAt: null, sentiment: 'neutral' });
  });
});
