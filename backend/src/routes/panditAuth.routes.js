const { Router } = require('express');
const ctrl = require('../controllers/panditAuth.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');

const router = Router();

// authLimiter keys on IP + req.body.email (see middleware/security.js), so
// these budgets are per-account-per-IP: one attacker cannot spread guesses
// across many accounts, and one shared/NAT IP cannot lock a pandit out of
// their own account.
router.post('/login', authLimiter(15), asyncHandler(ctrl.login));

// Deliberately the tightest budget in the app. A date of birth is guessable
// in a way a password is not — roughly 25k plausible values for an adult —
// so 5 attempts per 15 minutes makes an online search take years, and every
// failure lands in security_audit_log.
router.post('/reset-password/verify', authLimiter(5), asyncHandler(ctrl.verifyResetIdentity));

// Higher than the DOB step: by this point the caller already holds a
// high-entropy single-use token, so the limit is only anti-abuse.
router.post('/reset-password', authLimiter(15), asyncHandler(ctrl.resetPassword));

module.exports = router;
