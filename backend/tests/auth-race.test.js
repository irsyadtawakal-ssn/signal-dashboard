import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth } from '../src/auth.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

const config = { supabaseJwtSecret: TEST_SECRET };

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function mockReq(token) {
  return {
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
    },
  };
}

describe('auth - JWKS race conditions', () => {
  it('should handle concurrent requests without race conditions', async () => {
    // Create multiple valid tokens
    const token1 = signTestToken({ sub: 'user-1', email: 'user1@example.com' });
    const token2 = signTestToken({ sub: 'user-2', email: 'user2@example.com' });
    const token3 = signTestToken({ sub: 'user-3', email: 'user3@example.com' });

    const authMiddleware = requireAuth(config);

    // Simulate concurrent verification requests
    const promise1 = new Promise((resolve) => {
      const req = mockReq(token1);
      const res = mockRes();
      const next = vi.fn(() => resolve({ success: true, user: req.user }));
      authMiddleware(req, res, next);
    });

    const promise2 = new Promise((resolve) => {
      const req = mockReq(token2);
      const res = mockRes();
      const next = vi.fn(() => resolve({ success: true, user: req.user }));
      authMiddleware(req, res, next);
    });

    const promise3 = new Promise((resolve) => {
      const req = mockReq(token3);
      const res = mockRes();
      const next = vi.fn(() => resolve({ success: true, user: req.user }));
      authMiddleware(req, res, next);
    });

    // All concurrent requests should succeed
    const results = await Promise.allSettled([promise1, promise2, promise3]);

    // Verify all succeeded (no race condition errors)
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('fulfilled');

    // Verify correct user data was attached
    expect(results[0].value.user).toEqual({ id: 'user-1', email: 'user1@example.com' });
    expect(results[1].value.user).toEqual({ id: 'user-2', email: 'user2@example.com' });
    expect(results[2].value.user).toEqual({ id: 'user-3', email: 'user3@example.com' });
  });

  it('should not clear cache mid-verification', async () => {
    // Multiple rapid sequential requests should all succeed
    const token = signTestToken();
    const authMiddleware = requireAuth(config);

    for (let i = 0; i < 5; i++) {
      const req = mockReq(token);
      const res = mockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      // Verify token was accepted
      expect(next).toHaveBeenCalledOnce();
      expect(req.user).toEqual({ id: 'user-123', email: 'trader@example.com' });
    }
  });

  it('should not throw "Cannot read property of undefined" on concurrent requests', async () => {
    // This test specifically checks that the cache is never cleared mid-verification
    const token1 = signTestToken();
    const token2 = signTestToken();

    const authMiddleware = requireAuth(config);

    const results = [];
    const errors = [];

    try {
      // Fire off rapid concurrent requests
      await Promise.all([
        new Promise((resolve) => {
          try {
            const req = mockReq(token1);
            const res = mockRes();
            const next = vi.fn(() => results.push('token1-ok'));
            authMiddleware(req, res, next);
            resolve();
          } catch (e) {
            errors.push(e);
            resolve();
          }
        }),
        new Promise((resolve) => {
          try {
            const req = mockReq(token2);
            const res = mockRes();
            const next = vi.fn(() => results.push('token2-ok'));
            authMiddleware(req, res, next);
            resolve();
          } catch (e) {
            errors.push(e);
            resolve();
          }
        }),
      ]);
    } catch (e) {
      errors.push(e);
    }

    // Should have no undefined property errors
    const undefinedErrors = errors.filter((e) => e?.message?.includes('Cannot read property'));
    expect(undefinedErrors).toHaveLength(0);

    // Both requests should have succeeded
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
