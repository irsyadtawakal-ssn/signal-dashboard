import { describe, it, expect, vi } from 'vitest';
import { runPriceUpdate, startScheduler } from '../src/scheduler.js';
import { createDb, getCache } from '../src/db.js';

describe('runPriceUpdate', () => {
  it('writes the built price into the cache under key "price"', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockResolvedValue({ oct: 0.21, btc: 68000, fetchedAt: 123 });
    await runPriceUpdate({ db, buildPriceFn });
    expect(getCache(db, 'price').value).toEqual({ oct: 0.21, btc: 68000, fetchedAt: 123 });
  });

  it('does not throw if buildPrice fails (logs and skips write)', async () => {
    const db = createDb(':memory:');
    const buildPriceFn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runPriceUpdate({ db, buildPriceFn })).resolves.toBeUndefined();
    expect(getCache(db, 'price')).toBeNull();
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
