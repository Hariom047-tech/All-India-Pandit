const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = Router();

// Keyed by IP + email/target (see middleware/security.js) — generous enough
// that the test suite and normal use never trip it, tight enough to slow a
// real credential-stuffing run against one account or one IP.
router.post('/register', authLimiter(20), asyncHandler(ctrl.register));
router.post('/register-pandit', authLimiter(20), asyncHandler(ctrl.registerPandit));
router.post('/login', authLimiter(20), asyncHandler(ctrl.login));
router.post('/google', authLimiter(20), asyncHandler(ctrl.googleAuth));
router.post('/logout', requireAuth, asyncHandler(ctrl.logout));
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.post('/otp/request', authLimiter(10), asyncHandler(ctrl.requestOtp));
router.post('/otp/verify', authLimiter(20), optionalAuth, asyncHandler(ctrl.verifyOtp));

module.exports = router;
