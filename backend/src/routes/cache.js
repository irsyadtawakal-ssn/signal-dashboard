const { Router } = require('express');
const { getCache } = require('../db');

module.exports = function cacheRoute({ db }) {
  const r = Router();

  r.get('/price', (req, res) => {
    const hit = getCache(db, 'price');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });

  r.get('/news', (req, res) => {
    const hit = getCache(db, 'news');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });

  r.get('/tweets', (req, res) => {
    const hit = getCache(db, 'tweets');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });

  r.get('/signal', (req, res) => {
    const hit = getCache(db, 'technicalSignal');
    if (!hit) return res.status(503).json({ error: 'no signal yet' });
    return res.json(hit.value);
  });

  r.get('/signals/daily', (req, res) => {
    try {
      const signals = db.prepare(`
        SELECT signal, confidence, ma_50, ma_200, rsi_14, volume_ratio, reasoning, date
        FROM technical_signals_daily
        ORDER BY date DESC
        LIMIT 30
      `).all();
      return res.json(signals);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return r;
};
