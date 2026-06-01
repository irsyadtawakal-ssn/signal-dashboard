const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Initialize Telegram schema (users table and failed_notifications table)
  initializeTelegramSchema(db);

  return db;
}

function setCache(db, key, value) {
  db.prepare(`
    INSERT INTO cache (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), Date.now());
}

function getCache(db, key) {
  const row = db.prepare('SELECT value, updated_at FROM cache WHERE key = ?').get(key);
  if (!row) return null;
  return { value: JSON.parse(row.value), updatedAt: row.updated_at };
}

/**
 * Add telegramChatId column to users table
 * Gracefully handles if the column already exists
 * Note: SQLite doesn't support UNIQUE constraints via ALTER TABLE,
 * so we add it without UNIQUE and rely on application logic for uniqueness
 */
function addTelegramChatIdColumn(db) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN telegramChatId TEXT;`);
    console.log('✓ Added telegramChatId column to users table');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('✓ telegramChatId column already exists');
    } else {
      throw e;
    }
  }
}

/**
 * Create failed_notifications table for retry logic
 * Gracefully handles if the table already exists
 */
function createFailedNotificationsTable(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS failed_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        signal TEXT NOT NULL,
        messageId TEXT,
        errorMessage TEXT,
        retryCount INTEGER DEFAULT 0,
        nextRetryAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      );
    `);
    console.log('✓ Created failed_notifications table');
  } catch (e) {
    console.log('✓ failed_notifications table already exists');
  }
}

/**
 * Create users table if it doesn't exist
 * This is the base table that telegramChatId references
 */
function createUsersTable(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created users table');
  } catch (e) {
    console.log('✓ users table already exists');
  }
}

/**
 * Initialize all Telegram-related schema
 * Creates users table, adds telegramChatId column, and creates failed_notifications table
 */
function initializeTelegramSchema(db) {
  createUsersTable(db);
  addTelegramChatIdColumn(db);
  createFailedNotificationsTable(db);
}

module.exports = {
  createDb,
  setCache,
  getCache,
  addTelegramChatIdColumn,
  createFailedNotificationsTable,
  createUsersTable,
  initializeTelegramSchema
};
