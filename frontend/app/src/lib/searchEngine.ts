import { pandits, temples, services, festivals } from "../data/content";
import type { Pandit, Temple, Service, Festival } from "../data/types";

// --- 1. Dictionaries & Maps ---

const STOP_WORDS = new Set([
  "mujhe", "chahiye", "ke", "liye", "me", "ka", "ki", "ko", "hai", "ho", "kya",
  "aap", "bata", "sakte", "koi", "acha", "sa", "batao", "wala", "wale", "karna", "karwana",
  "i", "want", "to", "book", "a", "an", "the", "for", "in", "at", "is", "are",
  "how", "what", "can", "please", "need", "near", "best", "famous", "online", "my"
]);

const SYNONYMS: Record<string, string> = {
  "pooja": "puja", "pujan": "puja",
  "hawan": "havan", "homa": "havan",
  "shadi": "wedding", "shaadi": "wedding", "vivah": "wedding", "vivaah": "wedding", "marriage": "wedding",
  "mandir": "temple", "mander": "temple", "dham": "temple", "peeth": "temple",
  "pundit": "pandit", "purohit": "pandit", "pujari": "pandit", "guruji": "pandit", "acharya": "pandit", "shastri": "pandit",
  "kundli": "kundali", "kundali": "kundali", "horoscope": "kundali",
  "grah": "griha", "graha": "griha",
  "sarap": "sarp"
};

const DEITY_MAP: Record<string, string> = {
  "shiv": "shiva", "shankar": "shiva", "mahadev": "shiva", "bholenath": "shiva", "mahakal": "shiva",
  "krishna": "krishna", "kanha": "krishna", "gopal": "krishna", "govind": "krishna", "bihari": "krishna",
  "ganesh": "ganesh", "ganpati": "ganesh", "vinayak": "ganesh", "vighnaharta": "ganesh",
  "durga": "durga", "sherawali": "durga", "mata": "durga", "devi": "durga", "kalyani": "durga",
  "ram": "ram", "rama": "ram",
  "lakshmi": "lakshmi", "laxmi": "lakshmi",
  "baglamukhi": "baglamukhi", "baglamujhi": "baglamukhi" // Explicit typo handling just in case
};

// Map abbreviations and fuzzy names to exact states
const STATE_MAP: Record<string, string> = {
  "mp": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh", "madhyapradesh": "Madhya Pradesh",
  "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh", "uttarpradesh": "Uttar Pradesh",
  "mh": "Maharashtra", "maharashtra": "Maharashtra", "maharastra": "Maharashtra",
  "gj": "Gujarat", "gujarat": "Gujarat", "gujrat": "Gujarat",
  "rj": "Rajasthan", "rajasthan": "Rajasthan", "rajastan": "Rajasthan",
  "dl": "Delhi", "delhi": "Delhi", "nd": "Delhi", "new delhi": "Delhi",
  "uk": "Uttarakhand", "uttarakhand": "Uttarakhand", "utrakhand": "Uttarakhand",
  "ap": "Andhra Pradesh", "andhra pradesh": "Andhra Pradesh",
  "tn": "Tamil Nadu", "tamil nadu": "Tamil Nadu", "tamilnadu": "Tamil Nadu",
  "od": "Odisha", "odisha": "Odisha", "orissa": "Odisha",
  "as": "Assam", "assam": "Assam", "asam": "Assam"
};

// Cities listed for direct matching
const CITIES = new Set([
  "ujjain", "varanasi", "kashi", "banaras", "haridwar", "mathura", "ayodhya",
  "tirupati", "puri", "madurai", "nashik", "dwarka", "guwahati", "mumbai", "delhi", "jaipur"
]);

const INTENT_TRIGGERS = {
  PANDIT: ["pandit", "purohit", "pujari", "shastri", "guruji", "acharya"],
  TEMPLE: ["temple", "mandir", "darshan", "dham", "peeth"],
  SERVICE: ["puja", "havan", "katha", "path", "jaap", "vidhi", "sanskar", "shanti", "yagna", "anusthan"]
};

