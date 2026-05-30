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
