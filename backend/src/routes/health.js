const { Router } = require('express');

module.exports = function healthRoute() {
  const r = Router();
  r.get('/', (req, res) => res.json({ status: 'ok' }));
  return r;
};
