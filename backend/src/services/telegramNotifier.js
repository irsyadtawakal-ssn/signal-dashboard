/**
 * Telegram notifier service
 * Formats trading signals into Telegram-ready messages and sends them via Telegram Bot API
 */

const https = require('https');

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';

// Shared HTTPS helper to avoid duplication
function sendHttpsRequest(hostname, path, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Creates a notifier that sends Telegram messages
 * @param {Object} config - Config with botToken
 * @param {Object} db - Database connection
 * @returns {Object} Notifier with send() method
 */
function createNotifier(config, db) {
  if (!config.botToken) {
    throw new Error('botToken is required in config');
  }

  const botToken = config.botToken;

  /**
   * Formats technical signals for Telegram
   */
  function formatTechnicalMessage(signal) {
    const emojiMap = { BUY: '🟢', SELL: '🔴', HOLD: '🟡' };
    const emoji = emojiMap[signal.signal] || '⚪';
    const confidencePercent = Math.round(signal.confidence * 100);

    const lines = [
      `${emoji} *TECHNICAL SIGNAL: ${signal.signal}*`,
      `Confidence: ${confidencePercent}%`,
      ``,
      `*Indicators:*`,
      `• MA50: $${signal.indicators.ma50.toFixed(6)}`,
      `• MA200: $${signal.indicators.ma200.toFixed(6)}`,
      `• RSI(14): ${signal.indicators.rsi.toFixed(2)}`,
      `• Volume Ratio: ${signal.indicators.volumeRatio.toFixed(2)}x`,
      ``,
      `*Analysis:*`,
      signal.reasoning,
    ];

    return lines.join('\n');
  }

  /**
   * Formats sentiment signals for Telegram (legacy format)
   */
  function formatSentimentMessage(signal) {
    const { recommendation, confidence, summary, components, generatedAt } = signal;
    const emojiMap = { BUY: '🟢', SELL: '🔴', HOLD: '🟡' };
    const emoji = emojiMap[recommendation] || '⚪';
    const confidencePercent = Math.round(confidence * 100);

    const sections = [
      `${emoji} ${recommendation}`,
      `Confidence: ${confidencePercent}%`,
    ];

    if (components && components.priceAction) {
      sections.push('');
      sections.push(`*UPDATED PRICE*`);
      sections.push(extractPriceInfo(components.priceAction));
    }

    if (summary) {
      sections.push('');
      sections.push(`Summary: ${summary}`);
    }

    if (components) {
      sections.push('');
      sections.push('Analysis:');
      const componentKeys = ['sentiment', 'twitterBuzz', 'movingAverage', 'fibonacci'];
      componentKeys.forEach((key) => {
        const value = components[key];
        if (value) {
          const displayKey = key.replace(/([A-Z])/g, ' $1').trim();
          const capitalizedKey = displayKey.charAt(0).toUpperCase() + displayKey.slice(1);
          sections.push(`• ${capitalizedKey}: ${value}`);
        }
      });
    }

    const date = new Date(generatedAt);
    if (!isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
      sections.push('');
      sections.push(`Generated: ${formattedTime}`);
    }

    return sections.filter((s) => s !== null && s !== undefined).join('\n');
  }

  /**
   * Route to appropriate formatter based on signal type
   */
  function formatMessage(signal) {
    if (!signal) throw new Error('Signal object is required');

    // Technical signal format
    if (signal.strategy === 'TECHNICAL' || signal.indicators) {
      return formatTechnicalMessage(signal);
    }

    // Legacy sentiment format
    return formatSentimentMessage(signal);
  }

  function extractPriceInfo(priceAction) {
    if (!priceAction) return '';
    const match = priceAction.match(/\$?([\d.]+)\s*\(24H:\s*([^)]+)\)/);
    return match ? `$${match[1]} (24H: ${match[2]})` : priceAction;
  }

  /**
   * Sends a message to all users subscribed to signal notifications
   */
  async function send(signal, userId) {
    if (!signal) throw new Error('Signal is required');

    try {
      const message = formatMessage(signal);

      // Get user's Telegram chat ID
      const user = userId ? db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get(userId) : null;
      const chatId = user?.telegramChatId;

      if (!chatId) {
        console.error(`[Telegram] No chat ID found for user ${userId || 'unknown'}`);
        return { success: false, error: 'no_chat_id' };
      }

      // Send via Telegram API using shared helper
      const postData = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      try {
        const response = await sendHttpsRequest(
          'api.telegram.org',
          `/bot${botToken}/sendMessage`,
          postData
        );

        if (response.ok) {
          console.log(`[Telegram] Message sent to ${chatId}`);
          return { success: true };
        } else {
          console.error(`[Telegram] API error: ${response.description}`);
          return { success: false, error: response.description };
        }
      } catch (err) {
        console.error('[Telegram] HTTP error:', err.message);
        throw err;
      }
    } catch (err) {
      console.error('[Telegram] Send failed:', err.message);
      throw err;
    }
  }

  return { send, formatMessage };
}

module.exports = { createNotifier };
