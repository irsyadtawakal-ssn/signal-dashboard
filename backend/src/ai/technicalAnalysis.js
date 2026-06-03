/**
 * Technical Analysis Engine
 * Pure math calculations (no AI calls)
 */

// Volume thresholds for signal classification
const VOLUME_HIGH_THRESHOLD = 1.5;      // High volume: > 1.5x average
const VOLUME_ABOVE_THRESHOLD = 1.0;     // Above average: > 1.0x but <= 1.5x
const VOLUME_BELOW_THRESHOLD = 0.5;     // Below average: > 0.5x but <= 1.0x
// Below 0.5x is LOW_VOLUME

// Macro trend threshold
const MACRO_STRONG_THRESHOLD = 2;       // Strong signal: > ±2% price change

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
 * NOTE: This uses a simple average of gains/losses, not Wilder's smoothed moving average.
 * Acceptable for directional signals (overbought/oversold) but will diverge from
 * industry-standard RSI values. See TECHNICAL_ANALYSIS.md for details.
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

  // Handle division by zero (all prices are flat or no variance)
  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50; // 50 = neutral/flat, 100 = only gains
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
  if (!averageVolume || averageVolume === 0 || currentVolume == null) {
    return { signal: 'NORMAL', score: 0 };
  }

  const ratio = currentVolume / averageVolume;

  if (ratio > VOLUME_HIGH_THRESHOLD) {
    return { signal: 'HIGH_VOLUME', score: 1 };
  } else if (ratio > VOLUME_ABOVE_THRESHOLD) {
    return { signal: 'ABOVE_AVERAGE', score: 0.5 };
  } else if (ratio > VOLUME_BELOW_THRESHOLD) {
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
  if (btcChange24h > MACRO_STRONG_THRESHOLD && ethChange24h > MACRO_STRONG_THRESHOLD) {
    return { signal: 'STRONG_BULL', score: 1 };
  }
  if (btcChange24h > 0 && ethChange24h > 0) {
    return { signal: 'MILD_BULL', score: 0.5 };
  }

  // Both negative = bear market
  if (btcChange24h < -MACRO_STRONG_THRESHOLD && ethChange24h < -MACRO_STRONG_THRESHOLD) {
    return { signal: 'STRONG_BEAR', score: -1 };
  }
  if (btcChange24h < 0 && ethChange24h < 0) {
    return { signal: 'MILD_BEAR', score: -0.5 };
  }

  // Mixed or neutral
  return { signal: 'MIXED', score: 0 };
}

module.exports = { calculateMA, calculateRSI, analyzeVolume, analyzeMacro };