// Recommend Rules embedded for intent extraction
const RECOMMEND_RULES = [
  { keys: ["new home", "naya ghar", "new house", "flat", "shifting", "moving", "griha"], svc: ["griha-pravesh", "satyanarayan-vrat", "ganesh-puja"] },
  { keys: ["marriage", "shaadi", "wedding", "vivah", "engagement", "sagai"], svc: ["wedding", "kundali", "ganesh-puja"] },
  { keys: ["health", "illness", "bimari", "hospital", "surgery", "operation", "recovery"], svc: ["mahamrityunjay", "rudrabhishek", "durga-path"] },
  { keys: ["money", "paisa", "loss", "business", "shop", "office", "job", "career", "promotion"], svc: ["shop-opening", "satyanarayan-diwali", "satyanarayan-katha"] },
  { keys: ["baby", "child", "bachcha", "newborn", "naming", "mundan", "annaprashan"], svc: ["namkaran", "mundan", "annaprashan"] },
  { keys: ["death", "passed away", "father", "mother", "shradh", "pitru", "ancestor", "asthi"], svc: ["pitru-dosh", "antim-sanskar"] },
  { keys: ["planet", "kundali", "dosh", "rahu", "ketu", "shani", "sade sati", "mangal", "horoscope"], svc: ["navgrah-shanti", "kaal-sarp", "satyanarayan-shanti", "kundali"] },
  { keys: ["fear", "obstacle", "rukavat", "problem", "tension", "stress", "peace", "shanti"], svc: ["sunderkand", "havan-yagna", "ganesh-puja"] },
  { keys: ["navratri", "durga", "devi", "mata", "jagran"], svc: ["durga-path", "navratri-sthapana", "katha-jagran"] },
  { keys: ["construction", "plot", "land", "building", "foundation"], svc: ["bhoomi-pujan", "satyanarayan-vrat"] },
  { keys: ["diwali", "lakshmi", "ganesh chaturthi", "holi", "chhath", "festival"], svc: ["satyanarayan-diwali", "ganesh-utsav", "holika-dahan", "chhath"] },
  { keys: ["thread", "janeu", "upanayan", "yagyopavit"], svc: ["janeu"] }
];

// --- 2. Helper Functions ---

// Levenshtein distance for fuzzy matching
function getDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

// Phonetic normalization
function phoneticNormalize(str: string): string {
  let s = str.toLowerCase();
  s = s.replace(/aa/g, "a");
  s = s.replace(/ee/g, "i");
  s = s.replace(/oo/g, "u");
  s = s.replace(/sh/g, "s"); // basic normalization for soundex
  s = s.replace(/bh/g, "b");
  s = s.replace(/dh/g, "d");
  s = s.replace(/ph/g, "f");
  return s;
}

// Check if a word is a close match to target (fuzzy)
function isCloseMatch(word: string, target: string): boolean {
  if (word === target) return true;
  if (word.includes(target) || target.includes(word)) return true;
  
  const dist = getDistance(word, target);
  if (target.length <= 4 && dist <= 1) return true;
  if (target.length > 4 && dist <= 2) return true;
  
  // Try phonetic
  if (getDistance(phoneticNormalize(word), phoneticNormalize(target)) <= 1) return true;

  return false;
}

// Global lookup for correction
function fuzzyLookup(word: string, dictionary: Set<string> | string[]): string | null {
  for (const dictWord of dictionary) {
    if (isCloseMatch(word, dictWord)) return dictWord;
  }
  return null;
}

// Extract all valid names from our data to use as a dictionary
const ALL_NAMES = new Set([
  ...pandits.flatMap(p => p.name.toLowerCase().split(" ")),
  ...temples.flatMap(t => t.name.toLowerCase().split(" ")),
  ...services.flatMap(s => s.name.toLowerCase().split(" ")),
  "baglamukhi", "satyanarayan", "rudrabhishek", "mahakaleshwar", "trimbakeshwar"
]);

// --- 3. Main Search Engine ---

export interface SearchState {
  rawQuery: string;
  tokens: string[];
  intents: Set<string>;
  entities: {
    city?: string;
    state?: string;
    deity?: string;
    services: string[];
    languages: string[];
  };
  didYouMean: string | null;
  understoodAs: string | null;
}

export interface SearchResults {
  pandits: (Pandit & { score: number })[];
  temples: (Temple & { score: number })[];
  services: (Service & { score: number })[];
  festivals: (Festival & { score: number })[];
  state: SearchState;
}

