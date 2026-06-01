const { Router } = require('express');

/**
 * Generate a random 6-character alphanumeric code
 * @returns {string} Code matching /^[A-Z0-9]{6}$/
 */
function generateAuthCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = function telegramRoute({ db, config }) {
  const protectedRouter = Router();
  const publicRouter = Router();
  const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  const EXPIRY_SECONDS = 600; // 10 minutes

  // In-memory storage for auth codes: { userId: { code, expiresAt } }
  const authCodes = {};

  /**
   * POST /api/telegram/connect
   * Generates a unique auth code for Telegram connection
   * Requires JWT authentication
   */
  protectedRouter.post('/connect', (req, res) => {
    // req.user is set by requireAuth middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const userId = req.user.id;
    const code = generateAuthCode();
    const now = Date.now();
    const expiresAt = now + EXPIRY_MS;

    // Invalidate previous code for this user
    delete authCodes[userId];

    // Store new code
    authCodes[userId] = {
      code,
      expiresAt,
    };

    // Return response
    res.json({
      code,
      botName: config.telegramBotName || 'SignalDashboardBot',
      expiresIn: EXPIRY_SECONDS,
      expiresAt,
    });
  });

  /**
   * POST /api/telegram/verify/:code
   * Verifies an auth code and saves the Telegram chatId
   * Called by the Telegram bot (no JWT required)
   */
  publicRouter.post('/verify/:code', (req, res) => {
    const { code } = req.params;
    const { chatId } = req.body;

    // Validate required fields
    if (!chatId) {
      return res.status(400).json({ error: 'missing_chat_id' });
    }

    // Validate code format (6 alphanumeric characters)
    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: 'invalid_code' });
    }

    // Find the user who has this code
    let userId = null;
    for (const [uid, codeData] of Object.entries(authCodes)) {
      if (codeData.code === code) {
        userId = uid;
        break;
      }
    }

    // Code not found
    if (!userId) {
      return res.status(400).json({ error: 'invalid_code' });
    }

    const codeData = authCodes[userId];

    // Check if code has expired
    if (Date.now() > codeData.expiresAt) {
      delete authCodes[userId];
      return res.status(400).json({ error: 'code_expired' });
    }

    // Check if chatId is already connected to a different user
    const existingUser = db.prepare(
      'SELECT id FROM users WHERE telegramChatId = ?'
    ).get(chatId);

    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: 'chat_id_in_use' });
    }

    // Update the user with the chatId
    try {
      db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run(
        chatId,
        userId
      );

      // Delete the used code
      delete authCodes[userId];

      // Return success
      res.json({
        success: true,
        message: 'Telegram connection verified successfully',
      });
    } catch (error) {
      console.error('Error updating telegram chatId:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // Export for testing purposes
  protectedRouter.validateCode = function(userId, code) {
    const stored = authCodes[userId];
    if (!stored) return false;
    if (stored.code !== code) return false;
    if (Date.now() > stored.expiresAt) return false;
    return true;
  };

  protectedRouter.invalidateCode = function(userId) {
    delete authCodes[userId];
  };

  // Combine both routers
  const combinedRouter = Router();
  combinedRouter.use(publicRouter);
  combinedRouter.use(protectedRouter);

  // Export both routers for app.js
  combinedRouter.publicRouter = publicRouter;
  combinedRouter.protectedRouter = protectedRouter;

  return { publicRouter, protectedRouter };
};
