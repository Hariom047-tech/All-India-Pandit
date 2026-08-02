const crypto = require('crypto');
const repo = require('../repositories/auth.repository');
const { asyncHandler } = require('./asyncHandler');

/** sha256 hex — deterministic and fast, unlike bcrypt, which is the point:
 *  a bearer token is already high-entropy random data, so we just need a
 *  quick, indexable equality lookup against user_sessions.token_hash. */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function extractToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

async function identify(req) {
  const token = extractToken(req);
  if (!token) return null;
  const session = await repo.findActiveSessionByTokenHash(hashToken(token));
  if (!session) return null;
  return { id: session.user_id, email: session.email, role: session.role, fullName: session.full_name };
}

/** Attaches req.user (or null) without rejecting the request. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  req.user = await identify(req);
  next();
});

/** Attaches req.user, 401s if there isn't a valid session. */
const requireAuth = asyncHandler(async (req, res, next) => {
  req.user = await identify(req);
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
});

module.exports = { requireAuth, optionalAuth, hashToken, extractToken };
