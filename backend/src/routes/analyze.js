const { Router } = require('express');
const { getAnalysis, getPreviousSignal } = require('../analysisService');
const { setCache } = require('../db');

module.exports = function analyzeRoute({ db, analyzeFn, ttlMs, notifier }) {
  const r = Router();

  r.post('/', async (req, res) => {
    if (!analyzeFn) return res.status(503).json({ error: 'analysis unavailable' });
    const force = !!(req.body && req.body.force === true);
    try {
      const result = await getAnalysis({ db, analyzeFn, ttlMs, force });

      // Signal change detection: check if signal changed to BUY or SELL
      if (notifier && result && result.recommendation) {
        const newSignal = result.recommendation;
        const previousSignal = getPreviousSignal(db);

        // Trigger notification if signal changed to BUY or SELL (async, non-blocking)
        if (previousSignal && previousSignal !== newSignal && ['BUY', 'SELL'].includes(newSignal)) {
          // Fire and forget - don't await, don't block response
          setImmediate(async () => {
            try {
              await notifier.send(result);
            } catch (notifyErr) {
              // Log but don't throw - notification failure shouldn't break the analyze endpoint
              console.error('Signal change notification failed:', notifyErr.message);
            }
          });
        }

        // Update previous signal for next comparison (always, even if no notification)
        // Store just the string, getCache will wrap it with { value: ... }
        setCache(db, 'lastSignal', newSignal);
      }

      return res.json(result);
    } catch (err) {
      console.error('analyze failed:', err.message);
      return res.status(502).json({ error: 'analysis failed' });
    }
  });

  return r;
};
