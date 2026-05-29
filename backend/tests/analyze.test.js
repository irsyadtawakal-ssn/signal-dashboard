import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

const sample = { recommendation: 'BUY', confidence: 0.8, summary: 's', components: {} };

function makeApp(analyzeFn) {
  const db = createDb(':memory:');
  const app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET, analysisTtlMs: 600000 }, analyzeFn });
  return app;
}

describe('POST /api/analyze', () => {
  it('returns 401 without a token', async () => {
    const res = await request(makeApp(vi.fn())).post('/api/analyze').send({});
    expect(res.status).toBe(401);
  });

  it('returns 503 when no analyzeFn is configured', async () => {
    const res = await request(makeApp(undefined))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(503);
  });

  it('returns 200 with the analysis (incl. generatedAt) when configured', async () => {
    const res = await request(makeApp(vi.fn().mockResolvedValue(sample)))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(sample);
    expect(typeof res.body.generatedAt).toBe('number');
  });

  it('returns 502 when analysis fails', async () => {
    const res = await request(makeApp(vi.fn().mockRejectedValue(new Error('opus down'))))
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(502);
  });

  it('caches: a second call without force does not re-run; force:true does', async () => {
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    const app = makeApp(analyzeFn);
    const auth = `Bearer ${signTestToken()}`;
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
    expect(analyzeFn).toHaveBeenCalledTimes(2);
  });
});
