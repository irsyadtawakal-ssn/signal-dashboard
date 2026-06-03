require('dotenv').config({ override: true });
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
const { runPriceUpdate, runCacheUpdate, startScheduler, retryFailedNotifications, runAnalysisUpdate, runTechnicalAnalysis } = require('./scheduler');
const { createNotifier } = require('./services/notifierFactory');

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

  // Create notifier if Telegram bot token is configured
  const notifier = config.telegramBotToken ? createNotifier({ botToken: config.telegramBotToken }, db) : null;

  const app = createApp({ db, config, analyzeFn, notifier });

  // Prepare tasks array with base tasks
  const baseTasks = [
    { run: () => runPriceUpdate({ db, buildPriceFn }), intervalMs: config.priceIntervalMs },
    {
      run: () =>
        runCacheUpdate({
          db,
          key: 'news',
          produceFn: () => fetchNews({ limit: 10 }),
        }),
      intervalMs: config.newsIntervalMs,
    },
    ...(!config.disableTwitter ? [{
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
    }] : []),
    {
      run: () => runTechnicalAnalysis({ db, config, notifier }),
      intervalMs: config.signalUpdateIntervalMs || 600000  // 10 minutes default
    },
  ];

  // Add auto-analysis job if both AI and Telegram are configured
  if (analyzeFn && notifier && !config.disableTwitter) {
    baseTasks.push({
      run: () => runAnalysisUpdate({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }),
      intervalMs: config.analysisScheduleIntervalMs,
    });
    console.log(`[Server] Auto-analysis scheduler registered (every ${config.analysisScheduleIntervalMs / 1000 / 60} minutes)`);
  }

  // Start scheduler with base tasks
  startScheduler({ tasks: baseTasks });

  // Add retry failed notifications job if Telegram is configured
  if (config.telegramBotToken && notifier) {
    setInterval(
      () => retryFailedNotifications({ db, telegramNotifier: notifier, config }),
      60000
    );
    console.log('[Server] Retry scheduler for failed notifications initialized (1 minute interval)');
  }

  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
