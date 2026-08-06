const { Router } = require('express');
const ctrl = require('../controllers/contact.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');

const router = Router();

// 5 newsletter subscribes per 15 min per IP — prevents fake email flooding
router.post('/', authLimiter(5), asyncHandler(ctrl.subscribe));

module.exports = router;
