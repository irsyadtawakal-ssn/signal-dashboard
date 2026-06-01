import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, getCache, setCache, addTelegramChatIdColumn, createFailedNotificationsTable, initializeTelegramSchema } from '../src/db.js';

let db;
beforeEach(() => {
  db = createDb(':memory:');
});

describe('cache layer', () => {
  it('returns null for a missing key', () => {
    expect(getCache(db, 'nope')).toBeNull();
  });

  it('stores and retrieves a JSON value', () => {
    setCache(db, 'price', { oct: 0.21 });
    const hit = getCache(db, 'price');
    expect(hit.value).toEqual({ oct: 0.21 });
    expect(typeof hit.updatedAt).toBe('number');
  });

  it('upserts (overwrites) an existing key', () => {
    setCache(db, 'price', { oct: 0.21 });
    setCache(db, 'price', { oct: 0.25 });
    expect(getCache(db, 'price').value).toEqual({ oct: 0.25 });
  });
});

describe('telegram schema migrations', () => {
  it('creates users table with telegramChatId column', () => {
    const rows = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='users'
    `).all();
    expect(rows.length).toBe(1);

    const columns = db.prepare(`PRAGMA table_info(users)`).all();
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('telegramChatId');
    expect(columnNames).toContain('createdAt');
  });

  it('creates failed_notifications table', () => {
    const rows = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='failed_notifications'
    `).all();
    expect(rows.length).toBe(1);

    const columns = db.prepare(`PRAGMA table_info(failed_notifications)`).all();
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('userId');
    expect(columnNames).toContain('signal');
    expect(columnNames).toContain('messageId');
    expect(columnNames).toContain('errorMessage');
    expect(columnNames).toContain('retryCount');
    expect(columnNames).toContain('nextRetryAt');
    expect(columnNames).toContain('createdAt');
  });

  it('handles duplicate column addition gracefully', () => {
    // First call should succeed
    addTelegramChatIdColumn(db);

    // Second call should not throw and should handle gracefully
    expect(() => {
      addTelegramChatIdColumn(db);
    }).not.toThrow();
  });

  it('handles duplicate table creation gracefully', () => {
    // First call should succeed
    createFailedNotificationsTable(db);

    // Second call should not throw and should handle gracefully
    expect(() => {
      createFailedNotificationsTable(db);
    }).not.toThrow();
  });

  it('allows inserting user with telegramChatId', () => {
    const userId = 'user-123';
    const chatId = '987654321';

    db.prepare(`
      INSERT INTO users (id, email, telegramChatId)
      VALUES (?, ?, ?)
    `).run(userId, 'user@example.com', chatId);

    const user = db.prepare(`
      SELECT id, email, telegramChatId FROM users WHERE id = ?
    `).get(userId);

    expect(user.id).toBe(userId);
    expect(user.telegramChatId).toBe(chatId);
  });

  it('allows inserting failed notification', () => {
    const userId = 'user-123';

    // First insert a user
    db.prepare(`
      INSERT INTO users (id, email) VALUES (?, ?)
    `).run(userId, 'user@example.com');

    // Then insert a failed notification
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, messageId, errorMessage, retryCount)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'BUY', null, 'Chat ID not found', 1);

    const notification = db.prepare(`
      SELECT userId, signal, errorMessage, retryCount FROM failed_notifications
      WHERE userId = ?
    `).get(userId);

    expect(notification.userId).toBe(userId);
    expect(notification.signal).toBe('BUY');
    expect(notification.errorMessage).toBe('Chat ID not found');
    expect(notification.retryCount).toBe(1);
  });

  it('enforces foreign key constraint on userId', () => {
    // Attempt to insert a notification with non-existent userId should fail
    expect(() => {
      db.prepare(`
        INSERT INTO failed_notifications (userId, signal, messageId, errorMessage, retryCount)
        VALUES (?, ?, ?, ?, ?)
      `).run('non-existent-user', 'BUY', null, 'Chat ID not found', 1);
    }).toThrow();
  });

  it('handles nextRetryAt timestamp operations correctly', () => {
    const userId = 'user-456';
    const now = new Date().toISOString();
    const futureTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour later

    // First insert a user
    db.prepare(`
      INSERT INTO users (id, email) VALUES (?, ?)
    `).run(userId, 'user@example.com');

    // Insert a failed notification with nextRetryAt
    db.prepare(`
      INSERT INTO failed_notifications (userId, signal, nextRetryAt, errorMessage, retryCount)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'SELL', futureTime, 'Retry needed', 2);

    const notification = db.prepare(`
      SELECT userId, signal, nextRetryAt, retryCount FROM failed_notifications
      WHERE userId = ?
    `).get(userId);

    expect(notification.userId).toBe(userId);
    expect(notification.signal).toBe('SELL');
    expect(notification.retryCount).toBe(2);
    expect(notification.nextRetryAt).toBeTruthy();
    // Verify nextRetryAt is in the future
    expect(new Date(notification.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
  });
});
