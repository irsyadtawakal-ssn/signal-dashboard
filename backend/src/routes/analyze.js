const { Router } = require('express');
const { getAnalysis } = require('../analysisService');

module.exports = function analyzeRoute({ db, analyzeFn, ttlMs }) {
  const r = Router();

  r.post('/', async (req, res) => {
    if (!analyzeFn) return res.status(503).json({ error: 'analysis unavailable' });
    const force = !!(req.body && req.body.force === true);
    try {
      const result = await getAnalysis({ db, analyzeFn, ttlMs, force });
      return res.json(result);
    } catch (err) {
      console.error('analyze failed:', err.message);
      return res.status(502).json({ error: 'analysis failed' });
    }
  });

  return r;
};
