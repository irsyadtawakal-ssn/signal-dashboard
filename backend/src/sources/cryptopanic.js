const Parser = require('rss-parser');

const COINDESK_RSS = 'https://www.coindesk.com/arc/outboundfeeds/rss/';

async function fetchNews({ parserFn, limit = 10 } = {}) {
  const parser = parserFn ? parserFn() : new Parser();
  const feed = await parser.parseURL(COINDESK_RSS);
  const items = Array.isArray(feed.items) ? feed.items : [];

  return items.slice(0, limit).map((item) => ({
    title: item.title || '',
    url: item.link || null,
    source: 'CoinDesk',
    publishedAt: item.pubDate || item.isoDate || null,
    sentiment: 'neutral',
  }));
}

module.exports = { fetchNews };
