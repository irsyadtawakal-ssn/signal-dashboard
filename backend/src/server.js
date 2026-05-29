require('dotenv').config();
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');
const { getJson } = require('./http');
const { fetchOctPrice } = require('./sources/dexscreener');
const { fetchMacro } = require('./sources/coingecko');
const { fetchNews } = require('./sources/cryptopanic');
const { fetchTweets } = require('./sources/twitter');
const { classifyTweets } = require('./ai/sentiment');
const { createOpenRouterComplete } = require('./ai/providers/openrouter');
const { createAnthropicComplete } = require('./ai/providers/anthropic');
const { buildTweets } = require('./tweetsService');
const { buildPrice } = require('./priceService');
const { analyzeMarket } = require('./ai/analysis');
const { runPriceUpdate, runCacheUpdate, startScheduler } = require('./scheduler');

try {
  const config = loadConfig();
  const db = createDb(config.dbPath);

  const buildPriceFn = () =>
    buildPrice({
      dexFn: () => fetchOctPrice({ getJsonFn: getJson, tokenAddress: config.octTokenAddress }),
      macroFn: () => fetchMacro({ getJsonFn: getJson }),
    });

  function buildComplete() {
    if (config.aiProvider === 'anthropic') {
      return config.anthropicApiKey
        ? createAnthropicComplete({ apiKey: config.anthropicApiKey, model: config.sentimentModel })
        : null;
    }
    return config.openrouterApiKey
      ? createOpenRouterComplete({ apiKey: config.openrouterApiKey, model: config.sentimentModel })
      : null;
  }

  const complete = buildComplete();
  const classifyFn = (tweets) =>
    complete
      ? classifyTweets({ tweets, complete })
      : Promise.resolve(tweets.map((t) => ({ ...t, sentiment: 'Unrated' })));

  const analysisModel =
    config.analysisModel ||
    (config.aiProvider === 'anthropic' ? 'claude-opus-4-8' : 'anthropic/claude-opus-4.8');
  const analyzeFn = complete
    ? (data) => analyzeMarket({ ...data, complete, model: analysisModel })
    : null;

  const app = createApp({ db, config, analyzeFn });

  startScheduler({
    tasks: [
      { run: () => runPriceUpdate({ db, buildPriceFn }), intervalMs: config.priceIntervalMs },
      {
        run: () =>
          runCacheUpdate({
            db,
            key: 'news',
            produceFn: () => fetchNews({ getJsonFn: getJson, token: config.cryptopanicToken }),
          }),
        intervalMs: config.newsIntervalMs,
      },
      {
        run: () =>
          runCacheUpdate({
            db,
            key: 'tweets',
            produceFn: () =>
              buildTweets({
                fetchFn: () =>
                  fetchTweets({ getJsonFn: getJson, token: config.twitterToken, keywords: config.twitterKeywords }),
                classifyFn,
              }),
          }),
        intervalMs: config.twitterIntervalMs,
      },
    ],
  });

  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
