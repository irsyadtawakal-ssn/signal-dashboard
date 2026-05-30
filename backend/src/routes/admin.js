const https = require('https');

/**
 * Check if user email is in admin list and log the access attempt.
 * @param {string} userEmail - The email to check
 * @param {string[]} adminEmails - List of authorized admin emails
 * @returns {boolean} True if user is admin, false otherwise
 */
function isAdmin(userEmail, adminEmails) {
  const normalized = (userEmail || '').toLowerCase().trim();
  const isAuthorized = adminEmails.includes(normalized);

  if (isAuthorized) {
    console.log(`[Admin] Access granted to ${userEmail} at ${new Date().toISOString()}`);
  } else {
    console.warn(`[Admin] Unauthorized access attempt from ${userEmail} at ${new Date().toISOString()}`);
  }

  return isAuthorized;
}

function supabaseAdminPost(supabaseUrl, serviceRoleKey, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, supabaseUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = function adminRoute({ config }) {
  const router = require('express').Router();

  // POST /api/admin/invite  { email, password }
  router.post('/invite', async (req, res) => {
    // Only admin emails allowed
    const callerEmail = req.user?.email || '';
    if (!isAdmin(callerEmail, config.adminEmails)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    if (!config.supabaseServiceRoleKey || !config.supabaseUrl) {
      return res.status(503).json({ error: 'admin not configured on server' });
    }

    try {
      const result = await supabaseAdminPost(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        '/auth/v1/admin/users',
        { email, password, email_confirm: true }
      );
      if (result.status === 200 || result.status === 201) {
        return res.json({ ok: true, user: { id: result.body.id, email: result.body.email } });
      }
      return res.status(result.status).json({ error: result.body?.msg || result.body?.message || 'failed' });
    } catch (err) {
      console.error('admin invite error:', err.message);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  return router;
};

module.exports.isAdmin = isAdmin;
