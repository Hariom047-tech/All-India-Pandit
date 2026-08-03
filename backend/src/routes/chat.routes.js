const { Router } = require('express');
const { chat, greeting } = require('../controllers/chat.controller');

const router = Router();

// POST /api/chat — send message, get response
router.post('/', chat);

// GET /api/chat/greeting — get initial greeting + suggestions
router.get('/greeting', greeting);

module.exports = router;
