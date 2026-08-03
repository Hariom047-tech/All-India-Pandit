const { Router } = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/asyncHandler');
const { honeypotRouter } = require('../middleware/honeypot');
const { adminSecretPath } = require('../config/env');

const router = Router();

router.get('/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, service: 'panditconnect-backend', db: 'connected' });
}));

// Registered before the honeypot paths below so a REAL admin doesn't 404
// themselves if ADMIN_SECRET_PATH is ever set to something that collides —
// unlikely, but cheap insurance.
router.use(`/${adminSecretPath}`, require('./admin'));

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
router.use('/', require('./misc.routes')); // /panchang, /festivals, /faqs, /plans, /stats, /taxonomy, /recommend

module.exports = router;
