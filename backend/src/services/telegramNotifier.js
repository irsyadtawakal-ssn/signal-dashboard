/**
 * Telegram Notifier Service
 * Formats trading signals into Telegram-ready messages and sends them via Telegram Bot API
 */

const TelegramBot = require('node-telegram-bot-api');

/**
 * Formats a trading signal into a Telegram message
 * @param {Object} signal - The trading signal object
 * @param {string} signal.recommendation - BUY, SELL, or HOLD
 * @param {number} signal.confidence - Confidence score (0-1)
 * @param {string} signal.summary - Signal summary text
 * @param {Object} signal.components - Analysis components
 * @param {string} signal.components.priceAction - Price action analysis
 * @param {string} signal.components.sentiment - Sentiment analysis
 * @param {string} signal.components.twitterBuzz - Twitter activity
 * @param {string} signal.components.movingAverage - Moving average analysis
 * @param {string} signal.components.fibonacci - Fibonacci level analysis
 * @param {string} signal.generatedAt - ISO timestamp
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

  // Price Action (highlighted at the top)
  if (components && components.priceAction) {
    sections.push(''); // Empty line for separation
    sections.push(`*📊 PRICE ACTION*`);
    sections.push(`_${components.priceAction}_`);
  }

  // Summary
  if (summary) {
    sections.push('');
    sections.push(`Summary: ${summary}`);
  }

  // Components section (without priceAction since it's already at top)
  if (components) {
    sections.push(''); // Empty line before components
    sections.push('Analysis:');

    const componentKeys = ['sentiment', 'twitterBuzz', 'movingAverage', 'fibonacci'];

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
 * Sends a trading signal to Telegram via Bot API
 * @param {string|null} chatId - Telegram chat ID (returns early if null/undefined)
 * @param {Object} signal - The trading signal object (same format as formatMessage)
 * @param {Object} config - Configuration object
 * @param {string} config.botToken - Telegram Bot API token
 * @returns {Promise<Object>} Response object with success/skipped/error status
 *   - On success: { success: true, messageId: number }
 *   - On skip: { skipped: true, reason: 'no_chat_id' }
 *   - On error: { success: false, error: string }
 */
async function send(chatId, signal, config) {
  // Skip if no chat ID
  if (!chatId) {
    return {
      skipped: true,
      reason: 'no_chat_id',
    };
  }

  // Validate config has botToken
  if (!config || !config.botToken) {
    return {
      success: false,
      error: 'botToken is required in config',
    };
  }

  try {
    // Create bot instance
    const bot = new TelegramBot(config.botToken);

    // Format the message
    const message = formatMessage(signal);

    // Send the message
    const result = await bot.sendMessage(chatId, message);

    // Return success with message ID
    return {
      success: true,
      messageId: result.message_id,
    };
  } catch (error) {
    // Return error without throwing
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { formatMessage, send };
