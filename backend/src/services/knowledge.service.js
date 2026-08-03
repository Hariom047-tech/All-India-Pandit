const fs = require('fs');
const path = require('path');

class KnowledgeService {
  constructor() {
    this.knowledge = {};
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    
    const dataDir = path.join(__dirname, '..', 'data', 'knowledge');
    
    // Load all custom knowledge
    try {
      this.knowledge.baglamukhi = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'baglamukhi-knowledge.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.herbs = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'herbs-encyclopedia.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.problems = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'problems-solutions.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.diy = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'diy-remedies.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.pujaVidhi = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'puja-vidhi-guide.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.experiences = JSON.parse(fs.readFileSync(path.join(dataDir, 'custom', 'real-experiences.json'), 'utf8'));
    } catch(e) {}
    try {
      this.knowledge.gita = JSON.parse(fs.readFileSync(path.join(dataDir, 'scriptures', 'bhagavad-gita.json'), 'utf8'));
    } catch(e) {}
    
    // Build search index
    this._buildSearchIndex();
    this.loaded = true;
    console.log('✅ Knowledge base loaded: ~7 files');
  }

  _buildSearchIndex() {
    // Create keyword-to-section mappings for fast retrieval
    this.searchIndex = {
      // Problem keywords -> problemCategory mapping
      problemKeywords: {},
      // Herb keywords
      herbKeywords: {},
      // Puja keywords
      pujaKeywords: {},
    };
    
    // Index problems
    if (this.knowledge.problems && this.knowledge.problems.problems) {
      for (const problem of this.knowledge.problems.problems) {
        const keywords = [
          ...(problem.userMightSay || []),
          problem.problemCategory,
          problem.id
        ].map(k => k?.toLowerCase()).filter(Boolean);
        
        for (const kw of keywords) {
          if (!this.searchIndex.problemKeywords[kw]) {
            this.searchIndex.problemKeywords[kw] = [];
          }
          this.searchIndex.problemKeywords[kw].push(problem);
        }
      }
    }
    
    // Index herbs
    if (this.knowledge.herbs && this.knowledge.herbs.herbs) {
      for (const herb of this.knowledge.herbs.herbs) {
        const keywords = [
          herb.nameHindi, herb.nameEnglish, herb.nameSanskrit, herb.id
        ].map(k => k?.toLowerCase()).filter(Boolean);
        
        for (const kw of keywords) {
          this.searchIndex.herbKeywords[kw] = herb;
        }
      }
    }
  }

