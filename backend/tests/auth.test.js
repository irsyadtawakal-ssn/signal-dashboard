import { describe, it, expect, vi } from 'vitest';
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

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a tampered/invalid token', () => {
    const req = { headers: { authorization: 'Bearer not.a.jwt' } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({}, 'wrong-secret')}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid token and attaches req.user', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken()}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'user-123', email: 'trader@example.com' });
  });
});
