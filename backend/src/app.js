const express = require('express');
const { requireAuth } = require('./auth');
const healthRoute = require('./routes/health');
const cacheRoute = require('./routes/cache');

function createApp({ db, config }) {
  const app = express();
  app.use(express.json());

  // Public
  app.use('/api/health', healthRoute());

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}

module.exports = { createApp };
