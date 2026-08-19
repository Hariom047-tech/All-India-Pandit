const { Router } = require('express');
const ctrl = require('../controllers/pandits.controller');
const paymentsCtrl = require('../controllers/payments.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
// The fair-distribution listing. optionalAuth so a logged-in visitor's own id
// seeds the rotation (stable across their devices) rather than their IP.
router.get('/distributed', optionalAuth, asyncHandler(ctrl.distributed));
// The full fair order, for pages that filter client-side. No exposure written.
router.get('/distribution-order', optionalAuth, asyncHandler(ctrl.distributionOrder));
// What the client actually rendered. Rate-limited: it is an unauthenticated
// write, and it feeds the counter that decides who gets shown next, so an
// unthrottled caller could bury a competitor by reporting them at slot 1
// repeatedly. The per-hour unique index blunts that; the limiter closes it.
router.post('/exposure', authLimiter(120), optionalAuth, asyncHandler(ctrl.reportExposure));
router.get('/:id', asyncHandler(ctrl.getById));
// 10 enquiries per 15 min per IP — prevents spam bots flooding pandits
router.post('/:id/enquiry', authLimiter(10), asyncHandler(ctrl.inquire));
// optionalAuth, not requireAuth: a guest press must still be recorded in the
// raw CTA funnel and must still get a useful response telling the UI to ask
// for login — it just can never become a qualified lead. Rate-limited
// because this is an unauthenticated write endpoint.
router.post('/:id/click', authLimiter(60), optionalAuth, asyncHandler(ctrl.trackClick));
router.post('/:id/view', asyncHandler(ctrl.trackView));
router.post('/:id/subscribe', requireAuth, asyncHandler(paymentsCtrl.subscribe));

module.exports = router;
