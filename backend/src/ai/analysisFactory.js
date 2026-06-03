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
  async analyze(data) {
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
