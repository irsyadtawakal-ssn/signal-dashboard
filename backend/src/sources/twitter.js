const { getJson } = require('../http');

const DEFAULT_BASE = 'https://api.twitterapi.io/twitter/tweet/advanced_search';

function normalizeTweet(t) {
  return {
    id: String(t.id),
    text: t.text || '',
    author: (t.author && t.author.userName) || 'unknown',
    url: t.url || null,
    createdAt: t.createdAt || null,
  };
}

async function fetchTweets({ getJsonFn = getJson, token, keywords = [], limit = 20, baseUrl = DEFAULT_BASE, sinceTime = null }) {
  console.log(`[TwitterAPI] CALL at ${new Date().toISOString()} | sinceTime: ${sinceTime}`);
  const query = encodeURIComponent(keywords.join(' OR '));
  let url = `${baseUrl}?query=${query}&queryType=Latest`;
  if (sinceTime) url += `&start_time=${encodeURIComponent(sinceTime)}`;
  const headers = token ? { 'X-API-Key': token } : {};

  const data = await getJsonFn(url, { headers });
  const items = Array.isArray(data.tweets)
    ? data.tweets
    : Array.isArray(data)
      ? data
      : Array.isArray(data && data.results)
        ? data.results
        : [];

  return items.slice(0, limit).map(normalizeTweet);
}

module.exports = { fetchTweets };
