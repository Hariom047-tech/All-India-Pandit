const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/users', require('./users.routes'));
router.use('/pandits', require('./pandits.routes'));
router.use('/temples', require('./temples.routes'));
router.use('/', require('./services.routes'));           // /service-categories, /services
router.use('/reviews', require('./reviews.routes'));
router.use('/inquiries', require('./inquiries.routes'));
router.use('/', require('./subscriptions.routes'));       // /subscription-plans, /subscriptions, /payments, /revenue
router.use('/', require('./content.routes'));              // /blog/posts
router.use('/community', require('./community.routes'));
router.use('/', require('./panchang.routes'));             // /panchang, /festivals
router.use('/notifications', require('./notifications.routes'));
router.use('/security', require('./security.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/leads', require('./leads.routes'));

module.exports = router;
