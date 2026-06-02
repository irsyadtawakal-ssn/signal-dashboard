const { Router } = require('express');
const { getAnalysis, getPreviousSignal, getMaDirection } = require('../analysisService');
const { setCache, getCache } = require('../db');

module.exports = function analyzeRoute({ db, analyzeFn, ttlMs, notifier }) {
  const r = Router();

  r.post('/', async (req, res) => {
    if (!analyzeFn) return res.status(503).json({ error: 'analysis unavailable' });
    const force = !!(req.body && req.body.force === true);
    try {
      // Auto-create users row if doesn't exist
      const userId = req.user.id;
      const userEmail = req.user.email;
      const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!existingUser) {
        db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(userId, userEmail);
        console.log(`[Analyze] Created users row for ${userEmail} (${userId})`);
      }
      const result = await getAnalysis({ db, analyzeFn, ttlMs, force });

      if (notifier && result && result.recommendation && req.user && req.user.id) {
        const newSignal = result.recommendation;
        const previousSignal = getPreviousSignal(db);
        let notificationFired = false;

        // Trigger 1: signal changed to BUY or SELL (async, non-blocking)
        if (previousSignal && previousSignal !== newSignal && ['BUY', 'SELL'].includes(newSignal)) {
          notificationFired = true;
          setImmediate(async () => {
            try {
              await notifier.send(result, req.user.id);
            } catch (notifyErr) {
              console.error('Signal change notification failed:', notifyErr.message);
            }
          });
        }

        // Update previous signal for next comparison
        setCache(db, 'lastSignal', newSignal);

        // Trigger 2: MA direction crossed (above ↔ below), only if signal trigger didn't already fire
        if (!notificationFired && result.components) {
          const newMaDir = getMaDirection(result.components.movingAverage);
          const prevMaDirCache = getCache(db, 'lastMADirection');
          const prevMaDir = prevMaDirCache ? prevMaDirCache.value : null;

          if (newMaDir && prevMaDir && newMaDir !== prevMaDir) {
            setImmediate(async () => {
              try {
                await notifier.send(result, req.user.id);
              } catch (notifyErr) {
                console.error('MA crossover notification failed:', notifyErr.message);
              }
            });
          }

          if (newMaDir) {
            setCache(db, 'lastMADirection', newMaDir);
          }
        }
      }

      return res.json(result);
    } catch (err) {
      console.error('analyze failed:', err.message);
      return res.status(502).json({ error: 'analysis failed' });
    }
  });

  return r;
};
