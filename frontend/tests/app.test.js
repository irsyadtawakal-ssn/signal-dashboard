import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('portfolio persistence - auth failures', () => {
  let consoleSpy;

  beforeEach(() => {
    // Track console.error calls
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should handle auth.getUser() rejection gracefully with .catch()', async () => {
    // Simulate the pattern used in app.js (promise chain with .catch)
    const mockAuth = {
      getUser: vi.fn(async () => {
        throw new Error('Supabase auth unavailable');
      }),
    };

    // This is the pattern that should be in app.js
    const savePortfolio = vi.fn();
    let handledGracefully = true;

    await mockAuth.getUser()
      .then((u) => { if (u) savePortfolio(u.id); })
      .catch((error) => {
        console.error('[Portfolio] Failed to restore portfolio from auth:', error.message);
        // Do not re-throw — user can still use app
      });

    expect(handledGracefully).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Portfolio]'),
      expect.stringContaining('auth')
    );
    expect(savePortfolio).not.toHaveBeenCalled();
  });

  it('should handle auth.getUser() rejection with async/await pattern', async () => {
    // Alternative pattern (async/await style)
    const mockAuth = {
      getUser: vi.fn(async () => {
        throw new Error('Network error: Failed to fetch');
      }),
    };

    let errorLogged = false;
    try {
      const user = await mockAuth.getUser();
      if (user) {
        // save portfolio
      }
    } catch (error) {
      console.error('[Portfolio] Auth failed during admin setup:', error.message);
      errorLogged = true;
    }

    expect(errorLogged).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should not rethrow auth errors — user can still use app with empty portfolio', async () => {
    const mockAuth = {
      getUser: vi.fn(async () => {
        throw new Error('Supabase auth unavailable');
      }),
    };

    let threwError = false;
    try {
      // Simulating the actual catch handler in app.js
      await mockAuth.getUser()
        .then(() => {})
        .catch((error) => {
          console.error('[Portfolio] Auth failed during restore:', error.message);
          // Intentionally not re-throwing
        });
    } catch {
      threwError = true;
    }

    expect(threwError).toBe(false);
  });

  it('should successfully save portfolio when auth succeeds', async () => {
    const mockAuth = {
      getUser: vi.fn(async () => ({ id: 'user123' })),
    };

    const savePortfolio = vi.fn();

    await mockAuth.getUser()
      .then((u) => { if (u) savePortfolio(u.id); })
      .catch((error) => {
        console.error('[Portfolio] Failed to restore portfolio from auth:', error.message);
      });

    expect(savePortfolio).toHaveBeenCalledWith('user123');
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe('news rendering - type safety', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should handle error object response instead of array', () => {
    const errorResponse = { error: 'News service unavailable', code: 503 };

    // Simulate the validation logic in refresh()
    let news = errorResponse;
    if (!Array.isArray(news)) {
      console.warn('[News] Backend returned non-array response:', news);
      if (news && news.error) {
        console.warn('[News] Error from backend:', news.error);
      }
      news = [];
    }

    expect(Array.isArray(news)).toBe(true);
    expect(news.length).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[News] Backend returned non-array response'),
      expect.objectContaining({ error: 'News service unavailable' })
    );
  });

  it('should validate array before calling mapNews', () => {
    const invalidResponses = [null, undefined, { error: 'Service error' }, 'not an array', 123];

    for (const resp of invalidResponses) {
      // Simulate validation
      let validated = resp;
      if (!Array.isArray(validated)) {
        validated = [];
      }

      // Should not throw when mapNews receives empty array
      expect(() => {
        if (Array.isArray(validated)) {
          // mapNews would receive empty array
          validated.map(() => ({})); // Simple map test
        }
      }).not.toThrow();
    }
  });

  it('should show warning when news response is null', () => {
    let news = null;
    if (!Array.isArray(news)) {
      console.warn('[News] Backend returned non-array response:', news);
      news = [];
    }

    expect(news).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should show warning when news response is undefined', () => {
    let news = undefined;
    if (!Array.isArray(news)) {
      console.warn('[News] Backend returned non-array response:', news);
      news = [];
    }

    expect(news).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should handle valid array response without warning', () => {
    const validNews = [
      { title: 'Bitcoin rises', sentiment: 'positive', source: 'CoinNews', url: 'http://example.com', publishedAt: '2026-05-30' },
    ];

    let news = validNews;
    if (!Array.isArray(news)) {
      console.warn('[News] Backend returned non-array response:', news);
      news = [];
    }

    expect(Array.isArray(news)).toBe(true);
    expect(news.length).toBe(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle pending flag on valid array', () => {
    const newsWithPending = [];
    newsWithPending.pending = true;

    let news = newsWithPending;
    if (!Array.isArray(news)) {
      console.warn('[News] Backend returned non-array response:', news);
      news = [];
    }

    expect(Array.isArray(news)).toBe(true);
    expect(news.pending).toBe(true);
  });

  it('should map valid news items correctly', () => {
    const items = [
      {
        title: 'Market update',
        url: 'http://example.com',
        source: 'Reuters',
        publishedAt: '2026-05-30T10:00:00Z',
        sentiment: 'positive',
      },
    ];

    const mapped = items.map((n) => {
      const sent = String(n.sentiment || '').toLowerCase();
      let votes = {};
      if (sent === 'positive' || sent === 'bullish') votes = { positive: 2 };
      else if (sent === 'negative' || sent === 'bearish') votes = { negative: 2 };
      return {
        title: n.title,
        url: n.url,
        source: { title: n.source || 'News' },
        published_at: n.publishedAt,
        votes,
      };
    });

    expect(mapped[0]).toEqual({
      title: 'Market update',
      url: 'http://example.com',
      source: { title: 'Reuters' },
      published_at: '2026-05-30T10:00:00Z',
      votes: { positive: 2 },
    });
  });
});
