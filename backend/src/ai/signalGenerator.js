const { calculateMA, calculateRSI, analyzeVolume, analyzeMacro } = require('./technicalAnalysis');

/**
 * Generate trading signal based on technical analysis
 * Combines 4 indicators (MA, RSI, Volume, Macro) into a single BUY/HOLD/SELL signal.
 * @param {object} data - Market data object
 * @param {number[]} data.prices - Array of historical prices (min 200 for MA200)
 * @param {number} data.currentPrice - Current OCT price in USD
 * @param {number} data.currentVolume - Current 24h volume
 * @param {number} data.avgVolume - Average 24h volume (from last 30 days)
 * @param {number} data.btcChange24h - BTC 24h change percentage
 * @param {number} data.ethChange24h - ETH 24h change percentage
 * @returns {object} Signal object
 * @returns {string} returns.signal - 'BUY', 'SELL', or 'HOLD'
 * @returns {number} returns.confidence - Confidence 0.0-0.95 (higher = more confident)
 * @returns {number} returns.score - Raw score (-3 to +3, used to determine signal)
 * @returns {object} returns.indicators - Technical indicators used in calculation
 * @returns {string} returns.reasoning - Multi-line explanation of factors
 * @returns {string} returns.timestamp - ISO timestamp of calculation
 */
async function generateSignal(data) {
  // Validate inputs
  if (!data || !Array.isArray(data.prices) || data.prices.length < 50) {
    throw new Error('Invalid input: prices must be an array of at least 50 elements for MA calculation');
  }
  if (typeof data.currentPrice !== 'number' || data.currentPrice <= 0) {
    throw new Error('Invalid input: currentPrice must be a positive number');
  }
  if (typeof data.currentVolume !== 'number' || data.currentVolume < 0) {
    throw new Error('Invalid input: currentVolume must be a non-negative number');
  }
  if (typeof data.avgVolume !== 'number' || data.avgVolume <= 0) {
    throw new Error('Invalid input: avgVolume must be a positive number');
  }
  if (typeof data.btcChange24h !== 'number' || typeof data.ethChange24h !== 'number') {
    throw new Error('Invalid input: btcChange24h and ethChange24h must be numbers');
  }

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
  reasoning.push(`${macroAnalysis.signal} (BTC: ${Number(btcChange24h).toFixed(2)}%, ETH: ${Number(ethChange24h).toFixed(2)}%)`);

  // Determine signal from score
  let signal, confidence;

  if (score >= 0.8) {
    signal = 'BUY';
    // Confidence: base 50% + score*20%, capped at 95%
    confidence = Math.min(0.95, 0.5 + score * 0.2);
  } else if (score <= -0.8) {
    signal = 'SELL';
    confidence = Math.min(0.95, 0.5 + Math.abs(score) * 0.2);
  } else {
    signal = 'HOLD';
    // HOLD confidence uses smaller multiplier (0.1 vs 0.2) for BUY/SELL
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
