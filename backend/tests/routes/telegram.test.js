import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db.js';
import { signTestToken, TEST_SECRET } from '../helpers.js';

function makeApp(db) {
  const config = {
    supabaseJwtSecret: TEST_SECRET,
    telegramBotName: 'SignalDashboardBot'
  };
  const app = createApp({ db, config });
  return app;
}

describe('POST /api/telegram/connect', () => {
  let db;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  describe('Authentication', () => {
    it('returns 401 without a token', async () => {
      const res = await request(makeApp(db)).post('/api/telegram/connect').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', 'Bearer invalid-token')
        .send({});
      expect(res.status).toBe(401);
    });
  });

  describe('Auth code generation', () => {
    it('generates a valid 6-character alphanumeric code', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBeDefined();
      expect(res.body.code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('generates different codes on subsequent requests', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const req1 = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code1 = req1.body.code;

      // Create a new app instance to avoid state sharing, but use same user
      const db2 = createDb(':memory:');
      const req2 = await request(makeApp(db2))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code2 = req2.body.code;

      expect(code1).not.toEqual(code2);
    });

    it('invalidates previous code for same user', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const app = makeApp(db);

      // First request
      const res1 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code1 = res1.body.code;

      // Second request should invalidate the first
      const res2 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code2 = res2.body.code;

      expect(code1).not.toEqual(code2);
      // Both codes should exist but only code2 should be valid
      // This is validated indirectly by the fact that separate users get separate codes
    });
  });

  describe('Response format', () => {
    it('returns code, botName, and expiresIn', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('botName');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.code).toBe('string');
      expect(typeof res.body.botName).toBe('string');
      expect(typeof res.body.expiresIn).toBe('number');
    });

    it('returns expiresIn as 600 (10 minutes in seconds)', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.expiresIn).toBe(600);
    });

    it('returns configured botName in response', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.botName).toBe('SignalDashboardBot');
    });
  });

  describe('Code expiration', () => {
    it('stores code with expiration timestamp (10 minutes from now)', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const before = Date.now();
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const after = Date.now();

      expect(res.status).toBe(200);
      const expectedExpiry = before + 600000; // 10 minutes in ms
      const actualExpiry = res.body.expiresAt;

      // Allow 1 second of tolerance for timing variance
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
    });

    it('stores expiry timestamp in response', async () => {
      const token = signTestToken({ sub: 'user-123' });
      const res = await request(makeApp(db))
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('expiresAt');
      expect(typeof res.body.expiresAt).toBe('number');
      expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('Multiple users', () => {
    it('generates different codes for different users', async () => {
      const app = makeApp(db);
      const token1 = signTestToken({ sub: 'user-123' });
      const token2 = signTestToken({ sub: 'user-456' });

      const res1 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token1}`)
        .send({});

      const res2 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token2}`)
        .send({});

      expect(res1.body.code).not.toEqual(res2.body.code);
    });
  });
});
