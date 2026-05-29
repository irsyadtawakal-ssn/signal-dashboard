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

  it('parses new optional fields with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.octTokenAddress).toBe('0x4647e1fe715c9e23959022c2416c71867f5a6e80');
    expect(cfg.priceIntervalMs).toBe(300000);
    expect(cfg.supabaseJwtIssuer).toBeUndefined();
  });

  it('reads overrides for new fields', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      OCT_TOKEN_ADDRESS: '0xabc',
      PRICE_INTERVAL_MS: '60000',
      SUPABASE_JWT_ISSUER: 'https://proj.supabase.co/auth/v1',
    });
    expect(cfg.octTokenAddress).toBe('0xabc');
    expect(cfg.priceIntervalMs).toBe(60000);
    expect(cfg.supabaseJwtIssuer).toBe('https://proj.supabase.co/auth/v1');
  });
});
