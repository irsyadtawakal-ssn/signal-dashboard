const { getJson } = require('../http');

function deriveSentiment(votes = {}) {
  const positive = (votes.positive || 0) + (votes.liked || 0);
  const negative = (votes.negative || 0) + (votes.disliked || 0);
  if (positive > negative + 1) return 'positive';
  if (negative > positive + 1) return 'negative';
  return 'neutral';
}

async function fetchNews({ getJsonFn = getJson, token, limit = 10 }) {
  const url = token
    ? `https://cryptopanic.com/api/v1/posts/?auth_token=${token}&filter=hot&kind=news`
    : `https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news`;

  const data = await getJsonFn(url, {});
  const results = Array.isArray(data && data.results) ? data.results : [];

  return results.slice(0, limit).map((item) => ({
    title: item.title,
    url: item.url,
    source: (item.source && item.source.title) || 'CryptoPanic',
    publishedAt: item.published_at,
    sentiment: deriveSentiment(item.votes),
  }));
}

module.exports = { fetchNews };
