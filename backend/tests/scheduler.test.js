import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDb, getCache, setCache } from '../src/db.js';

// We need to reset the scheduler module between tests to clear failure counts
let runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus, runAnalysisUpdate;

beforeEach(async () => {
  // Clear the module cache to reset failure counts
  vi.resetModules();
  const scheduler = await import('../src/scheduler.js');
  runPriceUpdate = scheduler.runPriceUpdate;
  runCacheUpdate = scheduler.runCacheUpdate;
  startScheduler = scheduler.startScheduler;
  getFailureStatus = scheduler.getFailureStatus;
  runAnalysisUpdate = scheduler.runAnalysisUpdate;
});

describe('runPriceUpdate', () => {
  it('writes the built price into the cache under key "price"', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockResolvedValue({ oct: 0.21, btc: 68000, fetchedAt: 123 });
    await runPriceUpdate({ db, buildPriceFn });
    expect(getCache(db, 'price').value).toEqual({ oct: 0.21, btc: 68000, fetchedAt: 123 });
  });

  it('returns success status with record count on success', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockResolvedValue({ oct: 0.21, btc: 68000 });
    const result = await runPriceUpdate({ db, buildPriceFn });
    expect(result).toEqual({
      status: 'success',
      timestamp: expect.any(Number),
      recordCount: 2
    });
  });

  it('returns failed status with error message on failure', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('API timeout'));
    const result = await runPriceUpdate({ db, buildPriceFn });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('API timeout');
    expect(result.failureCount).toBe(1);
    expect(result.timestamp).toBeDefined();
  });

  it('increments failure counter on repeated failures', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('Service down'));

    const result1 = await runPriceUpdate({ db, buildPriceFn });
    expect(result1.failureCount).toBe(1);

    const result2 = await runPriceUpdate({ db, buildPriceFn });
    expect(result2.failureCount).toBe(2);

    const result3 = await runPriceUpdate({ db, buildPriceFn });
    expect(result3.failureCount).toBe(3);
  });

  it('resets failure counter on success after failures', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn();

    // Fail twice
    buildPriceFn.mockRejectedValueOnce(new Error('fail 1'));
    buildPriceFn.mockRejectedValueOnce(new Error('fail 2'));

    await runPriceUpdate({ db, buildPriceFn });
    await runPriceUpdate({ db, buildPriceFn });

    // Succeed
    buildPriceFn.mockResolvedValueOnce({ oct: 0.21 });
    const result = await runPriceUpdate({ db, buildPriceFn });

    expect(result.status).toBe('success');
    expect(result.failureCount).toBeUndefined();
  });

  it('logs critical alert when failure threshold is reached', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('Critical fail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (let i = 0; i < 3; i++) {
      await runPriceUpdate({ db, buildPriceFn });
    }

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CRITICAL] Price updates failing 3 times')
    );
    errorSpy.mockRestore();
  });
});

describe('runCacheUpdate', () => {
  it('writes the produced value under the given key', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockResolvedValue([{ title: 'hi' }]);
    await runCacheUpdate({ db, key: 'news', produceFn });
    expect(getCache(db, 'news').value).toEqual([{ title: 'hi' }]);
  });

  it('returns success status with record count on success', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockResolvedValue([{ title: 'hi' }, { title: 'bye' }]);
    const result = await runCacheUpdate({ db, key: 'news', produceFn });
    expect(result).toEqual({
      status: 'success',
      timestamp: expect.any(Number),
      recordCount: 2
    });
  });

  it('returns failed status with error and key on failure', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await runCacheUpdate({ db, key: 'tweets', produceFn });
    expect(result.status).toBe('failed');
    expect(result.key).toBe('tweets');
    expect(result.error).toBe('Network error');
    expect(result.failureCount).toBe(1);
  });

  it('increments failure counter independently per call', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockRejectedValue(new Error('fail'));

    const result1 = await runCacheUpdate({ db, key: 'key1', produceFn });
    expect(result1.failureCount).toBe(1);

    const result2 = await runCacheUpdate({ db, key: 'key2', produceFn });
    expect(result2.failureCount).toBe(2);
  });

  it('resets failure counter on success', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn();

    // Fail
    produceFn.mockRejectedValueOnce(new Error('fail'));
    await runCacheUpdate({ db, key: 'data', produceFn });

    // Succeed
    produceFn.mockResolvedValueOnce([{ x: 1 }]);
    const result = await runCacheUpdate({ db, key: 'data', produceFn });

    expect(result.status).toBe('success');
    expect(result.failureCount).toBeUndefined();
  });

  it('logs critical alert when failure threshold is reached', async () => {
    const db = createDb(':memory:');
    const produceFn = vi.fn().mockRejectedValue(new Error('Critical fail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (let i = 0; i < 3; i++) {
      await runCacheUpdate({ db, key: 'critical', produceFn });
    }

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CRITICAL] Cache updates failing 3 times')
    );
    errorSpy.mockRestore();
  });
});

