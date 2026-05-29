import { describe, it, expect, vi } from 'vitest';
import { createApiClient, AuthError } from '../js/api-client.js';

function res(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
const getToken = async () => 'tok123';

describe('createApiClient', () => {
  it('GETs /api/price with a bearer token and returns parsed json', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { oct: 0.2 }));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    expect(await api.getPrice()).toEqual({ oct: 0.2 });
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('http://b/api/price');
    expect(opts.headers.Authorization).toBe('Bearer tok123');
  });

  it('getNews and getTweets hit their paths', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, []));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.getNews();
    await api.getTweets();
    expect(fetchFn.mock.calls[0][0]).toBe('http://b/api/news');
    expect(fetchFn.mock.calls[1][0]).toBe('http://b/api/tweets');
  });

  it('analyze POSTs { force: true } when forced', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { recommendation: 'BUY' }));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.analyze({ force: true });
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('http://b/api/analyze');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ force: true });
  });

  it('analyze defaults force to false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await api.analyze();
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ force: false });
  });

  it('throws AuthError on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(401, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await expect(api.getPrice()).rejects.toBeInstanceOf(AuthError);
  });

  it('returns the pending sentinel on 503', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(503, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    expect(await api.getPrice()).toEqual({ pending: true });
  });

  it('throws on other non-ok statuses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(500, {}));
    const api = createApiClient({ baseUrl: 'http://b', getToken, fetchFn });
    await expect(api.getPrice()).rejects.toThrow('request failed: 500');
  });
});
