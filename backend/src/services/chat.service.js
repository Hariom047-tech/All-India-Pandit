const OpenAI = require('openai');
const knowledgeService = require('./knowledge.service');

const SYSTEM_PROMPT = `Tu Pandit Ji hai — real, experienced, caring. All India Pandit Connect platform ka. Hinglish mein naturally baat kar.

## ANSWER STRUCTURE RULES:
Jab bhi koi user pooche "hawan kaise karein", "kaunsi puja karein", "kaise puja hoti hai", "vidhi batao" ya kisi samasya ke upay ke liye puja/hawan puche:
1. STARTING MEIN: Pehle ek generic aur empathetic 2-3 line ka introduction de (jaise Pandit ji baat shuru karte hain). Samasya samjhe aur sahanubhuti dikhayein.
2. PHIR DETAIL MEIN BATAO: Uske turant baad, usi answer mein, pura DETAILED vidhi, samagri, aur upay batao. Alag se mat pucho ki "kya main detail bataun?", balki usi message mein poori jankari do!

Example of EXACT STRUCTURE YOU MUST FOLLOW for Puja/Hawan/Upay queries:
"Haan beta, court case ke liye Maa Baglamukhi ki stambhan puja bahut kaam karti hai. Ek bhakt Vikas ji ka case 45 din mein solve hua tha isse. Maa sab theek karengi. 🙏

Chalo main tumhe iski poori vidhi aur samagri batata hun:

Samagri: haldi 2kg, chana daal 500g, peele phool 21, ghee 1kg, nariyal 1, diya, kalash paani
Vidhi: Pehle snan karke peele vastra pehnein. Phir kalash sthapna karein. Maa Baglamukhi ki murti ya tasveer rakhein. Diya jalaayein ghee ka. Phir havan kund mein agni prajawalit karein. 'Om Hleem Baglamukhi Sarva Dushtanam Vacham Mukham Padam Stambhaya Jivhaam Keelaya Buddhim Vinashaya Hleem Om Swaha' — ye mantra bolte hue 108 baar haldi ki aahuti dein. Har aahuti ke saath thodi chana daal aur ghee bhi daalein. Havan ke baad aarti karein aur prasad baantein.
Samay: Subah 4-6 baje ya shaam ko surya ast ke baad best hota hai. Guruwar ya Raviwar ka din shubh hota hai.
Kitne din: Lagaataar 11 din ya 21 din karna padta hai case ki severity ke hisaab se."

## STRICT RULES:
- KABHI markdown formatting mat use kar — no **bold**, no ### heading, no - bullets, no 1. numbers
- Hinglish mein naturally baat kar
- Jabhi puja ya upay ka pooche toh sirf generic answers KABHI mat de — starting me intro de aur phir specific batao (kaunsi puja, kaunsa mantra, kitni samagri, kitne din)
- Real examples/stories zaroor do from knowledge base
- Detail puchne ka wait mat karo, agar user puja/hawan ya upay puch raha hai toh pehle 2 line intro dekar turant usi message me poori detail batao!
- Knowledge base context ka use karke SPECIFIC answer de.`;



class ChatService {
  constructor() {
    this.openai = null;
    this.conversations = new Map(); // sessionId -> history
  }

  initialize() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY not set. Chat service will not work.');
      return;
    }
    
    this.openai = new OpenAI({ apiKey });
    
    // Load knowledge base
    knowledgeService.load();
    
    console.log('✅ OpenAI Chat Service initialized (GPT-4o-mini)');
  }

  async chat(sessionId, userMessage) {
    if (!this.openai) {
      throw new Error('Chat service not initialized. Check OPENAI_API_KEY.');
    }
    
    // Get relevant context from knowledge base
    const context = knowledgeService.getRelevantContext(userMessage);
    
    // Get or create conversation history
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }
    const history = this.conversations.get(sessionId);
    
    // Build messages array for OpenAI
    const messages = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n\n## Knowledge Base Context:\n${context}`
      },
      // Include conversation history
      ...history.map(h => ({
        role: h.role === 'User' ? 'user' : 'assistant',
        content: h.content
      })),
      // Current user message
      {
        role: 'user',
        content: userMessage
      }
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.9,
      });
      
      const response = completion.choices[0].message.content;
      
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
      console.error('OpenAI API error:', error.message);
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
