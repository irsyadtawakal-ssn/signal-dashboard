const { getJson } = require('../http');
const { toNum } = require('../util');

async function fetchOctPrice({ getJsonFn = getJson, tokenAddress }) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const data = await getJsonFn(url, {});
  const pair = data && Array.isArray(data.pairs) ? data.pairs[0] : null;
  if (!pair) {
    throw new Error('DexScreener returned no pairs for token');
  }
  return {
    oct: toNum(pair.priceUsd),
    octChange24h: pair.priceChange ? toNum(pair.priceChange.h24) : null,
  };
}

module.exports = { fetchOctPrice };
