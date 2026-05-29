const { Router } = require('express');
const { getCache } = require('../db');

module.exports = function cacheRoute({ db }) {
  const r = Router();

  r.get('/price', (req, res) => {
    const hit = getCache(db, 'price');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });

  return r;
};
