const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/users', require('./users.routes'));
router.use('/admin-users', require('./adminUsers.routes'));
router.use('/pandits', require('./pandits.routes'));
router.use('/temples', require('./temples.routes'));
router.use('/', require('./services.routes'));           // /service-categories, /services
router.use('/reviews', require('./reviews.routes'));
router.use('/', require('./faqs.routes'));                // /faqs
router.use('/inquiries', require('./inquiries.routes'));
router.use('/', require('./subscriptions.routes'));       // /subscription-plans, /subscriptions, /payments, /revenue
router.use('/', require('./content.routes'));              // /blog/posts
router.use('/community', require('./community.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/security', require('./security.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/distribution', require('./distribution.routes'));   // v2 engine controls
router.use('/home-hero', require('./homeHero.routes'));
router.use('/geo', require('./geo.routes'));
// AI knowledge base + AI analytics (docs/AI_KNOWLEDGE_GUIDE.md).
router.use('/ai', require('./ai.routes'));

module.exports = router;
