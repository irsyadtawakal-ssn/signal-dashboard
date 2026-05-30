const jwt = require('jsonwebtoken');
const { createPublicKey } = require('crypto');
const https = require('https');

// Simple in-memory JWKS cache (keyed by kid → PEM public key)
const jwksCache = { keys: {}, fetchedAt: 0 };
const JWKS_TTL_MS = 3_600_000; // re-fetch after 1 hour

function fetchJwks(supabaseUrl) {
  return new Promise((resolve, reject) => {
    https
      .get(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

async function refreshJwks(supabaseUrl) {
  const { keys } = await fetchJwks(supabaseUrl);
  jwksCache.keys = {};
  for (const k of keys) {
    const pub = createPublicKey({ key: k, format: 'jwk' });
    jwksCache.keys[k.kid] = pub.export({ type: 'spki', format: 'pem' });
  }
  jwksCache.fetchedAt = Date.now();
}

function getTokenKid(token) {
  try {
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString()
    );
    return header.kid || null;
  } catch {
    return null;
  }
}

function requireAuth(config) {
  return async function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'missing bearer token' });
    }

    const jwtOptions = { audience: 'authenticated' };
    if (config.supabaseJwtIssuer) jwtOptions.issuer = config.supabaseJwtIssuer;

    // 1. Try legacy HS256 (Shared Secret) first
    try {
      const payload = jwt.verify(token, config.supabaseJwtSecret, {
        ...jwtOptions,
        algorithms: ['HS256'],
      });
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      // fall through to ES256
    }

    // 2. Try modern ES256 (ECC P-256) via JWKS
    if (!config.supabaseUrl) {
      return res.status(401).json({ error: 'invalid token' });
    }
    try {
      const now = Date.now();
      if (
        Object.keys(jwksCache.keys).length === 0 ||
        now - jwksCache.fetchedAt > JWKS_TTL_MS
      ) {
        await refreshJwks(config.supabaseUrl);
      }

      const kid = getTokenKid(token);
      const publicKey = kid
        ? jwksCache.keys[kid]
        : Object.values(jwksCache.keys)[0];

      if (!publicKey) {
        return res.status(401).json({ error: 'invalid token' });
      }

      const payload = jwt.verify(token, publicKey, {
        ...jwtOptions,
        algorithms: ['ES256'],
      });
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = { requireAuth };
