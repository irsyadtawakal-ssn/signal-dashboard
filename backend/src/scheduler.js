const { setCache, getCache } = require('./db');
const { getAnalysis, getPreviousSignal, getMaDirection } = require('./analysisService');

const FAILURE_THRESHOLD = 3;
const MAX_RETRIES = 3;
const EXPONENTIAL_BACKOFF_DELAYS = [60000, 300000, 1800000, 3600000]; // [1m, 5m, 30m, 1h]

let failureCount = {
  price: 0,
  cache: 0
};

async function runPriceUpdate({ db, buildPriceFn }) {
  try {
    const price = await buildPriceFn();
    setCache(db, 'price', price);
    failureCount.price = 0;

    return {
      status: 'success',
      timestamp: Date.now(),
      recordCount: Object.keys(price).length
    };
  } catch (err) {
    failureCount.price++;

    console.error(`[Scheduler] Price update failed (${failureCount.price}/${FAILURE_THRESHOLD}):`, err.message);

    if (failureCount.price >= FAILURE_THRESHOLD) {
      console.error(
        `[CRITICAL] Price updates failing ${failureCount.price} times. ` +
        `Last error: ${err.message}. App will use stale cache until recovery.`
      );
    }

    return {
      status: 'failed',
      error: err.message,
      failureCount: failureCount.price,
      timestamp: Date.now()
    };
  }
}

async function runCacheUpdate({ db, key, produceFn }) {
  try {
    const value = await produceFn();
    setCache(db, key, value);
    failureCount.cache = 0;

    return {
      status: 'success',
      timestamp: Date.now(),
      recordCount: Array.isArray(value) ? value.length : 1
    };
  } catch (err) {
    failureCount.cache++;

    console.error(`[Scheduler] Cache update failed for ${key} (${failureCount.cache}/${FAILURE_THRESHOLD}):`, err.message);

    if (failureCount.cache >= FAILURE_THRESHOLD) {
      console.error(
        `[CRITICAL] Cache updates failing ${failureCount.cache} times. ` +
        `Last error: ${err.message}.`
      );
    }

    return {
      status: 'failed',
      key,
      error: err.message,
      failureCount: failureCount.cache,
      timestamp: Date.now()
    };
  }
}

function getFailureStatus() {
  return {
    price: { count: failureCount.price, threshold: FAILURE_THRESHOLD },
    cache: { count: failureCount.cache, threshold: FAILURE_THRESHOLD },
    critical: failureCount.price >= FAILURE_THRESHOLD || failureCount.cache >= FAILURE_THRESHOLD
  };
}

