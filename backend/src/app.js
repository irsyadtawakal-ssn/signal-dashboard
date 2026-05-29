const express = require('express');
const { requireAuth } = require('./auth');
const healthRoute = require('./routes/health');
const cacheRoute = require('./routes/cache');
const analyzeRoute = require('./routes/analyze');

function createApp({ db, config, analyzeFn }) {
  const app = express();
  app.use(express.json());

  // Public
  app.use('/api/health', healthRoute());

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api/analyze', requireAuth(config), analyzeRoute({ db, analyzeFn, ttlMs: config.analysisTtlMs }));
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}

module.exports = { createApp };
