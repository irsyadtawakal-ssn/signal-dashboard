import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

const sample = { recommendation: 'BUY', confidence: 0.8, summary: 's', components: {} };

function makeApp(analyzeFn, notifier = null) {
  const db = createDb(':memory:');
  const config = {
    supabaseJwtSecret: TEST_SECRET,
    analysisTtlMs: 600000,
    telegramBotToken: 'test-token'
  };
  const app = createApp({ db, config, analyzeFn, notifier });
  return { app, db };
}

describe('POST /api/analyze', () => {
  it('returns 401 without a token', async () => {
    const { app } = makeApp(vi.fn());
    const res = await request(app).post('/api/analyze').send({});
    expect(res.status).toBe(401);
  });

  it('returns 503 when no analyzeFn is configured', async () => {
    const { app } = makeApp(undefined);
    const res = await request(app)
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(503);
  });

  it('returns 200 with the analysis (incl. generatedAt) when configured', async () => {
    const { app } = makeApp(vi.fn().mockResolvedValue(sample));
    const res = await request(app)
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(sample);
    expect(typeof res.body.generatedAt).toBe('number');
  });

  it('returns 502 when analysis fails', async () => {
    const { app } = makeApp(vi.fn().mockRejectedValue(new Error('opus down')));
    const res = await request(app)
      .post('/api/analyze').set('Authorization', `Bearer ${signTestToken()}`).send({});
    expect(res.status).toBe(502);
  });

  it('caches: a second call without force does not re-run; force:true does', async () => {
    const analyzeFn = vi.fn().mockResolvedValue(sample);
    const { app } = makeApp(analyzeFn);
    const auth = `Bearer ${signTestToken()}`;
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    await request(app).post('/api/analyze').set('Authorization', auth).send({});
    expect(analyzeFn).toHaveBeenCalledTimes(1);
    await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
    expect(analyzeFn).toHaveBeenCalledTimes(2);
  });

  describe('signal change detection', () => {
    it('triggers notification when signal changes to BUY', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
      let callCount = 0;
      const analyzeFn = vi.fn().mockImplementation(() => {
        callCount++;
        // First call returns HOLD, second call returns BUY
        return Promise.resolve({
          recommendation: callCount === 1 ? 'HOLD' : 'BUY',
          confidence: 0.8,
          summary: 's',
          components: {}
        });
      });
      const { app } = makeApp(analyzeFn, mockNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call with HOLD
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Second call with BUY signal (force to bypass cache)
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Notification should have been called
      expect(mockNotifier.send).toHaveBeenCalled();
    });

    it('triggers notification when signal changes to SELL', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
      let callCount = 0;
      const analyzeFn = vi.fn().mockImplementation(() => {
        callCount++;
        // First call returns BUY, second call returns SELL
        return Promise.resolve({
          recommendation: callCount === 1 ? 'BUY' : 'SELL',
          confidence: 0.7,
          summary: 's',
          components: {}
        });
      });
      const { app } = makeApp(analyzeFn, mockNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call with BUY
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Second call with SELL signal
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      expect(mockNotifier.send).toHaveBeenCalled();
    });

    it('does not trigger notification when signal is unchanged', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
      const analyzeFn = vi.fn().mockResolvedValue({
        recommendation: 'BUY',
        confidence: 0.8,
        summary: 's',
        components: {}
      });
      const { app } = makeApp(analyzeFn, mockNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call with BUY - sets previousSignal to null, stores lastSignal as BUY
      const res1 = await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      expect(res1.status).toBe(200);
      await new Promise(r => setTimeout(r, 50));

      // Clear notifier calls from first request
      mockNotifier.send.mockClear();

      // Second call also returns BUY (using cache since no force and TTL not expired)
      // This should have previousSignal=BUY, newSignal=BUY, so no notification
      const res2 = await request(app).post('/api/analyze').set('Authorization', auth).send({});
      expect(res2.status).toBe(200);
      await new Promise(r => setTimeout(r, 50));

      // Notification should NOT have been called on the second request
      expect(mockNotifier.send).not.toHaveBeenCalled();
    });

    it('does not trigger notification when signal is HOLD (even if changed to HOLD)', async () => {
      const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
      let callCount = 0;
      const analyzeFn = vi.fn().mockImplementation(() => {
        callCount++;
        // First call returns BUY, second call returns HOLD
        return Promise.resolve({
          recommendation: callCount === 1 ? 'BUY' : 'HOLD',
          confidence: 0.5,
          summary: 's',
          components: {}
        });
      });
      const { app } = makeApp(analyzeFn, mockNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call with BUY
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Second call with HOLD signal
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Notification should NOT have been called (new signal is HOLD, not BUY/SELL)
      expect(mockNotifier.send).not.toHaveBeenCalled();
    });

    it('notification is async and non-blocking (response returns before notification completes)', async () => {
      const slowNotifier = {
        send: vi.fn().mockImplementation(() => new Promise(r => setTimeout(() => r({ success: true }), 200)))
      };
      let callCount = 0;
      const analyzeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          recommendation: callCount === 1 ? 'HOLD' : 'BUY',
          confidence: 0.8,
          summary: 's',
          components: {}
        });
      });
      const { app } = makeApp(analyzeFn, slowNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      const startTime = Date.now();

      // Second call should return quickly even though notifier takes 200ms
      const res = await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      const responseTime = Date.now() - startTime;

      expect(res.status).toBe(200);
      // Response should come back quickly (< 100ms), not wait for notifier (200ms)
      expect(responseTime).toBeLessThan(150);
    });

    it('returns 200 regardless of notification status', async () => {
      const failingNotifier = { send: vi.fn().mockRejectedValue(new Error('Telegram offline')) };
      let callCount = 0;
      const analyzeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          recommendation: callCount === 1 ? 'HOLD' : 'BUY',
          confidence: 0.8,
          summary: 's',
          components: {}
        });
      });
      const { app } = makeApp(analyzeFn, failingNotifier);
      const auth = `Bearer ${signTestToken()}`;

      // First call
      await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      // Second call should still return 200 even if notifier fails
      const res = await request(app).post('/api/analyze').set('Authorization', auth).send({ force: true });
      await new Promise(r => setTimeout(r, 50));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ recommendation: 'BUY' });
    });
  });
});
