const jwt = require('jsonwebtoken');

function requireAuth(config) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'missing bearer token' });
    }
    try {
      // Supabase access tokens carry aud='authenticated' by default (incl. anonymous
      // sign-ins). A project using a Custom Access Token Hook that overrides `aud`
      // would need this pin adjusted.
      const options = { algorithms: ['HS256'], audience: 'authenticated' };
      if (config.supabaseJwtIssuer) options.issuer = config.supabaseJwtIssuer;
      const payload = jwt.verify(token, config.supabaseJwtSecret, options);
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = { requireAuth };
