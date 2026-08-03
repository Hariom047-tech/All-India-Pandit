const chatService = require('../services/chat.service');
const { v4: uuidv4 } = require('uuid'); // or use crypto.randomUUID()
const crypto = require('crypto');

exports.chat = async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long. Maximum 1000 characters.' });
    }
    
    const sid = sessionId || crypto.randomUUID();
    const result = await chatService.chat(sid, message.trim());
    
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      response: 'Pandit Ji abhi vyast hain. Kripya thodi der baad prayaas karein. 🙏'
    });
  }
};

exports.greeting = async (req, res, next) => {
  try {
    const greeting = chatService.getGreeting();
    const suggestions = chatService.getSuggestedQuestions();
    
    res.json({ greeting, suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
