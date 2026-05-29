const { getJson } = require('../http');

// Placeholder Apify-style dataset endpoint. Confirm the exact provider URL/fields
// when wiring a real Apify/Xpoz key (see CryptoPanic note in Phase 2b — do not chase
// a live 200 here; the normalization is what these tests pin down).
const DEFAULT_BASE = 'https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items';

function normalizeTweet(t) {
  return {
    id: String(t.id),
    text: t.text || '',
    author: (t.author && t.author.userName) || 'unknown',
    url: t.url || null,
    createdAt: t.createdAt || null,
  };
}

async function fetchTweets({ getJsonFn = getJson, token, keywords = [], limit = 20, baseUrl = DEFAULT_BASE }) {
  const terms = encodeURIComponent(keywords.join(' OR '));
  const url = token
    ? `${baseUrl}?token=${token}&searchTerms=${terms}`
    : `${baseUrl}?searchTerms=${terms}`;

  const data = await getJsonFn(url, {});
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data && data.results)
      ? data.results
      : [];

  return items.slice(0, limit).map(normalizeTweet);
}

module.exports = { fetchTweets };
