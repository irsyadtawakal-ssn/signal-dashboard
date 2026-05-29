function loadConfig(env = process.env) {
  const required = (name) => {
    const v = env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  return {
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || './data/cache.sqlite',
    supabaseJwtSecret: required('SUPABASE_JWT_SECRET'),
    supabaseJwtIssuer: env.SUPABASE_JWT_ISSUER || undefined,
    octTokenAddress: env.OCT_TOKEN_ADDRESS || '0x4647e1fe715c9e23959022c2416c71867f5a6e80',
    priceIntervalMs: Number(env.PRICE_INTERVAL_MS) || 300000,
    newsIntervalMs: Number(env.NEWS_INTERVAL_MS) || 3600000,
    cryptopanicToken: env.CRYPTOPANIC_TOKEN || undefined,
  };
}

module.exports = { loadConfig };
