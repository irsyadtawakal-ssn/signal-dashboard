require('dotenv').config();
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');
const { getJson } = require('./http');
const { fetchOctPrice } = require('./sources/dexscreener');
const { fetchMacro } = require('./sources/coingecko');
const { buildPrice } = require('./priceService');
const { runPriceUpdate, startScheduler } = require('./scheduler');

try {
  const config = loadConfig();
  const db = createDb(config.dbPath);
  const app = createApp({ db, config });

  const buildPriceFn = () =>
    buildPrice({
      dexFn: () => fetchOctPrice({ getJsonFn: getJson, tokenAddress: config.octTokenAddress }),
      macroFn: () => fetchMacro({ getJsonFn: getJson }),
    });

  startScheduler({
    tasks: [
      { run: () => runPriceUpdate({ db, buildPriceFn }), intervalMs: config.priceIntervalMs },
    ],
  });

  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
