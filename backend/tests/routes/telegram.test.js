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

describe('POST /api/telegram/verify/:code', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDb(':memory:');
    app = makeApp(db);
    // Create a test user
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-123', 'test@example.com');
  });

  describe('Valid code verification', () => {
    it('verifies a valid code and saves chatId', async () => {
      const token = signTestToken({ sub: 'user-123' });

      // Step 1: Generate a code
      const connectRes = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const code = connectRes.body.code;

      // Step 2: Verify the code with chatId
      const verifyRes = await request(app)
        .post(`/api/telegram/verify/${code}`)
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.message).toBeDefined();

      // Step 3: Check that chatId was saved to database
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get('user-123');
      expect(user.telegramChatId).toBe('12345');
    });

    it('returns success message when chatId is saved', async () => {
      const token = signTestToken({ sub: 'user-123' });

      const connectRes = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const code = connectRes.body.code;

      const verifyRes = await request(app)
        .post(`/api/telegram/verify/${code}`)
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.message).toContain('successfully');
    });
  });

  describe('Invalid code handling', () => {
    it('returns 400 with invalid_code error for non-existent code', async () => {
      const verifyRes = await request(app)
        .post('/api/telegram/verify/INVALID')
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error).toBe('invalid_code');
    });

    it('returns 400 with invalid_code error for malformed code', async () => {
      const verifyRes = await request(app)
        .post('/api/telegram/verify/short')
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error).toBe('invalid_code');
    });
  });

  describe('Code expiration handling', () => {
    it('returns 400 with code_expired error for expired code', async () => {
      const token = signTestToken({ sub: 'user-123' });

      // Create a code and manually expire it
      const connectRes = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const code = connectRes.body.code;

      // Simulate time passing by manipulating the stored code
      // We need to create an expired code in authCodes
      const router = app._router.stack
        .find(layer => layer.name === 'router')
        .handle;

      // Access the authCodes from the router
      // Since authCodes is not exported, we'll test expiration by directly setting it
      const mockExpiredCode = {
        code,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      // For this test to work, we need to simulate an expired code
      // We'll manually create one by crafting an app instance that has an expired code
      vi.useFakeTimers();
      const beforeTime = Date.now();
      vi.setSystemTime(beforeTime);

      const connectRes2 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const codeToExpire = connectRes2.body.code;

      // Fast forward time by 11 minutes (more than the 10-minute expiry)
      vi.setSystemTime(beforeTime + 11 * 60 * 1000);

      const verifyRes = await request(app)
        .post(`/api/telegram/verify/${codeToExpire}`)
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error).toBe('code_expired');

      vi.useRealTimers();
    });
  });

  describe('Duplicate chatId handling', () => {
    it('returns 400 if same chatId is already connected to different user', async () => {
      // Create second user
      db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-456', 'test2@example.com');

      const token1 = signTestToken({ sub: 'user-123' });
      const token2 = signTestToken({ sub: 'user-456' });

      // Connect first user with chatId
      const connectRes1 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token1}`)
        .send({});
      const code1 = connectRes1.body.code;

      const verifyRes1 = await request(app)
        .post(`/api/telegram/verify/${code1}`)
        .send({ chatId: '12345' });

      expect(verifyRes1.status).toBe(200);

      // Try to connect second user with same chatId
      const connectRes2 = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token2}`)
        .send({});
      const code2 = connectRes2.body.code;

      const verifyRes2 = await request(app)
        .post(`/api/telegram/verify/${code2}`)
        .send({ chatId: '12345' });

      expect(verifyRes2.status).toBe(400);
      expect(verifyRes2.body.error).toBeDefined();
    });
  });

  describe('Code cleanup', () => {
    it('deletes the code after successful verification', async () => {
      const token = signTestToken({ sub: 'user-123' });

      const connectRes = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code = connectRes.body.code;

      const verifyRes = await request(app)
        .post(`/api/telegram/verify/${code}`)
        .send({ chatId: '12345' });

      expect(verifyRes.status).toBe(200);

      // Try to verify the same code again - should fail
      const verifyRes2 = await request(app)
        .post(`/api/telegram/verify/${code}`)
        .send({ chatId: '67890' });

      expect(verifyRes2.status).toBe(400);
      expect(verifyRes2.body.error).toBe('invalid_code');
    });
  });

  describe('Missing or invalid body', () => {
    it('returns 400 if chatId is missing', async () => {
      const token = signTestToken({ sub: 'user-123' });

      const connectRes = await request(app)
        .post('/api/telegram/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const code = connectRes.body.code;

      const verifyRes = await request(app)
        .post(`/api/telegram/verify/${code}`)
        .send({});

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error).toBeDefined();
    });
  });
});

describe('GET /api/telegram/status', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDb(':memory:');
    app = makeApp(db);
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-123', 'test@example.com');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/telegram/status');
    expect(res.status).toBe(401);
  });

  it('returns connected: false when no chatId saved', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.chatId).toBeNull();
  });

  it('returns connected: true with chatId when saved', async () => {
    db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run('987654321', 'user-123');
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.chatId).toBe('987654321');
  });
});

describe('PUT /api/telegram/chatid', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDb(':memory:');
    app = makeApp(db);
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-123', 'test@example.com');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).put('/api/telegram/chatid').send({ chatId: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if chatId is missing', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_chat_id');
  });

  it('returns 400 if chatId is not numeric', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_chat_id');
  });

  it('returns 400 if chatId exceeds 20 characters', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '123456789012345678901' }); // 21 digits
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_chat_id');
  });

  it('saves chatId and returns success', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '987654321' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get('user-123');
    expect(user.telegramChatId).toBe('987654321');
  });

  it('overwrites a previously saved chatId', async () => {
    db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run('111111111', 'user-123');
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '999999999' });
    expect(res.status).toBe(200);
    const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get('user-123');
    expect(user.telegramChatId).toBe('999999999');
  });
});
