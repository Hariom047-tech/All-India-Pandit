const { Router } = require('express');
const ctrl = require('../controllers/pandits.controller');
const paymentsCtrl = require('../controllers/payments.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getById));
router.post('/:id/enquiry', asyncHandler(ctrl.inquire));
router.post('/:id/subscribe', requireAuth, asyncHandler(paymentsCtrl.subscribe));

module.exports = router;
