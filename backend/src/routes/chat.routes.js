const { Router } = require('express');
const { chat, greeting } = require('../controllers/chat.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');

const router = Router();

// POST /api/chat — AI chat (costs money per call: strict rate limit 20/15min per IP)
router.post('/', authLimiter(20), asyncHandler(chat));

// GET /api/chat/greeting — static-ish, relaxed limit
router.get('/greeting', authLimiter(60), asyncHandler(greeting));

module.exports = router;
