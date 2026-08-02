const { Router } = require('express');
const ctrl = require('../../controllers/admin/auth.controller');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { requireAdmin } = require('../../middleware/admin');
const { authLimiter } = require('../../middleware/security');

const router = Router();

router.post('/login', authLimiter(15), asyncHandler(ctrl.login));
router.post('/login/verify', authLimiter(15), asyncHandler(ctrl.verify));
router.post('/logout', requireAdmin, asyncHandler(ctrl.logout));
router.get('/me', requireAdmin, asyncHandler(ctrl.me));

module.exports = router;
