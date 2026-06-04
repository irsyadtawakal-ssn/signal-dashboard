const { setCache, getCache } = require('./db');
const { getAnalysis, getPreviousSignal, getMaDirection } = require('./analysisService');
const { generateSignal } = require('./ai/signalGenerator');

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
    setCache(db, 'macro', { btc: { change24h: price.btcChange24h }, eth: { change24h: price.ethChange24h } });
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
      const result = await telegramNotifier.send(signalObj, userId);

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
    // force:true — scheduler owns analysis freshness independently of the user-facing cache TTL
    const result = await getAnalysis({ db, analyzeFn, ttlMs, force: true });
    const newSignal = result.recommendation;
    const previousSignal = getPreviousSignal(db);
    const signalChanged = previousSignal !== newSignal;

    // Send notification to all users only if signal changed (avoid duplicate with technical analysis)
    if (notifier && signalChanged) {
      const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
      const delayMs = 100;
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        setTimeout(() => {
          setImmediate(async () => {
            try {
              await notifier.send(result, user.id);
            } catch (err) {
              console.error(`[Scheduler] Sentiment notification failed for user ${user.id}:`, err.message);
            }
          });
        }, i * delayMs);
      }
    }

    setCache(db, 'lastSignal', newSignal);

    // MA direction state — always update when detected
    if (result.components) {
      const newMaDir = getMaDirection(result.components.movingAverage);

      // Always update MA direction cache for tracking
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

async function runTechnicalAnalysis({ db, config, notifier }) {
  try {
    // 1. Fetch current data from cache
    const priceCache = getCache(db, 'price');
    const macroCache = getCache(db, 'macro');

    if (!priceCache || !macroCache) {
      return {
        status: 'failed',
        error: 'Missing price or macro data',
        timestamp: Date.now()
      };
    }

    const price = priceCache.value;
    const macro = macroCache.value;

    // 2. Get price history (last 200 days for MA calculation)
    const priceHistory = db.prepare(`
      SELECT oct_price FROM price_history
      ORDER BY date DESC LIMIT 200
    `).all();

    if (priceHistory.length < 50) {
      console.warn('[Technical] Insufficient price history for MA calculation');
    }

    const prices = priceHistory.map(p => p.oct_price).reverse();

    // 3. Calculate average volume
    const volumeData = db.prepare(`
      SELECT AVG(oct_volume) as avg_volume FROM price_history
      WHERE date >= DATE('now', '-30 days')
    `).get();

    const avgVolume = volumeData?.avg_volume || price.octVolume24h;

    // 4. Generate signal
    const signal = await generateSignal({
      prices,
      currentPrice: price.oct,
      currentVolume: price.octVolume24h,
      avgVolume: avgVolume,
      btcChange24h: macro.btc.change24h,
      ethChange24h: macro.eth.change24h
    });

    // 5. Check if signal changed
    const previousSignalCache = getCache(db, 'technicalSignal');
    const signalChanged = !previousSignalCache || previousSignalCache.value.signal !== signal.signal;

    // 6. Store to database
    const today = new Date().toISOString().split('T')[0];

    // Store 10-min update
    db.prepare(`
      INSERT OR REPLACE INTO technical_signals_10min
      (timestamp, signal, confidence, score, ma_50, ma_200, rsi_14, volume_ratio)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      signal.signal,
      signal.confidence,
      signal.score,
      signal.indicators.ma50,
      signal.indicators.ma200,
      signal.indicators.rsi,
      signal.indicators.volumeRatio
    );

    // Store daily signal (once per day)
    db.prepare(`
      INSERT OR REPLACE INTO technical_signals_daily
      (date, signal, confidence, ma_50, ma_200, rsi_14, volume_ratio, reasoning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      today,
      signal.signal,
      signal.confidence,
      signal.indicators.ma50,
      signal.indicators.ma200,
      signal.indicators.rsi,
      signal.indicators.volumeRatio,
      signal.reasoning
    );

    // 7. Cleanup old 10-min data (keep only 30 days)
    db.prepare(`
      DELETE FROM technical_signals_10min
      WHERE created_at < datetime('now', '-30 days')
    `).run();

    // 8. Cache signal
    setCache(db, 'technicalSignal', {
      ...signal,
      strategy: 'TECHNICAL',
      signalChanged
    });

    console.log(`[Technical] Signal: ${signal.signal} (${(signal.confidence * 100).toFixed(0)}%)`);

    // 9. Send notifications (immediate on change + periodic every 15 min)
    if (notifier) {
      const signalForNotif = { ...signal, strategy: 'TECHNICAL' };
      const users = db.prepare('SELECT id FROM users WHERE telegramChatId IS NOT NULL').all();
      const delayMs = 100;

      // Check if we should send periodic notification (15 min = 900,000ms)
      const lastNotifTime = getCache(db, 'lastTechnicalNotifTime');
      const now = Date.now();
      const timeSinceLastNotif = lastNotifTime ? now - lastNotifTime.value : 900001; // default to > 15 min
      const shouldSendPeriodic = timeSinceLastNotif > 15 * 60 * 1000; // 15 minutes

      // Send if: signal changed OR 15 min has passed since last notification
      if (signalChanged || shouldSendPeriodic) {
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          setTimeout(() => {
            setImmediate(async () => {
              try {
                await notifier.send(signalForNotif, user.id);
              } catch (err) {
                console.error(`[Technical] Notification failed for user ${user.id}:`, err.message);
              }
            });
          }, i * delayMs);
        }
        // Update last notification time
        setCache(db, 'lastTechnicalNotifTime', now);
        if (signalChanged) {
          console.log('[Technical] Signal changed - immediate notification sent');
        } else {
          console.log('[Technical] 15 min passed - periodic notification sent');
        }
      }
    }

    return {
      status: 'success',
      signal: signal.signal,
      confidence: signal.confidence,
      signalChanged: signalChanged,
      timestamp: Date.now()
    };

  } catch (err) {
    console.error('[Technical Analysis] Failed:', err.message);
    return {
      status: 'failed',
      error: err.message,
      timestamp: Date.now()
    };
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

module.exports = { runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus, retryFailedNotifications, runAnalysisUpdate, runTechnicalAnalysis };
