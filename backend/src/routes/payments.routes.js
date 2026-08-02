const { Router } = require('express');
const ctrl = require('../controllers/payments.controller');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = Router();

// Body is raw bytes here (see app.js) — signature verification needs the
// exact bytes Razorpay signed, not a re-serialized JSON.parse of them.
router.post('/webhook', asyncHandler(ctrl.webhook));

module.exports = router;
