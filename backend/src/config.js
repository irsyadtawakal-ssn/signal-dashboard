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
  };
}

module.exports = { loadConfig };
