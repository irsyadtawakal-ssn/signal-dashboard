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

  // Score all factors
  let score = 0;
  const reasoning = [];

  // Determine trend direction first
  const isUptrend = currentPrice > ma50 && ma50 > ma200;
  const isDowntrend = currentPrice < ma50 && ma50 < ma200;

  // 1. MA Trend (+1/-1)
  if (isUptrend) {
    score += 1;
    reasoning.push('✓ Price above MA50 & MA50 above MA200 (Uptrend)');
  } else if (isDowntrend) {
    score -= 1;
    reasoning.push('✗ Price below MA50 & MA50 below MA200 (Downtrend)');
  } else {
    reasoning.push('⊙ Price consolidating near MA');
  }

  // 2. RSI Signal - scaled based on trend direction
  if (rsi < 30) {
    // Oversold: strong buy if downtrend, moderate if uptrend
    const rsiScore = isDowntrend ? 0.5 : (isUptrend ? 0.2 : 0.35);
    score += rsiScore;
    reasoning.push('✓ RSI < 30 (Oversold, buy opportunity)');
  } else if (rsi > 70) {
    // Overbought: strong sell if uptrend, moderate if downtrend
    const rsiScore = isUptrend ? 0.3 : (isDowntrend ? 0.5 : 0.2);
    score -= rsiScore;
    reasoning.push('✗ RSI > 70 (Overbought, sell pressure)');
  } else {
    reasoning.push('⊙ RSI neutral (30-70)');
  }

  // 3. Volume Signal - sign follows the trend, magnitude amplified
  const volumeScore = volumeAnalysis.score;
  let volumeContribution;
  if (isUptrend) {
    // In uptrend, positive volume is bullish
    volumeContribution = volumeScore > 0 ? volumeScore * 1.2 : volumeScore * 0.5;
  } else if (isDowntrend) {
    // In downtrend, positive volume (selling) is bearish
    volumeContribution = volumeScore > 0 ? -volumeScore * 1.2 : volumeScore * 0.5;
  } else {
    volumeContribution = volumeScore;
  }
  score += volumeContribution;
  reasoning.push(`${volumeAnalysis.signal} (ratio: ${(currentVolume / avgVolume).toFixed(2)}x)`);

  // 4. Macro Signal - sign follows trend alignment
  const macroScore = macroAnalysis.score;
  let macroContribution;
  if (isUptrend && macroScore > 0) {
    macroContribution = macroScore * 1.2; // Bullish macro + uptrend
  } else if (isDowntrend && macroScore < 0) {
    macroContribution = macroScore * 1.2; // Bearish macro + downtrend
  } else {
    macroContribution = macroScore * 0.5; // Conflicting signals
  }
  score += macroContribution;
  reasoning.push(`${macroAnalysis.signal} (BTC: ${btcChange24h}%, ETH: ${ethChange24h}%)`);

  // Determine signal from score
  let signal, confidence;

  if (score >= 2) {
    signal = 'BUY';
    confidence = Math.min(0.95, 0.5 + score * 0.15);
  } else if (score <= -2) {
    signal = 'SELL';
    confidence = Math.min(0.95, 0.5 + Math.abs(score) * 0.15);
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
