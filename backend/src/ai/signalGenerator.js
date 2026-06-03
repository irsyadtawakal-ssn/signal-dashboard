const { calculateMA, calculateRSI, analyzeVolume, analyzeMacro } = require('./technicalAnalysis');

/**
 * Generate trading signal based on technical analysis
 * @param {object} data - { prices, currentPrice, currentVolume, avgVolume, btcChange24h, ethChange24h }
 * @returns {object} - { signal, confidence, score, indicators, reasoning }
 */
async function generateSignal(data) {
  const { prices, currentPrice, currentVolume, avgVolume, btcChange24h, ethChange24h } = data;

  // Calculate all indicators
  const ma50 = calculateMA(prices, 50);
  const ma200 = calculateMA(prices, 200);
  const rsi = calculateRSI(prices, 14);
  const volumeAnalysis = analyzeVolume(currentVolume, avgVolume);
  const macroAnalysis = analyzeMacro(btcChange24h, ethChange24h);

  // Score all factors (exact spec formula)
  let score = 0;
  const reasoning = [];

  // 1. MA Trend (+1/-1)
  if (currentPrice > ma50 && ma50 > ma200) {
    score += 1;
    reasoning.push('✓ Price above MA50 & MA50 above MA200 (Uptrend)');
  } else if (currentPrice < ma50 && ma50 < ma200) {
    score -= 1;
    reasoning.push('✗ Price below MA50 & MA50 below MA200 (Downtrend)');
  } else {
    reasoning.push('⊙ Price consolidating near MA');
  }

  // 2. RSI Signal (+0.5/-0.5)
  if (rsi && rsi < 30) {
    score += 0.5;
    reasoning.push('✓ RSI < 30 (Oversold, buy opportunity)');
  } else if (rsi && rsi > 70) {
    score -= 0.5;
    reasoning.push('✗ RSI > 70 (Overbought, sell pressure)');
  } else {
    reasoning.push('⊙ RSI neutral (30-70)');
  }

  // 3. Volume Signal (multiply analysis score by 0.5, max ±0.5)
  score += volumeAnalysis.score * 0.5;
  reasoning.push(`${volumeAnalysis.signal} (ratio: ${(currentVolume / avgVolume).toFixed(2)}x)`);

  // 4. Macro Signal (multiply analysis score by 0.5, max ±0.5)
  score += macroAnalysis.score * 0.5;
  reasoning.push(`${macroAnalysis.signal} (BTC: ${btcChange24h}%, ETH: ${ethChange24h}%)`);

  // Determine signal from score (thresholds adjusted for spec max 2.5)
  let signal, confidence;

  if (score >= 0.8) {
    signal = 'BUY';
    confidence = Math.min(0.95, 0.5 + score * 0.2);
  } else if (score <= -0.8) {
    signal = 'SELL';
    confidence = Math.min(0.95, 0.5 + Math.abs(score) * 0.2);
  } else {
    signal = 'HOLD';
    confidence = 0.5 + Math.abs(score) * 0.1;
  }

  return {
    signal,
    confidence: Math.round(confidence * 100) / 100,
    score: Math.round(score * 100) / 100,
    indicators: {
      ma50: ma50 ? Math.round(ma50 * 1000000) / 1000000 : null,
      ma200: ma200 ? Math.round(ma200 * 1000000) / 1000000 : null,
      rsi: rsi ? Math.round(rsi * 100) / 100 : null,
      currentPrice: Math.round(currentPrice * 1000000) / 1000000,
      volumeRatio: Math.round((currentVolume / avgVolume) * 100) / 100
    },
    reasoning: reasoning.join('\n'),
    timestamp: new Date().toISOString()
  };
}

module.exports = { generateSignal };
