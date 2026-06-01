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
  const router = Router();
  const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  const EXPIRY_SECONDS = 600; // 10 minutes

  // In-memory storage for auth codes: { userId: { code, expiresAt } }
  const authCodes = {};

  /**
   * POST /api/telegram/connect
   * Generates a unique auth code for Telegram connection
   * Requires JWT authentication
   */
  router.post('/connect', (req, res) => {
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

  // Export for testing purposes
  router.validateCode = function(userId, code) {
    const stored = authCodes[userId];
    if (!stored) return false;
    if (stored.code !== code) return false;
    if (Date.now() > stored.expiresAt) return false;
    return true;
  };

  router.invalidateCode = function(userId) {
    delete authCodes[userId];
  };

  return router;
};
