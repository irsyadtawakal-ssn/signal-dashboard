require('dotenv').config();
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

try {
  const config = loadConfig();
  const db = createDb(config.dbPath);
  const app = createApp({ db, config });
  app.listen(config.port, () => {
    console.log(`Signal Dashboard backend listening on :${config.port}`);
  });
} catch (err) {
  console.error('Failed to start backend:', err.message);
  process.exit(1);
}
