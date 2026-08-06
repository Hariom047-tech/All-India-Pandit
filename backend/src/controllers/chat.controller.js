const chatService = require('../services/chat.service');
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
    console.log(`💬 Chat [${sid.slice(0,8)}...] ${sessionId ? '(existing)' : '(new)'}: "${message.trim().slice(0,50)}..."`);
    
    const result = await chatService.chat(sid, message.trim());
    
    // Always ensure sessionId is in the response
    res.json({ ...result, sessionId: sid });
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
