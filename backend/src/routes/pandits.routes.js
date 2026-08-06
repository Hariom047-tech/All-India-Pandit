const { Router } = require('express');
const ctrl = require('../controllers/pandits.controller');
const paymentsCtrl = require('../controllers/payments.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.get('/ranked-order', asyncHandler(ctrl.rankedOrder));
router.get('/:id', asyncHandler(ctrl.getById));
// 10 enquiries per 15 min per IP — prevents spam bots flooding pandits
router.post('/:id/enquiry', authLimiter(10), asyncHandler(ctrl.inquire));
router.post('/:id/click', asyncHandler(ctrl.trackClick));
router.post('/:id/view', asyncHandler(ctrl.trackView));
router.post('/:id/subscribe', requireAuth, asyncHandler(paymentsCtrl.subscribe));

module.exports = router;
