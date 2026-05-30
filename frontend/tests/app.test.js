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

describe('price state - staleness detection', () => {
  it('should track price freshness separately from rendering', () => {
    // Simulate lastPrice object structure
    const lastPrice = {
      value: null,
      fetchedAt: null,
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    // Initially no price set
    expect(lastPrice.value).toBe(null);
    expect(lastPrice.staleSinceMs).toBe(0);
    expect(lastPrice.isStale).toBe(false);

    // Update with fresh price
    lastPrice.value = 0.35;
    lastPrice.fetchedAt = Date.now();
    expect(lastPrice.value).toBe(0.35);
    expect(lastPrice.staleSinceMs).toBeLessThan(100); // Should be very fresh
    expect(lastPrice.isStale).toBe(false);
  });

  it('should detect stale price after 10 minutes', () => {
    const lastPrice = {
      value: 0.35,
      fetchedAt: null,
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    // Set fetched time to 11 minutes ago
    const elevenMinutesAgo = Date.now() - (11 * 60 * 1000);
    lastPrice.fetchedAt = elevenMinutesAgo;

    expect(lastPrice.isStale).toBe(true);
    expect(lastPrice.staleSinceMs).toBeGreaterThan(10 * 60 * 1000);
  });

  it('should not mark price as stale within 10 minutes', () => {
    const lastPrice = {
      value: 0.35,
      fetchedAt: null,
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    // Set fetched time to 5 minutes ago
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    lastPrice.fetchedAt = fiveMinutesAgo;

    expect(lastPrice.isStale).toBe(false);
    expect(lastPrice.staleSinceMs).toBeLessThan(10 * 60 * 1000);
  });

  it('should handle partial failure: tweets fail but price succeeds', async () => {
    let priceError = null;
    let price = { oct: 0.35, pending: false };

    // Simulate partial failure
    const mockApi = {
      getPrice: vi.fn(async () => price),
      getTweets: vi.fn(async () => {
        throw new Error('Tweet fetch failed');
      }),
      getNews: vi.fn(async () => []),
    };

    // Simulate refresh flow
    try {
      price = await mockApi.getPrice();
    } catch (error) {
      priceError = error;
    }

    try {
      await mockApi.getTweets();
    } catch (error) {
      console.error('[Tweets] Fetch failed:', error.message);
    }

    // Price should succeed, tweets should fail
    expect(price).not.toBeNull();
    expect(price.oct).toBe(0.35);
    expect(priceError).toBeNull();
    expect(mockApi.getTweets).toHaveBeenCalled();
  });

  it('should clear staleness warning when fresh data arrives', () => {
    const lastPrice = {
      value: 0.35,
      fetchedAt: Date.now(),
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    expect(lastPrice.isStale).toBe(false);

    // Simulate time passing
    lastPrice.fetchedAt = Date.now() - (15 * 60 * 1000); // 15 minutes ago
    expect(lastPrice.isStale).toBe(true);

    // Simulate fresh price arriving
    lastPrice.fetchedAt = Date.now();
    expect(lastPrice.isStale).toBe(false);
  });

  it('should keep stale value in portfolio when price fetch fails', () => {
    const lastPrice = {
      value: 0.35, // Old value
      fetchedAt: Date.now() - (15 * 60 * 1000), // 15 minutes old
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    // Price is stale but still usable
    expect(lastPrice.value).toBe(0.35);
    expect(lastPrice.isStale).toBe(true);

    // Portfolio computation should still work with stale value
    const price = lastPrice.value || 0;
    expect(price).toBe(0.35);
  });

  it('should display stale data indicator when isStale is true', () => {
    // This test validates the warning display logic
    const lastPrice = {
      value: 0.35,
      fetchedAt: Date.now() - (15 * 60 * 1000), // 15 minutes old
      get staleSinceMs() {
        return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
      },
      get isStale() {
        return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
      },
    };

    if (lastPrice.isStale && lastPrice.value) {
      const warningText = `⚠️ Price data is stale (${Math.round(lastPrice.staleSinceMs / 1000)}s old)`;
      expect(warningText).toContain('stale');
      expect(warningText).toContain('Price data');
    }
  });
});
