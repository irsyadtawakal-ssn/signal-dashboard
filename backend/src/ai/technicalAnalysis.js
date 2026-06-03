/**
 * Technical Analysis Engine
 * Pure math calculations (no AI calls)
 */

/**
 * Calculate Simple Moving Average
 * @param {number[]} prices - Array of prices
 * @param {number} period - MA period (50, 200, etc)
 * @returns {number|null} - MA value or null if insufficient data
 */
function calculateMA(prices, period) {
  if (!prices || prices.length < period) {
    return null;
  }

  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Calculate Relative Strength Index (14-period default)
 * RSI > 70 = overbought, RSI < 30 = oversold
 * @param {number[]} prices - Array of prices
 * @param {number} period - RSI period (default 14)
 * @returns {number|null} - RSI value (0-100) or null if insufficient data
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  // Calculate gains and losses
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  // Calculate averages
  const avgGain = gains / period;
  const avgLoss = losses / period;

  // Handle division by zero
  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50;
  }

  // Calculate RS and RSI
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100; // Round to 2 decimals
}

/**
 * Analyze volume strength
 * @param {number} currentVolume - Current 24h volume
 * @param {number} averageVolume - Average 24h volume
 * @returns {object} - { signal: string, score: number }
 */
function analyzeVolume(currentVolume, averageVolume) {
  if (!averageVolume || averageVolume === 0) {
    return { signal: 'NORMAL', score: 0 };
  }

  const ratio = currentVolume / averageVolume;

  if (ratio > 1.5) {
    return { signal: 'HIGH_VOLUME', score: 1 };
  } else if (ratio > 1.0) {
    return { signal: 'ABOVE_AVERAGE', score: 0.5 };
  } else if (ratio > 0.5) {
    return { signal: 'BELOW_AVERAGE', score: -0.5 };
  } else {
    return { signal: 'LOW_VOLUME', score: -1 };
  }
}

/**
 * Analyze macro trend (BTC/ETH context)
 * @param {number} btcChange24h - BTC 24h change percentage
 * @param {number} ethChange24h - ETH 24h change percentage
 * @returns {object} - { signal: string, score: number }
 */
function analyzeMacro(btcChange24h, ethChange24h) {
  // Both positive = bull market
  if (btcChange24h > 2 && ethChange24h > 2) {
    return { signal: 'STRONG_BULL', score: 1 };
  }
  if (btcChange24h > 0 && ethChange24h > 0) {
    return { signal: 'MILD_BULL', score: 0.5 };
  }

  // Both negative = bear market
  if (btcChange24h < -2 && ethChange24h < -2) {
    return { signal: 'STRONG_BEAR', score: -1 };
  }
  if (btcChange24h < 0 && ethChange24h < 0) {
    return { signal: 'MILD_BEAR', score: -0.5 };
  }

  // Mixed or neutral
  return { signal: 'MIXED', score: 0 };
}

export { calculateMA, calculateRSI, analyzeVolume, analyzeMacro };
