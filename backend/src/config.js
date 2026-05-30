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
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseJwtIssuer: env.SUPABASE_JWT_ISSUER || undefined,
    octTokenAddress: env.OCT_TOKEN_ADDRESS || '0x4647e1fe715c9e23959022c2416c71867f5a6e80',
    priceIntervalMs: Number(env.PRICE_INTERVAL_MS) || 300000,
    newsIntervalMs: Number(env.NEWS_INTERVAL_MS) || 3600000,
    cryptopanicToken: env.CRYPTOPANIC_TOKEN || undefined,
    twitterIntervalMs: Number(env.TWITTER_INTERVAL_MS) || 300000,
    twitterToken: env.TWITTER_SCRAPER_TOKEN || undefined,
    aiProvider: env.AI_PROVIDER || 'openrouter',
    openrouterApiKey: env.OPENROUTER_API_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    sentimentModel: env.SENTIMENT_MODEL || undefined,
    twitterKeywords: env.TWITTER_KEYWORDS
      ? env.TWITTER_KEYWORDS.split(',').map((s) => s.trim()).filter(Boolean)
      : ['Octra', '$OCT', 'FHE layer1', 'OCT listing'],
    analysisTtlMs: Number(env.ANALYSIS_TTL_MS) || 600000,
    analysisModel: env.ANALYSIS_MODEL || undefined,
    corsOrigin: env.CORS_ORIGIN || undefined,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    adminEmails: env.ADMIN_EMAILS
      ? env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [],
  };
}

module.exports = { loadConfig };
