const { getCache, setCache } = require('./db');

async function getAnalysis({ db, analyzeFn, ttlMs, force = false, now = Date.now }) {
  const cached = getCache(db, 'analysis');
  if (!force && cached && now() - cached.value.generatedAt < ttlMs) {
    return cached.value;
  }

  const price = getCache(db, 'price');
  const tweets = getCache(db, 'tweets');
  const news = getCache(db, 'news');

  const analysis = await analyzeFn({
    price: price ? price.value : null,
    tweets: tweets ? tweets.value : null,
    news: news ? news.value : null,
  });

  const result = { ...analysis, generatedAt: now() };
  setCache(db, 'analysis', result);
  return result;
}

module.exports = { getAnalysis };
