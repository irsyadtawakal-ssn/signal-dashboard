const { analyzeMarket } = require('./analysis');
const { generateSignal } = require('./signalGenerator');

/**
 * TwitterAnalysisStrategy - Uses AI to analyze market data (price, tweets, news)
 */
class TwitterAnalysisStrategy {
  constructor({ complete, model }) {
    this.complete = complete;
    this.model = model;
  }

  /**
   * Analyze market using Twitter sentiment and AI
   * @param {object} data - Market data object
   * @param {object} data.tweets - Tweet analysis results
   * @param {array} data.news - News feed items
   * @param {object} data.price - Price data (oct, change24h, volume24h)
   * @returns {Promise<object>} Analysis result with signal, confidence, reasoning
   */
  async analyze(data) {
    const {
      price,
      tweets,
      news
    } = data;

    // Call AI analysis
    const result = await analyzeMarket({
      price,
      tweets,
      news,
      complete: this.complete,
      model: this.model
    });

    return {
      signal: result.recommendation,
      confidence: result.confidence,
      recommendation: result.recommendation,
      components: result.components || {},
      reasoning: result.summary || ''
    };
  }

  getName() {
    return 'TWITTER';
  }
}

/**
 * TechnicalAnalysisStrategy - Uses technical indicators (MA, RSI, Volume, Macro)
 */
class TechnicalAnalysisStrategy {
  /**
   * Analyze market using technical indicators (MA, RSI, volume, macro)
   * @param {object} data - Market data object
   * @param {array} data.priceHistory - Array of price history objects ({oct_price, date})
   * @param {object} data.price - Current price data ({oct, change24h, volume24h})
   * @param {object} data.macro - Macro data ({btc: {change24h}, eth: {change24h}})
   * @param {object} data.volume - Volume data ({current, avg})
   * @returns {Promise<object>} Analysis result with signal, confidence, reasoning
   */
  async analyze(data) {
    // Validate inputs
    if (!data || !Array.isArray(data.priceHistory) || data.priceHistory.length < 50) {
      throw new Error('TechnicalAnalysis: Invalid input - priceHistory must be array of at least 50 prices');
    }
    if (!data.price || typeof data.price.oct !== 'number') {
      throw new Error('TechnicalAnalysis: Invalid input - price.oct must be a number');
    }
    if (!data.macro || typeof data.macro.btc?.change24h !== 'number' || typeof data.macro.eth?.change24h !== 'number') {
      throw new Error('TechnicalAnalysis: Invalid input - macro.btc.change24h and macro.eth.change24h must be numbers');
    }
    if (!data.volume || typeof data.volume.current !== 'number' || typeof data.volume.avg !== 'number') {
      throw new Error('TechnicalAnalysis: Invalid input - volume.current and volume.avg must be numbers');
    }

    const {
      priceHistory,
      price,
      macro,
      volume
    } = data;

    // Extract prices for MA/RSI calculation
    const prices = priceHistory.map(p => p.oct_price);

    // Call signal generator
    const result = await generateSignal({
      prices,
      currentPrice: price.oct,
      currentVolume: volume.current,
      avgVolume: volume.avg,
      btcChange24h: macro.btc.change24h,
      ethChange24h: macro.eth.change24h
    });

    return {
      signal: result.signal,
      confidence: result.confidence,
      recommendation: result.signal,
      components: {
        technical: result
      },
      reasoning: result.reasoning
    };
  }

  getName() {
    return 'TECHNICAL';
  }
}

/**
 * AnalysisFactory - Creates strategy instances
 */
class AnalysisFactory {
  static create(type, options = {}) {
    switch (type.toLowerCase()) {
      case 'twitter':
        return new TwitterAnalysisStrategy({
          complete: options.complete,
          model: options.model
        });
      case 'technical':
        return new TechnicalAnalysisStrategy();
      default:
        throw new Error(`Unknown analysis strategy: ${type}`);
    }
  }
}

module.exports = { AnalysisFactory, TwitterAnalysisStrategy, TechnicalAnalysisStrategy };
