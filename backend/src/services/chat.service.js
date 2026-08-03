const { GoogleGenerativeAI } = require('@google/generative-ai');
const knowledgeService = require('./knowledge.service');

const SYSTEM_PROMPT = `Tu ek bahut experienced aur compassionate Pandit Ji hai — "Pandit Ji AI" — jo All India Pandit Connect platform par logo ki madad karta hai. Tu koi robot ya chatbot nahi hai, tu ek REAL pandit jaisa behave karega.

## Tera Character:
- Tu 25+ saal ka anubhav rakhne wala senior Pandit hai
- Tu Nalkheda, Datia aur kai dusre siddha peethon par ja chuka hai
- Tujhe Vedas, Puranas, Tantras, Jyotish aur Ayurveda ka gehra gyan hai
- Tu Hinglish mein baat karta hai (Hindi + thoda English naturally)
- Tu bahut empathetic hai — pehle user ki baat sunke samajhta hai
- Tu generic answers NAHI deta — specific, actionable solutions deta hai
- Tu real examples share karta hai — "ek bhakt the jinko..." jaisi stories

## Response Style Rules:
1. PEHLE samvedna dikhao — "Haan beta, main samajh raha hun aapki pareshani..."
2. PHIR diagnosis do — "Ye lag raha hai ki [karan]..."
3. PHIR specific solution do — exact puja/havan/remedy with steps
4. PHIR real example share karo — similar case where it worked
5. PHIR DIY option do — "Ghar par aap ye kar sakte ho..."
6. LAST mein pandit suggest karo — "Agar professionally karvana ho toh hamare platform par..."

## Important Rules:
- KABHI generic "seek professional help" mat bolo — specific batao
- Har response mein kam se kam 1 real example/story share karo
- Shastra ka reference do — "Vishwasaroddhara Tantra mein likha hai..."
- Specific herbs, samagri, mantras batao — vague mat raho
- Jab health ki baat ho toh "doctor se bhi consult karein" zaroor bolo but saath mein spiritual solution bhi do
- Legal matters mein "vakeel se bhi milein" bolo but spiritual support bhi do
- Response 200-400 words ka ho — na bahut chhota na bahut bada
- Emojis sparingly use karo — 🙏 ॐ 🔱 etc.
- Tu ALL INDIA PANDIT CONNECT platform ka pandit hai — users ko platform ki services suggest kar

## Knowledge Base Context:
Neeche diya gaya context tera knowledge base hai. Iska use karke SPECIFIC answers de. Generic mat de.
`;

class ChatService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.conversations = new Map(); // sessionId -> history
  }

  initialize() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not set. Chat service will not work.');
      return;
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.85,
        topP: 0.92,
        topK: 40,
        maxOutputTokens: 1500,
      },
    });
    
    // Load knowledge base
    knowledgeService.load();
    
    console.log('✅ Gemini Chat Service initialized');
  }

  async chat(sessionId, userMessage) {
    if (!this.model) {
      throw new Error('Chat service not initialized. Check GEMINI_API_KEY.');
    }
    
    // Get relevant context from knowledge base
    const context = knowledgeService.getRelevantContext(userMessage);
    
    // Get or create conversation history
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }
    const history = this.conversations.get(sessionId);
    
    // Build the prompt with system instructions + context + history
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${context}\n\n---\n\n## Conversation History:\n${history.map(h => `${h.role}: ${h.content}`).join('\n')}\n\nUser: ${userMessage}\n\nPandit Ji:`;
    
    try {
      const result = await this.model.generateContent(fullPrompt);
      const response = result.response.text();
      
      // Save to history (keep last 10 exchanges)
      history.push({ role: 'User', content: userMessage });
      history.push({ role: 'Pandit Ji', content: response });
      if (history.length > 20) {
        history.splice(0, 2); // Remove oldest exchange
      }
      
      // Determine what knowledge was used
      const sourcesUsed = [];
      if (context.includes('Matched Problems')) sourcesUsed.push('problems-solutions');
      if (context.includes('Relevant Herbs')) sourcesUsed.push('herbs-encyclopedia');
      if (context.includes('Relevant Puja')) sourcesUsed.push('puja-vidhi-guide');
      if (context.includes('DIY Home')) sourcesUsed.push('diy-remedies');
      if (context.includes('Baglamukhi')) sourcesUsed.push('baglamukhi-knowledge');
      if (context.includes('Real Devotee')) sourcesUsed.push('real-experiences');
      if (context.includes('Bhagavad Gita')) sourcesUsed.push('bhagavad-gita');
      
      return {
        response,
        sessionId,
        sourcesUsed,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Gemini API error:', error.message);
      throw new Error('Pandit Ji abhi vyast hain. Kripya thodi der baad prayaas karein. 🙏');
    }
  }

  // Clean up old sessions (call periodically)
  cleanupSessions() {
    if (this.conversations.size > 1000) {
      const keys = Array.from(this.conversations.keys());
      for (let i = 0; i < 500; i++) {
        this.conversations.delete(keys[i]);
      }
    }
  }

  // Get greeting message
  getGreeting() {
    const greetings = [
      "🙏 Jai Maa Baglamukhi! Main Pandit Ji hun, aapka swagat hai All India Pandit Connect par. Bataiye, aapko kis samasya ka samadhan chahiye?",
      "ॐ नमो भगवते बगलामुखी! Pranam! Main aapka Pandit Ji hun. Aapki kya pareshani hai? Khul kar bataiye, main aapki puri madad karunga. 🙏",
      "🔱 Jai Maa Pitambari! Swagat hai aapka. Main Pandit Ji hun — 25+ saal ka anubhav hai mujhe pooja-paath, havan, aur samasya samadhan mein. Bataiye kya hua?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // Get suggested questions
  getSuggestedQuestions() {
    return [
      "Ghar mein bahut kalesh hota hai, kya karun?",
      "Court case 3 saal se chal raha hai, koi upay bataiye",
      "Maa Baglamukhi ka havan kaise hota hai?",
      "Business mein bahut nuksan ho raha hai",
      "Shaadi mein deri ho rahi hai, koi totka bataiye",
      "Nazar lag gayi hai, kaise utaarun?",
      "Pitru dosh ka kya samadhan hai?",
      "Nalkheda mandir kaise jaayein aur kya karna hota hai?",
      "Ghar par konsa havan kar sakte hain?",
      "Haldi ka havan mein kya kaam hota hai?"
    ];
  }
}

module.exports = new ChatService();
