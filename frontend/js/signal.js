const WEIGHTS = { priceAction: 0.30, sentiment: 0.25, twitterBuzz: 0.25, fibonacci: 0.10, news: 0.10 };

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function priceActionScore(priceChange) {
  return clamp(50 + (priceChange || 0) * 3, 0, 100);
}

function sentimentScore(tweets) {
  if (!Array.isArray(tweets)) return 50;
  let bull = 0, bear = 0;
  for (const t of tweets) {
    if (t.sentiment === 'Bullish') bull++;
    else if (t.sentiment === 'Bearish') bear++;
  }
  return bull + bear === 0 ? 50 : (bull / (bull + bear)) * 100;
}

function twitterBuzzScore(tweets) {
  if (!Array.isArray(tweets) || tweets.length === 0) return 50;
  const volume = clamp(tweets.length * 8, 0, 100);
  const whales = tweets.filter((t) => t.sentiment === 'Whale').length;
  const whaleBonus = clamp((whales / tweets.length) * 100, 0, 100);
  return clamp(volume * 0.7 + whaleBonus * 0.3, 0, 100);
}

function fibonacciScore(price, fib) {
  if (!fib || !(fib.high > fib.low) || !(price > 0)) return 50;
  return clamp(((price - fib.low) / (fib.high - fib.low)) * 100, 0, 100);
}

function newsScore(news) {
  if (!Array.isArray(news)) return 50;
  let pos = 0, neg = 0;
  for (const n of news) {
    if (n.sentiment === 'positive') pos++;
    else if (n.sentiment === 'negative') neg++;
  }
  return pos + neg === 0 ? 50 : (pos / (pos + neg)) * 100;
}

function deriveComponents({ priceChange, price, tweets, news, fib } = {}) {
  return {
    priceAction: priceActionScore(priceChange),
    sentiment: sentimentScore(tweets),
    twitterBuzz: twitterBuzzScore(tweets),
    fibonacci: fibonacciScore(price, fib),
    news: newsScore(news),
  };
}

function computeSignal(components, weights = WEIGHTS) {
  const score = Math.round(
    components.priceAction * weights.priceAction +
    components.sentiment * weights.sentiment +
    components.twitterBuzz * weights.twitterBuzz +
    components.fibonacci * weights.fibonacci +
    components.news * weights.news
  );
  let recommendation = 'HOLD';
  if (score >= 62) recommendation = 'BUY';
  else if (score <= 37) recommendation = 'SELL';
  return { score, recommendation };
}

export { WEIGHTS, deriveComponents, computeSignal };
