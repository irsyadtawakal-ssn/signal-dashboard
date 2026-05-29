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

  it('rejects a token with the wrong audience', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'someone-else' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a token with aud=authenticated', () => {
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'authenticated' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(config)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a token with the wrong issuer when issuer is configured', () => {
    const cfgWithIss = { supabaseJwtSecret: TEST_SECRET, supabaseJwtIssuer: 'https://good.example' };
    const req = { headers: { authorization: `Bearer ${signTestToken({ aud: 'authenticated', iss: 'https://evil.example' })}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(cfgWithIss)(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});
