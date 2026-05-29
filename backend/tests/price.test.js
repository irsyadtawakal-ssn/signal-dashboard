import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, setCache } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

let app, db;
beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET } });
});

describe('GET /api/price', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/price');
    expect(res.status).toBe(401);
  });

  it('returns 503 when authed but cache is empty', async () => {
    const res = await request(app)
      .get('/api/price')
      .set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(503);
  });

  it('returns cached price when authed and cache is warm', async () => {
    setCache(db, 'price', { oct: 0.21, btc: 68000 });
    const res = await request(app)
      .get('/api/price')
      .set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ oct: 0.21, btc: 68000 });
  });
});
