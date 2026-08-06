const { Router } = require('express');
const ctrl = require('../controllers/temples.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getById));
// 10 inquiries per 15 min per IP — prevents spam bots flooding pandits/temples
router.post('/:id/inquiry', authLimiter(10), asyncHandler(ctrl.inquire));

module.exports = router;
