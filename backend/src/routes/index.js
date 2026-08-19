const { Router } = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/asyncHandler');
const { honeypotRouter } = require('../middleware/honeypot');
const { adminSecretPath } = require('../config/env');
const { authLimiter } = require('../middleware/security');
const { logSecurityEvent } = require('../utils/securityLog');

const router = Router();

router.get('/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, service: 'panditconnect-backend', db: 'connected' });
}));

// Registered before the honeypot paths below so a REAL admin doesn't 404
// themselves if ADMIN_SECRET_PATH is ever set to something that collides —
// unlikely, but cheap insurance.
router.use(`/${adminSecretPath}`, require('./admin'));

// Tells the admin SPA which API prefix to use.
//
// BE CLEAR ABOUT WHAT THIS IS: the admin panel is a public, unauthenticated
// browser app, so anything it can learn before login, anyone can learn before
// login. This endpoint hands out ADMIN_SECRET_PATH to whoever asks, which
// means the "secret" path is not secret and never could be while the public
// bundle needs it. Its remaining value is keeping dumb scanners out of the
// admin routes, not keeping a determined person out.
//
// The controls that actually stop an attacker are password + TOTP
// (middleware/admin.js), Row-Level Security, rate limiting and the IP ban
// list. If you want the admin surface genuinely hidden, put an IP allow-list
// in front of it in nginx (see docker/nginx/default.conf) or serve it from a
// separate host — see docs/SECURITY.md.
//
// Rate-limited and audited so that enumeration at least shows up in the
// security log rather than passing silently.
router.get('/admin-config', authLimiter(30), (req, res) => {
  logSecurityEvent('ADMIN_CONFIG_REQUESTED', req, {});
  res.json({ adminPath: adminSecretPath });
});

// Only meaningful at /api/* — nginx never forwards a bare "/admin" hit on
// the public site to this backend at all (see docker/nginx/default.conf),
// so these paths are the realistic attacker-facing surface, not top-level
// routes the way the original proposal shows them.
router.use('/', honeypotRouter());

router.use('/auth', require('./auth.routes'));
router.use('/me', require('./me.routes'));
router.use('/temples', require('./temples.routes'));
router.use('/pandits', require('./pandits.routes'));
router.use('/services', require('./services.routes'));
router.use('/reviews', require('./reviews.routes'));
router.use('/community', require('./community.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/blog', require('./blog.routes'));
router.use('/contact', require('./contact.routes'));
router.use('/newsletter', require('./newsletter.routes'));
const chatRoutes = require('./chat.routes');
router.use('/chat', chatRoutes);
// AI Pooja Guide — the RAG + recommendation assistant (docs/AI_RAG_ARCHITECTURE.md).
router.use('/ai', require('./ai.routes'));
router.use('/', require('./misc.routes')); // /plans, /stats, /taxonomy, /recommend
router.use('/', require('./faqs.routes')); // /faqs
router.use('/', require('./sitemap.routes')); // /sitemap.xml — see docker/nginx/*.conf for the root-path proxy
router.use('/', require('./render.routes')); // /_render/* — server-injected SEO metadata, see docker/nginx/*.conf

module.exports = router;
