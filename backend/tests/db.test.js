import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, getCache, setCache } from '../src/db.js';

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
