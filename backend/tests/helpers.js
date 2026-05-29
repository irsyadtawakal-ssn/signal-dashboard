const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-secret';

function signTestToken(payload = {}, secret = TEST_SECRET) {
  return jwt.sign(
    { sub: 'user-123', email: 'trader@example.com', aud: 'authenticated', ...payload },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

module.exports = { signTestToken, TEST_SECRET };
