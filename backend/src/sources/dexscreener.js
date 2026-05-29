const { getJson } = require('../http');

async function fetchOctPrice({ getJsonFn = getJson, tokenAddress }) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const data = await getJsonFn(url, {});
  const pair = data && Array.isArray(data.pairs) ? data.pairs[0] : null;
  if (!pair) {
    throw new Error('DexScreener returned no pairs for token');
  }
  return {
    oct: Number(pair.priceUsd),
    octChange24h: pair.priceChange ? Number(pair.priceChange.h24) : null,
  };
}

module.exports = { fetchOctPrice };
