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

  it('parses news config with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.newsIntervalMs).toBe(3600000);
    expect(cfg.cryptopanicToken).toBeUndefined();
  });

  it('reads news config overrides', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      NEWS_INTERVAL_MS: '120000',
      CRYPTOPANIC_TOKEN: 'tok123',
    });
    expect(cfg.newsIntervalMs).toBe(120000);
    expect(cfg.cryptopanicToken).toBe('tok123');
  });

  it('parses twitter + AI config with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.twitterIntervalMs).toBe(300000);
    expect(cfg.twitterToken).toBeUndefined();
    expect(cfg.aiProvider).toBe('openrouter');
    expect(cfg.openrouterApiKey).toBeUndefined();
    expect(cfg.anthropicApiKey).toBeUndefined();
    expect(cfg.sentimentModel).toBeUndefined();
    expect(cfg.twitterKeywords).toEqual(['Octra', '$OCT', 'FHE layer1', 'OCT listing']);
  });

  it('reads twitter + AI config overrides', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      TWITTER_INTERVAL_MS: '60000',
      TWITTER_SCRAPER_TOKEN: 'scrapetok',
      AI_PROVIDER: 'anthropic',
      OPENROUTER_API_KEY: 'or-key',
      ANTHROPIC_API_KEY: 'an-key',
      SENTIMENT_MODEL: 'custom-model',
      TWITTER_KEYWORDS: 'foo,bar',
    });
    expect(cfg.twitterIntervalMs).toBe(60000);
    expect(cfg.twitterToken).toBe('scrapetok');
    expect(cfg.aiProvider).toBe('anthropic');
    expect(cfg.openrouterApiKey).toBe('or-key');
    expect(cfg.anthropicApiKey).toBe('an-key');
    expect(cfg.sentimentModel).toBe('custom-model');
    expect(cfg.twitterKeywords).toEqual(['foo', 'bar']);
  });
});
