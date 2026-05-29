const { setCache } = require('./db');

async function runPriceUpdate({ db, buildPriceFn }) {
  try {
    const price = await buildPriceFn();
    setCache(db, 'price', price);
  } catch (err) {
    console.error('price update failed:', err.message);
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

module.exports = { runPriceUpdate, startScheduler };
