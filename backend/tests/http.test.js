import { describe, it, expect, vi } from 'vitest';
import { getJson } from '../src/http.js';

function fakeFetch(response) {
  return vi.fn().mockResolvedValue(response);
}

describe('getJson', () => {
  it('returns parsed JSON on 200', async () => {
    const fetchFn = fakeFetch({ ok: true, status: 200, json: async () => ({ hello: 'world' }) });
    const data = await getJson('https://x.test', { fetchFn });
    expect(data).toEqual({ hello: 'world' });
    expect(fetchFn).toHaveBeenCalledWith('https://x.test', expect.any(Object));
  });

  it('throws on non-2xx status', async () => {
    const fetchFn = fakeFetch({ ok: false, status: 429, json: async () => ({}) });
    await expect(getJson('https://x.test', { fetchFn })).rejects.toThrow(/429/);
  });

  it('throws when fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(getJson('https://x.test', { fetchFn })).rejects.toThrow(/network down/);
  });
});
