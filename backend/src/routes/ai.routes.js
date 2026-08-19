const { Router } = require('express');
const ctrl = require('../controllers/ai.controller');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/security');
const { optionalAuth } = require('../middleware/auth');

const router = Router();

// Every route identifies the caller without requiring login — the assistant is
// open to guests, and req.user is what decides whether a session key is used.
router.use(optionalAuth);

// Each turn costs an embedding call plus a generation call, so the limit is
// tight. 20 per 15 minutes per IP matches the existing /api/chat endpoint.
router.post('/chat', authLimiter(20), asyncHandler(ctrl.chat));

// Analytics writes — cheap, best-effort, but still rate-limited so the endpoint
// cannot be used to flood the events table.
router.post('/events', authLimiter(120), asyncHandler(ctrl.recordEvent));
router.post('/feedback', authLimiter(40), asyncHandler(ctrl.feedback));

router.get('/status', authLimiter(60), asyncHandler(ctrl.status));

module.exports = router;