async function retryFailedNotifications({ db, telegramNotifier, config }) {
  try {
    // Query failed notifications that are ready to retry (include those at MAX_RETRIES for final attempt)
    const failedNotifications = db.prepare(`
      SELECT id, userId, signal, retryCount, nextRetryAt
      FROM failed_notifications
      WHERE retryCount <= ?
        AND (nextRetryAt IS NULL OR datetime(nextRetryAt) <= datetime('now'))
      ORDER BY nextRetryAt ASC
    `).all(MAX_RETRIES);

    for (const notification of failedNotifications) {
      const { id, userId, signal, retryCount } = notification;

      // Get user to retrieve telegramChatId
      const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get(userId);

      // If user has no chat ID, delete the notification
      if (!user || !user.telegramChatId) {
        db.prepare('DELETE FROM failed_notifications WHERE id = ?').run(id);
        console.info(`[Retry] User disconnected (no telegramChatId) for notification ${id}, deleting from queue`);
        continue;
      }

      // Parse signal JSON
      let signalObj;
      try {
        signalObj = typeof signal === 'string' ? JSON.parse(signal) : signal;
      } catch (err) {
        console.error(`[Retry] Failed to parse signal for notification ${id}:`, err.message);
        db.prepare('DELETE FROM failed_notifications WHERE id = ?').run(id);
        continue;
      }

      // Attempt to send via telegramNotifier
      const result = await telegramNotifier.send(user.telegramChatId, signalObj, config);

      if (result.success) {
        // Success: delete from failed_notifications table
        db.prepare('DELETE FROM failed_notifications WHERE id = ?').run(id);
        console.info(`[Retry] Notification ${id} sent successfully, removed from queue (was retry attempt ${retryCount + 1})`);
      } else {
        // Failure: check if we've reached max retries
        if (retryCount >= MAX_RETRIES) {
          // Max retries reached: leave in table but log warning
          console.warn(`[Retry] Max retries (${MAX_RETRIES}) reached for notification ${id} (userId: ${userId}), error: ${result.error}`);
        } else {
          // Schedule next retry with exponential backoff
          const newRetryCount = retryCount + 1;
          const backoffDelay = EXPONENTIAL_BACKOFF_DELAYS[retryCount];
          const nextRetryTime = new Date(Date.now() + backoffDelay).toISOString();

          db.prepare(`
            UPDATE failed_notifications
            SET retryCount = ?, nextRetryAt = ?, errorMessage = ?
            WHERE id = ?
          `).run(newRetryCount, nextRetryTime, result.error, id);

          console.info(`[Retry] Notification ${id} failed, scheduled retry ${newRetryCount + 1}/${MAX_RETRIES} in ${backoffDelay / 1000 / 60}m`);
        }
      }
    }

    return {
      status: 'success',
      processed: failedNotifications.length,
      timestamp: Date.now()
    };
  } catch (err) {
    console.error('[Retry] Error in retryFailedNotifications:', err.message);
    return {
      status: 'failed',
      error: err.message,
      timestamp: Date.now()
    };
  }
}

async function runAnalysisUpdate({ db, analyzeFn, ttlMs, notifier }) {
  try {
    const result = await getAnalysis({ db, analyzeFn, ttlMs, force: true });
    const newSignal = result.recommendation;
    const previousSignal = getPreviousSignal(db);
    let notificationFired = false;

    // Trigger 1: signal changed to BUY or SELL
    if (previousSignal && previousSignal !== newSignal && ['BUY', 'SELL'].includes(newSignal)) {
      notificationFired = true;
      const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
      for (const user of users) {
        setImmediate(async () => {
          try {
            await notifier.send(result, user.id);
          } catch (err) {
            console.error(`[Scheduler] Signal notification failed for user ${user.id}:`, err.message);
          }
        });
      }
    }

    setCache(db, 'lastSignal', newSignal);

    // MA direction state — always update when detected
    if (result.components) {
      const newMaDir = getMaDirection(result.components.movingAverage);

      // Trigger 2: MA direction crossed, only if signal trigger didn't fire
      if (!notificationFired) {
        const prevMaDirCache = getCache(db, 'lastMADirection');
        const prevMaDir = prevMaDirCache ? prevMaDirCache.value : null;

        if (newMaDir && prevMaDir && newMaDir !== prevMaDir) {
          const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
          for (const user of users) {
            setImmediate(async () => {
              try {
                await notifier.send(result, user.id);
              } catch (err) {
                console.error(`[Scheduler] MA crossover notification failed for user ${user.id}:`, err.message);
              }
            });
          }
        }
      }

      if (newMaDir) {
        setCache(db, 'lastMADirection', newMaDir);
      }
    }

    return { status: 'success', timestamp: Date.now(), recommendation: newSignal };
  } catch (err) {
    console.error('[Scheduler] Analysis update failed:', err.message);
    return { status: 'failed', error: err.message, timestamp: Date.now() };
  }
}

function startScheduler({ tasks }) {
  const timers = tasks.map(({ run, intervalMs }) => {
    run(); // run immediately on start
    return setInterval(run, intervalMs);
  });
  return function stop() {
    timers.forEach(clearInterval);
  };
}

module.exports = { runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus, retryFailedNotifications, runAnalysisUpdate };
