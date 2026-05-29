import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns config from a complete env', () => {
    const cfg = loadConfig({
      PORT: '4000',
      DB_PATH: '/tmp/x.sqlite',
      SUPABASE_JWT_SECRET: 'secret',
    });
    expect(cfg.port).toBe(4000);
    expect(cfg.dbPath).toBe('/tmp/x.sqlite');
    expect(cfg.supabaseJwtSecret).toBe('secret');
  });

  it('applies defaults for port and dbPath', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.port).toBe(3000);
    expect(cfg.dbPath).toBe('./data/cache.sqlite');
  });

  it('throws when SUPABASE_JWT_SECRET is missing', () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_JWT_SECRET/);
  });
});