  // Smart context retrieval based on user query
  getRelevantContext(userQuery) {
    const query = userQuery.toLowerCase();
    let context = [];
    
    // 1. Always include Baglamukhi about section (compact)
    context.push(`## Maa Baglamukhi Info\n${JSON.stringify(this.knowledge.baglamukhi?.about || {}, null, 0)}`);
    
    // 2. Check for problem matching
    if (this.knowledge.problems?.problems) {
      const matchedProblems = this.knowledge.problems.problems.filter(p => {
        const searchFields = [
          p.id, p.problemCategory,
          ...(p.userMightSay || [])
        ].join(' ').toLowerCase();
        
        return query.split(' ').some(word => 
          word.length > 2 && searchFields.includes(word)
        );
      }).slice(0, 3);
      
      if (matchedProblems.length > 0) {
        context.push(`## Matched Problems & Solutions\n${JSON.stringify(matchedProblems, null, 0)}`);
      }
    }
    
    // 3. Check for herb mentions
    if (this.knowledge.herbs?.herbs) {
      const matchedHerbs = this.knowledge.herbs.herbs.filter(h => {
        const names = [h.nameHindi, h.nameEnglish, h.nameSanskrit, h.id]
          .filter(Boolean).join(' ').toLowerCase();
        return query.split(' ').some(word => word.length > 2 && names.includes(word));
      }).slice(0, 5);
      
      if (matchedHerbs.length > 0) {
        context.push(`## Relevant Herbs\n${JSON.stringify(matchedHerbs, null, 0)}`);
      }
    }
    
    // 4. Check for puja/havan mentions
    if (this.knowledge.pujaVidhi?.pujas) {
      const matchedPujas = this.knowledge.pujaVidhi.pujas.filter(p => {
        const searchFields = [p.name, p.nameEnglish, p.id, p.deity, p.description]
          .filter(Boolean).join(' ').toLowerCase();
        return query.split(' ').some(word => word.length > 2 && searchFields.includes(word));
      }).slice(0, 3);
      
      if (matchedPujas.length > 0) {
        context.push(`## Relevant Puja Procedures\n${JSON.stringify(matchedPujas, null, 0)}`);
      }
    }
    
    // 5. Check for DIY remedy mentions
    if (this.knowledge.diy?.remedies) {
      const matchedDiy = this.knowledge.diy.remedies.filter(r => {
        const searchFields = [r.title, r.titleEnglish, r.id, r.description, r.category]
          .filter(Boolean).join(' ').toLowerCase();
        return query.split(' ').some(word => word.length > 2 && searchFields.includes(word));
      }).slice(0, 3);
      
      if (matchedDiy.length > 0) {
        context.push(`## DIY Home Remedies\n${JSON.stringify(matchedDiy, null, 0)}`);
      }
    }
    
    // 6. Check for Baglamukhi-specific queries (havan, mantra, kavach, yantra, nalkheda)
    const baglaKeywords = ['baglamukhi', 'bagla', 'pitambari', 'pitambara', 'stambhan', 'nalkheda', 'havan', 'mantra', 'kavach', 'yantra', 'mahavidya'];
    if (baglaKeywords.some(kw => query.includes(kw))) {
      // Include detailed havan types
      if (this.knowledge.baglamukhi?.havanTypes) {
        context.push(`## Baglamukhi Havan Types\n${JSON.stringify(this.knowledge.baglamukhi.havanTypes, null, 0)}`);
      }
      // Include mantras
      if (this.knowledge.baglamukhi?.mantras) {
        context.push(`## Baglamukhi Mantras\n${JSON.stringify(this.knowledge.baglamukhi.mantras, null, 0)}`);
      }
      // Include Nalkheda info
      if (query.includes('nalkheda') || query.includes('mandir') || query.includes('temple')) {
        context.push(`## Nalkheda Temple\n${JSON.stringify(this.knowledge.baglamukhi?.nalkheda || {}, null, 0)}`);
      }
      // Include kavach/yantra
      if (query.includes('kavach')) {
        context.push(`## Baglamukhi Kavach\n${JSON.stringify(this.knowledge.baglamukhi?.kavach || {}, null, 0)}`);
      }
      if (query.includes('yantra')) {
        context.push(`## Baglamukhi Yantra\n${JSON.stringify(this.knowledge.baglamukhi?.yantra || {}, null, 0)}`);
      }
      // FAQs
      if (this.knowledge.baglamukhi?.faq) {
        const matchedFaqs = this.knowledge.baglamukhi.faq.filter(f => {
          const searchText = [f.question, f.answer].join(' ').toLowerCase();
          return query.split(' ').some(word => word.length > 2 && searchText.includes(word));
        }).slice(0, 5);
        if (matchedFaqs.length > 0) {
          context.push(`## Related FAQs\n${JSON.stringify(matchedFaqs, null, 0)}`);
        }
      }
    }
    
    // 7. Include relevant real experiences (always include 2-3 for relatability)
    if (this.knowledge.experiences?.testimonials) {
      const matchedExps = this.knowledge.experiences.testimonials.filter(e => {
        const searchFields = [e.problemCategory, e.problemDescription, e.whatTheyDid, e.result]
          .filter(Boolean).join(' ').toLowerCase();
        return query.split(' ').some(word => word.length > 2 && searchFields.includes(word));
      }).slice(0, 3);
      
      if (matchedExps.length > 0) {
        context.push(`## Real Devotee Experiences\n${JSON.stringify(matchedExps, null, 0)}`);
      }
    }
    
    // 8. Gita quotes - if spiritual/motivational context
    const gitaKeywords = ['gita', 'bhagavad', 'krishna', 'arjun', 'karma', 'dharma', 'motivat', 'himmat', 'hausla'];
    if (gitaKeywords.some(kw => query.includes(kw)) && this.knowledge.gita?.chapters) {
      // Get a random relevant verse
      const chapter = this.knowledge.gita.chapters[Math.floor(Math.random() * 3)]; // First 3 chapters
      if (chapter?.verses?.length > 0) {
        const verse = chapter.verses[Math.floor(Math.random() * Math.min(5, chapter.verses.length))];
        context.push(`## Bhagavad Gita Verse\nChapter ${chapter.chapterNumber}: ${chapter.name}\n${JSON.stringify(verse, null, 0)}`);
      }
    }
    
    return context.join('\n\n---\n\n');
  }
}

module.exports = new KnowledgeService();