export class SearchEngine {
  static parse(query: string): SearchState {
    const rawQuery = query.toLowerCase().trim();
    
    // Normalize and tokenize
    let words = rawQuery.replace(/[^\w\s-]/g, "").split(/\s+/);
    
    const state: SearchState = {
      rawQuery,
      tokens: [],
      intents: new Set(),
      entities: {
        services: [],
        languages: []
      },
      didYouMean: null,
      understoodAs: null
    };

    // Life Event / Rule Based Recommendation Check (Full string match first)
    for (const rule of RECOMMEND_RULES) {
      if (rule.keys.some(k => rawQuery.includes(k))) {
        state.entities.services.push(...rule.svc);
        state.intents.add("SERVICE");
      }
    }

    const correctedWords: string[] = [];
    let hasCorrection = false;

    // Process each word
    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      if (!word) continue;

      // Synonym replacement
      if (SYNONYMS[word]) {
        word = SYNONYMS[word];
      }

      // Check state abbreviations/names (multi-word like "madhya pradesh")
      const twoWords = words[i] + " " + (words[i+1] || "");
      if (STATE_MAP[twoWords]) {
        state.entities.state = STATE_MAP[twoWords];
        i++; // skip next word
        continue;
      }
      if (STATE_MAP[word]) {
        state.entities.state = STATE_MAP[word];
        continue;
      }

      if (STOP_WORDS.has(word)) continue;

      // Spell check against dictionary
      let corrected = word;
      // Skip very short words for correction to avoid weird jumps
      if (word.length > 3) {
         const dictMatch = fuzzyLookup(word, ALL_NAMES);
         if (dictMatch && dictMatch !== word) {
           corrected = dictMatch;
           hasCorrection = true;
         }
      }

      correctedWords.push(corrected);

      // Intent Checking
      if (INTENT_TRIGGERS.PANDIT.includes(corrected)) state.intents.add("PANDIT");
      if (INTENT_TRIGGERS.TEMPLE.includes(corrected)) state.intents.add("TEMPLE");
      if (INTENT_TRIGGERS.SERVICE.includes(corrected)) state.intents.add("SERVICE");

      // Entity Checking
      if (CITIES.has(corrected) || fuzzyLookup(corrected, CITIES)) {
        state.entities.city = fuzzyLookup(corrected, CITIES) || corrected;
        // Map Kashi/Banaras to Varanasi
        if (state.entities.city === "kashi" || state.entities.city === "banaras") state.entities.city = "varanasi";
      }

      if (DEITY_MAP[corrected]) {
        state.entities.deity = DEITY_MAP[corrected];
      }

      // Check if word maps to a specific service slug (e.g. "havan" -> "havan-yagna")
      const svcMatch = services.find(s => s.id.includes(corrected) || s.name.toLowerCase().includes(corrected));
      if (svcMatch && !state.entities.services.includes(svcMatch.id)) {
        state.entities.services.push(svcMatch.id);
      }
    }

    state.tokens = correctedWords;
    if (hasCorrection) {
      state.didYouMean = correctedWords.join(" ");
    }

    // Build "Understood as" text
    const uParts = [];
    if (state.intents.has("PANDIT")) uParts.push("Pandit");
    if (state.intents.has("TEMPLE")) uParts.push("Temple");
    if (state.entities.services.length > 0) {
      const svcNames = state.entities.services.map(id => services.find(s => s.id === id)?.name).filter(Boolean);
      if (svcNames.length > 0) uParts.push(`for ${svcNames[0]}`);
    }
    if (state.entities.city) uParts.push(`in ${state.entities.city.charAt(0).toUpperCase() + state.entities.city.slice(1)}`);
    if (state.entities.state && !state.entities.city) uParts.push(`in ${state.entities.state}`);
    
    if (uParts.length > 0) {
      state.understoodAs = uParts.join(" ");
    }

