const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('../utils/securityLog');

/** Fires on any limiter rejection — logs to security_audit_log (see
 *  01-schema.sql) instead of just silently 429ing. */
function onLimited(eventType) {
  return (req, res) => {
    logSecurityEvent(eventType, req, { path: req.path, method: req.method });
    res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  };
}

// Generous — this protects the whole API from being hammered, not any one
// user from brute force (that's authLimiter below). In-memory store: fine
// for this single-backend-instance deployment; a multi-instance deployment
// would need a shared store (Redis) instead — see docs/SECURITY.md.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimited('RATE_LIMIT_EXCEEDED'),
});

// Login/register/OTP are where brute force and account-enumeration actually
// bite — keyed by IP + the email/phone being targeted, so one attacker can't
// spread guesses across many accounts to dodge a per-account limit, and one
// noisy IP can't lock everyone else out of their own account either.
function authLimiter(max) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${req.body?.email || req.body?.target || ''}`,
    handler: onLimited('AUTH_RATE_LIMIT_EXCEEDED'),
  });
}

module.exports = { apiLimiter, authLimiter };