describe('getFailureStatus', () => {
  beforeEach(() => {
    // Reset failure counts before each test
    vi.resetModules();
  });

  it('returns current failure status for all tasks', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trigger some failures
    await runPriceUpdate({ db, buildPriceFn });
    await runPriceUpdate({ db, buildPriceFn });

    const status = getFailureStatus();
    expect(status.price.count).toBe(2);
    expect(status.price.threshold).toBe(3);
    expect(status.critical).toBe(false);
  });

  it('marks critical when threshold exceeded', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await runPriceUpdate({ db, buildPriceFn });
    }

    const status = getFailureStatus();
    expect(status.price.count).toBe(3);
    expect(status.critical).toBe(true);
  });
});

describe('startScheduler', () => {
  it('runs each task immediately and returns stop handles', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue(undefined);
    const stop = startScheduler({ tasks: [{ run: task, intervalMs: 1000 }] });
    expect(task).toHaveBeenCalledTimes(1); // immediate run on start
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(2); // no more after stop
    vi.useRealTimers();
  });
});

describe('retryFailedNotifications', () => {
  let retryFailedNotifications;

  beforeEach(async () => {
    vi.resetModules();
    const scheduler = await import('../src/scheduler.js');
    retryFailedNotifications = scheduler.retryFailedNotifications;
  });

  it('retries failed notification successfully and deletes from table', async () => {
    const db = createDb(':memory:');
    const userId = 'user-123';
    const chatId = '987654321';
    const signal = { recommendation: 'BUY', confidence: 0.85, summary: 'Test', components: {}, generatedAt: new Date().toISOString() };

    // Create user with chat ID
    db.prepare('INSERT INTO users (id, email, telegramChatId) VALUES (?, ?, ?)').run(userId, 'user@example.com', chatId);

    // Insert failed notification
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, JSON.stringify(signal), 'Timeout', 1, new Date().toISOString());

    const telegramNotifier = {
      send: vi.fn().mockResolvedValue({ success: true, messageId: 12345 })
    };

    const config = { botToken: 'fake-token' };

    // Run retry job
    await retryFailedNotifications({ db, telegramNotifier, config });

    // Verify notification was deleted
    const remaining = db.prepare('SELECT id FROM failed_notifications WHERE userId = ?').all(userId);
    expect(remaining.length).toBe(0);

    // Verify send was called
    expect(telegramNotifier.send).toHaveBeenCalled();
  });

  it('reschedules notification if retry fails', async () => {
    const db = createDb(':memory:');
    const userId = 'user-456';
    const chatId = '987654321';
    const signal = { recommendation: 'SELL', confidence: 0.75, summary: 'Test', components: {}, generatedAt: new Date().toISOString() };

    // Create user with chat ID
    db.prepare('INSERT INTO users (id, email, telegramChatId) VALUES (?, ?, ?)').run(userId, 'user@example.com', chatId);

    // Insert failed notification with retryCount = 0
    const now = new Date();
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, JSON.stringify(signal), 'Network error', 0, now.toISOString());

    const telegramNotifier = {
      send: vi.fn().mockResolvedValue({ success: false, error: 'Still failing' })
    };

    const config = { botToken: 'fake-token' };

    // Run retry job
    await retryFailedNotifications({ db, telegramNotifier, config });

    // Verify notification was updated (not deleted)
    const notification = db.prepare('SELECT retryCount, nextRetryAt FROM failed_notifications WHERE userId = ?').get(userId);
    expect(notification).toBeDefined();
    expect(notification.retryCount).toBe(1);
    expect(new Date(notification.nextRetryAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it('stops retrying when max retries reached', async () => {
    const db = createDb(':memory:');
    const userId = 'user-789';
    const chatId = '987654321';
    const signal = { recommendation: 'HOLD', confidence: 0.5, summary: 'Test', components: {}, generatedAt: new Date().toISOString() };

    // Create user with chat ID
    db.prepare('INSERT INTO users (id, email, telegramChatId) VALUES (?, ?, ?)').run(userId, 'user@example.com', chatId);

    // Insert failed notification at max retries (3)
    const now = new Date();
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, JSON.stringify(signal), 'Max retries reached', 3, now.toISOString());

    const telegramNotifier = {
      send: vi.fn().mockResolvedValue({ success: false, error: 'Still failing' })
    };

    const config = { botToken: 'fake-token' };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Run retry job
    await retryFailedNotifications({ db, telegramNotifier, config });

    // Verify notification is still in table (not deleted)
    const notification = db.prepare('SELECT id FROM failed_notifications WHERE userId = ?').get(userId);
    expect(notification).toBeDefined();

    // Verify warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max retries (3) reached')
    );

    warnSpy.mockRestore();
  });

  it('deletes notification if user has no telegramChatId', async () => {
    const db = createDb(':memory:');
    const userId = 'user-no-chat';
    const signal = { recommendation: 'BUY', confidence: 0.85, summary: 'Test', components: {}, generatedAt: new Date().toISOString() };

    // Create user WITHOUT chat ID
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(userId, 'user@example.com');

    // Insert failed notification
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, JSON.stringify(signal), 'No chat ID', 0, new Date().toISOString());

    const telegramNotifier = {
      send: vi.fn()
    };

    const config = { botToken: 'fake-token' };
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    // Run retry job
    await retryFailedNotifications({ db, telegramNotifier, config });

    // Verify notification was deleted
    const remaining = db.prepare('SELECT id FROM failed_notifications WHERE userId = ?').all(userId);
    expect(remaining.length).toBe(0);

    // Verify send was NOT called
    expect(telegramNotifier.send).not.toHaveBeenCalled();

    // Verify info was logged
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('User disconnected')
    );

    infoSpy.mockRestore();
  });

  it('uses exponential backoff delays correctly', async () => {
    const db = createDb(':memory:');
    const userId = 'user-backoff';
    const chatId = '987654321';
    const signal = { recommendation: 'BUY', confidence: 0.85, summary: 'Test', components: {}, generatedAt: new Date().toISOString() };

    // Create user with chat ID
    db.prepare('INSERT INTO users (id, email, telegramChatId) VALUES (?, ?, ?)').run(userId, 'user@example.com', chatId);

    const telegramNotifier = {
      send: vi.fn().mockResolvedValue({ success: false, error: 'Network error' })
    };

    const config = { botToken: 'fake-token' };

    // Test each retry with different retryCount
    // retryCount 0 -> delay 60000ms (1 minute)
    // retryCount 1 -> delay 300000ms (5 minutes)
    // retryCount 2 -> delay 1800000ms (30 minutes)
    const delays = [60000, 300000, 1800000];

    for (let retryCount = 0; retryCount < 3; retryCount++) {
      // Delete previous record
      db.prepare('DELETE FROM failed_notifications WHERE userId = ?').run(userId);

      const now = Date.now();
      const nowISO = new Date(now).toISOString();

      // Insert notification with specific retryCount
      db.prepare(`
        INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, JSON.stringify(signal), 'Network error', retryCount, nowISO);

      // Run retry job
      await retryFailedNotifications({ db, telegramNotifier, config });

      // Verify nextRetryAt is set to now + exponential backoff delay
      const notification = db.prepare('SELECT nextRetryAt FROM failed_notifications WHERE userId = ?').get(userId);
      const nextRetryTime = new Date(notification.nextRetryAt).getTime();
      const expectedDelay = delays[retryCount];
      const expectedMinDelay = now + expectedDelay;

      // Allow 500ms variance for test execution time
      expect(nextRetryTime).toBeGreaterThanOrEqual(expectedMinDelay - 500);
      expect(nextRetryTime).toBeLessThanOrEqual(expectedMinDelay + 500);
    }
  });
});

describe('runAnalysisUpdate', () => {
  function makeDb() {
    const db = createDb(':memory:');
    return db;
  }

  function addUser(db, id, chatId = null) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
    if (chatId) {
      db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run(chatId, id);
    }
  }

  it('sends notification to all users with telegramChatId when signal changes to BUY', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');
    addUser(db, 'user-2', '222222222');
    addUser(db, 'user-3'); // no chatId

    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({ recommendation: 'BUY', confidence: 0.8, summary: 's', components: {} });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(2); // user-1 and user-2 only
  });

  it('sends notification to all users with telegramChatId when signal changes to SELL', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'SELL', confidence: 0.7, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('sends notification when MA direction crosses below to above', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'below');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('sends notification when MA direction crosses above to below', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'above');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price fell below 20-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('does not send notification when signal is unchanged', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not send notification when signal changes to HOLD', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'BUY');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not send notification when MA direction is unchanged', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'above');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'HOLD', confidence: 0.5, summary: 's',
      components: { movingAverage: 'Price still above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('does not notify users without telegramChatId', async () => {
    const db = makeDb();
    addUser(db, 'user-no-chat'); // no chatId

    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('sends only one notification when signal and MA both change', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');

    setCache(db, 'lastSignal', 'HOLD');
    setCache(db, 'lastMADirection', 'below');

    const mockNotifier = { send: vi.fn().mockResolvedValue({ success: true }) };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.85, summary: 's',
      components: { movingAverage: 'Price above 50-day MA' }
    });

    await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('returns success even when notifier throws for one user', async () => {
    const db = makeDb();
    addUser(db, 'user-1', '111111111');
    addUser(db, 'user-2', '222222222');

    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = {
      send: vi.fn()
        .mockRejectedValueOnce(new Error('Telegram down'))
        .mockResolvedValueOnce({ success: true })
    };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'BUY', confidence: 0.8, summary: 's', components: {}
    });

    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(result.status).toBe('success');
  });

  it('returns failed status when analyzeFn throws', async () => {
    const db = makeDb();
    const mockNotifier = { send: vi.fn() };
    const analyzeFn = vi.fn().mockRejectedValue(new Error('AI API down'));

    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('AI API down');
    expect(result.timestamp).toBeDefined();
    expect(mockNotifier.send).not.toHaveBeenCalled();
  });

  it('returns success with recommendation on successful run', async () => {
    const db = makeDb();
    setCache(db, 'lastSignal', 'HOLD');

    const mockNotifier = { send: vi.fn() };
    const analyzeFn = vi.fn().mockResolvedValue({
      recommendation: 'SELL', confidence: 0.75, summary: 's', components: {}
    });

    addUser(db, 'user-1', '111111111');
    const result = await runAnalysisUpdate({ db, analyzeFn, ttlMs: 0, notifier: mockNotifier });
    await new Promise(r => setTimeout(r, 50));

    expect(result.status).toBe('success');
    expect(result.recommendation).toBe('SELL');
    expect(result.timestamp).toBeDefined();
  });
});