    return state;
  }

  static search(query: string): SearchResults {
    const state = this.parse(query);
    
    let scoredPandits = pandits.map(p => ({ ...p, score: 0 }));
    let scoredTemples = temples.map(t => ({ ...t, score: 0 }));
    let scoredServices = services.map(s => ({ ...s, score: 0 }));
    let scoredFestivals = festivals.map(f => ({ ...f, score: 0 }));

    if (state.tokens.length === 0 && !state.entities.state && state.entities.services.length === 0) {
      return { pandits: [], temples: [], services: [], festivals: [], state };
    }

    const qLower = state.rawQuery;
    const tokens = state.tokens;

    // --- Scoring Pandits ---
    scoredPandits.forEach(p => {
      let score = 0;
      const pStr = `${p.name} ${p.nameHi} ${p.city} ${p.state}`.toLowerCase();
      
      // Exact string match
      if (pStr.includes(qLower)) score += 100;
      
      // Token matching
      tokens.forEach(t => {
        if (pStr.includes(t)) score += 30;
        if (p.langs && p.langs.some(l => l.toLowerCase() === t)) score += 40;
      });

      // Filter/Entity boosting
      if (state.entities.city && p.city.toLowerCase() === state.entities.city) score += 60;
      if (state.entities.state && p.state.toLowerCase() === state.entities.state) score += 60;
      
      // Service association boost (Crucial for "pandit for havan")
      if (state.entities.services.length > 0) {
        if (state.entities.services.some(svc => p.services.includes(svc))) {
          score += 80; // High boost
        }
      }

      // Temple association
      if (state.entities.deity) {
        // Simple heuristic: if the pandit is associated with a temple of this deity
        const panditTemples = p.temples.map(tid => temples.find(t => t.id === tid));
        if (panditTemples.some(t => t?.deity.toLowerCase() === state.entities.deity)) {
          score += 40;
        }
      }

      // Base quality multipliers
      if (p.tier === "Diamond") score += 15;
      if (p.tier === "Gold") score += 10;
      score += p.rating * 2;

      p.score = score;
    });

    // --- Scoring Temples ---
    scoredTemples.forEach(t => {
      let score = 0;
      const tStr = `${t.name} ${t.city} ${t.state} ${t.deity}`.toLowerCase();

      if (tStr.includes(qLower)) score += 100;
      
      tokens.forEach(tok => {
        if (tStr.includes(tok)) score += 30;
      });

      if (state.entities.city && t.city.toLowerCase() === state.entities.city) score += 60;
      if (state.entities.state && t.state.toLowerCase() === state.entities.state) score += 60;
      if (state.entities.deity && t.deity.toLowerCase() === state.entities.deity) score += 80;

      if (state.entities.services.length > 0) {
        if (state.entities.services.some(svc => t.services.includes(svc))) {
          score += 40;
        }
      }

      score += t.rating * 2;
      t.score = score;
    });

    // --- Scoring Services ---
    scoredServices.forEach(s => {
      let score = 0;
      const sStr = `${s.name} ${s.tag} ${s.desc}`.toLowerCase();

      if (sStr.includes(qLower)) score += 100;
      
      tokens.forEach(tok => {
        if (sStr.includes(tok)) score += 30;
      });

      if (state.entities.services.includes(s.id)) score += 90;

      s.score = score;
    });

    // --- Scoring Festivals ---
    scoredFestivals.forEach(f => {
      let score = 0;
      const fStr = `${f.name} ${f.note} ${f.tithi}`.toLowerCase();

      if (fStr.includes(qLower)) score += 100;
      
      tokens.forEach(tok => {
        if (fStr.includes(tok)) score += 30;
      });

      // If a service linked to this festival was matched
      if (f.serviceId && state.entities.services.includes(f.serviceId)) score += 50;

      f.score = score;
    });

    // Contextual pruning (If looking specifically for a temple, demote pandits slightly unless high score)
    if (state.intents.has("TEMPLE") && !state.intents.has("PANDIT")) {
      scoredTemples.forEach(t => { if (t.score > 0) t.score += 50; });
    }
    if (state.intents.has("PANDIT") && !state.intents.has("TEMPLE")) {
      scoredPandits.forEach(p => { if (p.score > 0) p.score += 50; });
    }

    return {
      pandits: scoredPandits.filter(p => p.score > 40).sort((a, b) => b.score - a.score),
      temples: scoredTemples.filter(t => t.score > 40).sort((a, b) => b.score - a.score),
      services: scoredServices.filter(s => s.score > 40).sort((a, b) => b.score - a.score),
      festivals: scoredFestivals.filter(f => f.score > 40).sort((a, b) => b.score - a.score),
      state
    };
  }
}
