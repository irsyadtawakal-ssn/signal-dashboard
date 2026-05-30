const { setCache } = require('./db');

const FAILURE_THRESHOLD = 3;

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

function startScheduler({ tasks }) {
  const timers = tasks.map(({ run, intervalMs }) => {
    run(); // run immediately on start
    return setInterval(run, intervalMs);
  });
  return function stop() {
    timers.forEach(clearInterval);
  };
}

module.exports = { runPriceUpdate, runCacheUpdate, startScheduler, getFailureStatus };
