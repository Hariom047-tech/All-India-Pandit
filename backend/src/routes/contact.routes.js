const { Router } = require('express');
const ctrl = require('../controllers/contact.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');

const router = Router();

// 5 contact form submissions per 15 min per IP — prevents spam flooding
router.post('/', authLimiter(5), asyncHandler(ctrl.send));

module.exports = router;
