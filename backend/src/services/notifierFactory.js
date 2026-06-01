/**
 * Factory to create a notifier object that can be used with the analyze route
 * This is a CommonJS wrapper around the ES module telegramNotifier
 */

const TelegramBot = require('node-telegram-bot-api');

/**
 * Formats a trading signal into a Telegram message
 * @param {Object} signal - The trading signal object
 * @returns {string} Formatted Telegram message
 */
function formatMessage(signal) {
  if (!signal) {
    throw new Error('Signal object is required');
  }

  const { recommendation, confidence, summary, components, generatedAt } = signal;

  // Map recommendations to emojis
  const emojiMap = {
    BUY: '🟢',
    SELL: '🔴',
    HOLD: '🟡',
  };

  const emoji = emojiMap[recommendation] || '⚪';
  const confidencePercent = Math.round(confidence * 100);

  // Parse timestamp and format it (YYYY-MM-DD HH:MM:SS UTC)
  const date = new Date(generatedAt);

  // Validate timestamp is valid
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${generatedAt}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;

  // Build message sections
  const sections = [];

  // Header with emoji and recommendation
  sections.push(`${emoji} ${recommendation}`);

  // Confidence
  sections.push(`Confidence: ${confidencePercent}%`);

  // Summary
  if (summary) {
    sections.push(`Summary: ${summary}`);
  }

  // Components section
  if (components) {
    sections.push(''); // Empty line before components
    sections.push('Analysis:');

    const componentKeys = ['priceAction', 'sentiment', 'twitterBuzz', 'movingAverage', 'fibonacci'];

    componentKeys.forEach((key) => {
      const value = components[key];
      if (value) {
        // Format key name: priceAction -> Price Action
        const displayKey = key.replace(/([A-Z])/g, ' $1').trim();
        const capitalizedKey = displayKey.charAt(0).toUpperCase() + displayKey.slice(1);
        sections.push(`• ${capitalizedKey}: ${value}`);
      }
    });
  }

  // Timestamp
  sections.push('');
  sections.push(`Generated: ${formattedTime}`);

  // Join all sections with newlines
  const message = sections
    .filter((section) => section !== null && section !== undefined)
    .join('\n');

  return message;
}

/**
 * Creates a notifier object for sending Telegram notifications
 * @param {Object} config - Configuration object with botToken
 * @returns {Object} Notifier object with send method
 */
function createNotifier(config) {
  if (!config || !config.botToken) {
    return null;
  }

  return {
    /**
     * Sends a trading signal notification
     * @param {Object} signal - The trading signal to send
     * @returns {Promise<Object>} Result with success/error status
     */
    async send(signal) {
      try {
        // For now, this is a placeholder that logs but doesn't send
        // When full Telegram integration is ready, implement actual sending
        console.log('[Notifier] Would send signal:', signal.recommendation);
        return { success: true, skipped: true, reason: 'telegram_not_yet_implemented' };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }
  };
}

module.exports = { createNotifier, formatMessage };
