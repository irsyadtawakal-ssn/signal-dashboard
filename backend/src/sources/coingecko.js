const { getJson } = require('../http');
const { toNum } = require('../util');

const URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

async function fetchMacro({ getJsonFn = getJson } = {}) {
  const data = await getJsonFn(URL, {});
  if (!data || !data.bitcoin || !data.ethereum) {
    throw new Error('CoinGecko response missing bitcoin/ethereum');
  }
  return {
    btc: toNum(data.bitcoin.usd),
    btcChange24h: toNum(data.bitcoin.usd_24h_change),
    eth: toNum(data.ethereum.usd),
    ethChange24h: toNum(data.ethereum.usd_24h_change),
  };
}

module.exports = { fetchMacro };
