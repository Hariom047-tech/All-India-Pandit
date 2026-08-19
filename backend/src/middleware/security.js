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
//
// TEST_RATE_LIMIT_SCALE: several routes this guards (notably /pandits/:id/click,
// which carries no email/target and so keys on IP alone) see far more *distinct,
// legitimate* scenarios in one test run than one real IP would generate in
// production — the dedup/concurrency suites alone are 60+ requests from a
// single process. Scaling the ceiling up (never removing it) when
// NODE_ENV=test keeps the suite from failing on volume that has nothing to do
// with the rule under test, while leaving production's actual threshold
// completely untouched: this only ever fires for NODE_ENV=test specifically,
// never for 'development' or an unset NODE_ENV, let alone 'production'.
const TEST_RATE_LIMIT_SCALE = 50;
function authLimiter(max) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? max * TEST_RATE_LIMIT_SCALE : max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${req.body?.email || req.body?.target || ''}`,
    handler: onLimited('AUTH_RATE_LIMIT_EXCEEDED'),
    validate: false,
  });
}

module.exports = { apiLimiter, authLimiter, TEST_RATE_LIMIT_SCALE };
