const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./auth');
const healthRoute = require('./routes/health');
const cacheRoute = require('./routes/cache');
const signalsRoute = require('./routes/signals');
const analyzeRoute = require('./routes/analyze');
const adminRoute = require('./routes/admin');
const telegramRoute = require('./routes/telegram');

function createApp({ db, config, analyzeFn, notifier }) {
  const app = express();
  app.disable('etag');
  app.use(cors(config.corsOrigin ? { origin: config.corsOrigin } : {}));
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'unload=*');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Public
  app.use('/api/health', healthRoute());
  app.use('/api/signals', signalsRoute({ db }));

  // Get both public and protected telegram routes
  const { publicRouter, protectedRouter } = telegramRoute({ db, config });
  app.use('/api/telegram', publicRouter);

  // Protected — everything below requires a valid Supabase JWT
  app.use('/api/analyze', requireAuth(config), analyzeRoute({ db, analyzeFn, ttlMs: config.analysisTtlMs, notifier }));
  app.use('/api/admin', requireAuth(config), adminRoute({ config }));
  app.use('/api/telegram', requireAuth(config), protectedRouter);
  app.use('/api', requireAuth(config), cacheRoute({ db }));

  return app;
}

module.exports = { createApp };
