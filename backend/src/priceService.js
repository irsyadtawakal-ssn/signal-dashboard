async function buildPrice({ dexFn, macroFn }) {
  const [dexResult, macroResult] = await Promise.allSettled([dexFn(), macroFn()]);

  const dex = dexResult.status === 'fulfilled'
    ? dexResult.value
    : { oct: null, octChange24h: null };
  const macro = macroResult.status === 'fulfilled'
    ? macroResult.value
    : { btc: null, btcChange24h: null, eth: null, ethChange24h: null };

  return { ...dex, ...macro, fetchedAt: Date.now() };
}

module.exports = { buildPrice };
