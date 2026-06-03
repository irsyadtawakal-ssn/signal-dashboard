const { Router } = require('express');
const { getCache } = require('../db');

module.exports = function signalsRoute({ db }) {
  const r = Router();

  r.get('/current', (req, res) => {
    const hit = getCache(db, 'technicalSignal');
    if (!hit) return res.status(503).json({ error: 'no signal yet' });
    return res.json(hit.value);
  });

  r.get('/daily', (req, res) => {
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

  r.get('/10min', (req, res) => {
    try {
      const signals = db.prepare(`
        SELECT signal, confidence, score, ma_50, ma_200, rsi_14, volume_ratio, created_at
        FROM technical_signals_10min
        ORDER BY created_at DESC
        LIMIT 100
      `).all();
      return res.json(signals);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return r;
};
