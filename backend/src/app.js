const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./auth');
const healthRoute = require('./routes/health');
const cacheRoute = require('./routes/cache');
const analyzeRoute = require('./routes/analyze');
const adminRoute = require('./routes/admin');

function createApp({ db, config, analyzeFn }) {
  const app = express();
  app.use(cors(config.corsOrigin ? { origin: config.corsOrigin } : {}));
  app.use(express.json());

  // Public
  app.use('/api/health', healthRoute());

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api/analyze', requireAuth(config), analyzeRoute({ db, analyzeFn, ttlMs: config.analysisTtlMs }));
  app.use('/api/admin', requireAuth(config), adminRoute({ config }));
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}

module.exports = { createApp };
