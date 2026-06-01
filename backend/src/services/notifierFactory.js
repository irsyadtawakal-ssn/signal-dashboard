/**
 * Factory to create a notifier object that can be used with the analyze route
 * This is a CommonJS wrapper around the ES module telegramNotifier
 */

/**
 * Creates a notifier object for sending Telegram notifications
 * @param {Object} config - Configuration object with botToken
 * @param {Object} db - Database instance for querying users and storing failed notifications
 * @returns {Object} Notifier object with send method
 */
function createNotifier(config, db) {
  if (!config || !config.botToken || !db) {
    return null;
  }

  return {
    /**
     * Sends a trading signal notification to a user via Telegram
     * @param {Object} signal - The trading signal to send
     * @param {string} userId - The user ID to send the notification to
     * @returns {Promise<Object>} Result with success/error status
     *   - On success: { success: true, messageId: number }
     *   - On skip (no chat ID): { skipped: true, reason: 'no_chat_id' }
     *   - On error with retry: { success: false, error: string, stored_for_retry: true }
     *   - On other error: { success: false, error: string }
     */
    async send(signal, userId) {
      try {
        // 1. Query database to get the user's Telegram chat ID
        const userRow = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get(userId);

        if (!userRow || !userRow.telegramChatId) {
          return {
            skipped: true,
            reason: 'no_chat_id',
          };
        }

        const chatId = userRow.telegramChatId;

        // 2. Dynamically import telegramNotifier (ES module) for sending
        const telegramNotifier = await import('./telegramNotifier.js');

        // 3. Call actual telegramNotifier.send() with the chat ID, signal, and config
        const result = await telegramNotifier.send(chatId, signal, config);

        // 4. Handle the result from telegramNotifier
        if (result.success) {
          // Send succeeded
          return {
            success: true,
            messageId: result.messageId,
          };
        } else {
          // Send failed - store for retry
          const nextRetryAt = new Date(Date.now() + 60_000); // 1 minute from now
          db.prepare(`
            INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(userId, JSON.stringify(signal), result.error, 0, nextRetryAt.toISOString());

          return {
            success: false,
            error: result.error,
            stored_for_retry: true,
          };
        }
      } catch (error) {
        // Unexpected error - store for retry if possible
        try {
          const nextRetryAt = new Date(Date.now() + 60_000); // 1 minute from now
          db.prepare(`
            INSERT INTO failed_notifications (userId, signal, errorMessage, retryCount, nextRetryAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(userId, JSON.stringify(signal), error.message, 0, nextRetryAt.toISOString());

          return {
            success: false,
            error: error.message,
            stored_for_retry: true,
          };
        } catch (dbError) {
          // Even retry storage failed - return error
          return {
            success: false,
            error: error.message,
          };
        }
      }
    }
  };
}

module.exports = { createNotifier };
