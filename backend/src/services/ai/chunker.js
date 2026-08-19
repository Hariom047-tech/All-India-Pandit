/**
 * Content-aware chunking for the PanditSuggest knowledge base.
 *
 * Deliberately NOT "split every 500 characters". Each source file has its own
 * shape and its own unit of meaning, and splitting across that unit destroys
 * the thing that makes retrieval work:
 *
 *   - A problem record's `diagnosis` is what makes the answer land emotionally.
 *     Its `recommendedPujas` is what makes it actionable. Separate them and the
 *     retriever returns half an answer.
 *   - A testimonial only means anything as problem -> action -> result. A
 *     fragment reading "8 saal ka case 2 mahine mein solve ho gaya" with no
 *     context is worse than useless; it is a claim with nothing behind it.
 *
 * Pure functions over parsed JSON. No database, no network, no OpenAI — so the
 * chunking can be run and inspected on its own, which is how the counts in
 * docs/AI_RAG_ARCHITECTURE.md were produced.
 *
 * Every chunk carries:
 *   { sourceRef, title, heading, content, documentType, language,
 *     problemCategories[], intentTags[], deity?, city?, state? }
 *
 * `content` is the text that gets embedded AND stored, so it must read as
 * standalone prose — the embedding sees exactly what a human would.
 */

const { estimateTokens, CHUNK_MAX_TOKENS, CHUNK_TARGET_TOKENS } = require('./config');

/* ── helpers ──────────────────────────────────────────────────────────── */

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/** "Label: value" line, skipped entirely when the value is empty. */
function line(label, value) {
  if (Array.isArray(value)) {
    const items = value.map(clean).filter(Boolean);
    return items.length ? `${label}: ${items.join(', ')}` : '';
  }
  const v = clean(value);
  return v ? `${label}: ${v}` : '';
}

const block = (...lines) => lines.filter(Boolean).join('\n');

/**
 * Last-resort splitter for a section that is genuinely too long.
 * Never splits mid-sentence, and repeats the heading on every part so a
 * retrieved fragment still says what it is about.
 *
 * Tries progressively finer separators. The first version only split on blank
 * lines, which quietly did nothing to the generated sections in
 * baglamukhi-knowledge.json — those are `line()` output joined by single
 * newlines and contain no blank lines at all, so an 8,618-character section
 * sailed through as one 2,159-token chunk. Falling back through single
 * newlines and then sentences means a long section always gets split.
 */
function splitLong(heading, text, maxTokens = CHUNK_MAX_TOKENS) {
  if (estimateTokens(text) <= maxTokens) return [text];

  for (const [sep, join] of [[/\n{2,}/, '\n\n'], [/\n/, '\n'], [/(?<=[.।?!])\s+/, ' ']]) {
    const parts = text.split(sep);
    if (parts.length < 2) continue;          // this separator does not occur

    const out = [];
    let buf = '';
    for (const p of parts) {
      const candidate = buf ? buf + join + p : p;
      if (buf && estimateTokens(candidate) > maxTokens) {
        out.push(buf);
        buf = heading ? `${heading} (contd.)${join}${p}` : p;
      } else {
        buf = candidate;
      }
    }
    if (buf) out.push(buf);

    // Only accept this separator if it actually got everything under the
    // ceiling; otherwise fall through to a finer one.
    if (out.every((c) => estimateTokens(c) <= maxTokens)) return out;
  }

  // A single unbroken sentence longer than the ceiling. Hard-cut on characters
  // rather than return something that will overflow the prompt.
  const approxChars = maxTokens * 3;
  const out = [];
  for (let i = 0; i < text.length; i += approxChars) out.push(text.slice(i, i + approxChars));
  return out;
}

/**
 * Group small items (FAQs, glossary entries) up to a token target.
 *
 * Targets CHUNK_TARGET_TOKENS, not the maximum: a group is flushed only once
 * adding the next item would exceed the budget, so the finished group can
 * overshoot by one item. Aiming at the 800 ceiling therefore produced 806- and
 * 838-token chunks. Aiming at 600 leaves headroom for that overshoot.
 *
 * An item that is on its own larger than the ceiling gets its own group, which
 * splitLong then handles at the call site.
 */
function groupSmall(items, render, targetTokens = CHUNK_TARGET_TOKENS) {
  const groups = [];
  let buf = [];
  let tokens = 0;
  for (const item of items) {
    const t = estimateTokens(render(item));
    if (buf.length && tokens + t > targetTokens) {
      groups.push(buf);
      buf = [];
      tokens = 0;
    }
    buf.push(item);
    tokens += t;
  }
  if (buf.length) groups.push(buf);
  return groups;
}

/* ── 1. problems-solutions.json  (the core asset) ─────────────────────── */
/**
 * One chunk per problem, never split.
 *
 * `userMightSay` is embedded VERBATIM and first. Those are the sentences
 * devotees actually type, in their own spelling and register — they are the
 * single strongest retrieval signal in the whole corpus, because they live in
 * the same space as the incoming query. Paraphrasing them into tidy English
 * would throw that away.
 */
function chunkProblems(records) {
  return records.map((p) => {
    const pujas = (p.recommendedPujas || []).map((pu) => block(
      `  ${clean(pu.name)}`,
      line('  Vivaran', pu.description),
      line('  Avadhi', pu.duration),
      line('  Shubh din', pu.bestDay),
      line('  Samagri', pu.samagriList),
      line('  Shastra', pu.shastraReference),
    )).filter(Boolean).join('\n\n');

    const diy = p.diyRemedy ? block(
      `Ghar par kya kar sakte hain — ${clean(p.diyRemedy.title)}`,
      ...(p.diyRemedy.steps || []).map((s, i) => `  ${i + 1}. ${clean(s)}`),
      line('  Saamagri', p.diyRemedy.itemsNeeded),
      line('  Kitni baar', p.diyRemedy.frequency),
      line('  Kitne din', p.diyRemedy.duration),
    ) : '';

    const content = block(
      `Samasya: ${clean(p.id).replace(/-/g, ' ')}`,
      (p.userMightSay || []).length
        ? `Log aksar aise kehte hain:\n${p.userMightSay.map((s) => `  "${clean(s)}"`).join('\n')}`
        : '',
      p.diagnosis ? `\nSamajh: ${clean(p.diagnosis)}` : '',
      pujas ? `\nParamparagat roop se ki jaane wali puja:\n${pujas}` : '',
      diy ? `\n${diy}` : '',
      p.connectToPandit?.why ? `\nPandit ji kyun: ${clean(p.connectToPandit.why)}` : '',
      line('\nUrgency', p.urgencyLevel),
    );

    return {
      sourceRef: `problems-solutions.json#${p.id}`,
      title: clean(p.id).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      heading: null,
      content,
      documentType: 'spiritual_guidance',
      language: 'hinglish',
      // Both the leaf id and its group, so a query matching either boosts.
      problemCategories: [p.id, p.problemCategory].filter(Boolean),
      intentTags: [p.problemCategory, ...(p.relatedProblems || [])].filter(Boolean),
    };
  });
}

/* ── 2. real-experiences.json ─────────────────────────────────────────── */
/**
 * One chunk per testimonial. These are what make an answer feel understood, so
 * the problem description is kept in the devotee's own words.
 *
 * The identity fields (name, city, age) are kept because a testimonial with no
 * attribution reads as invented — but nothing here is ever presented as a
 * promise of the same outcome. See AI_KNOWLEDGE_GUIDE.md §6.
 */
function chunkTestimonials(doc) {
  const disclaimer = clean(doc.disclaimer);
  return (doc.testimonials || []).map((t) => ({
    sourceRef: `real-experiences.json#${t.id}`,
    title: `Anubhav: ${clean(t.problemCategory)} — ${clean(t.name) || 'devotee'}`,
    heading: null,
    content: block(
      line('Vyakti', [clean(t.name), clean(t.city)].filter(Boolean).join(', ')),
      line('Samasya', t.problemDescription),
      line('Kya kiya', t.whatTheyDid),
      line('Kya hua', t.result),
      line('Kitne samay mein', t.timeToResult),
      line('Pandit ji ki salah', t.panditGuidance),
      disclaimer ? `\n(${disclaimer})` : '',
    ),
    documentType: 'testimonial',
    language: 'hinglish',
    problemCategories: [t.problemCategory].filter(Boolean),
    intentTags: [t.problemCategory].filter(Boolean),
    city: clean(t.city) || null,
  }));
}

/* ── 3. baglamukhi-knowledge.json ─────────────────────────────────────── */
/**
 * Mixed shapes, so mixed strategies: one chunk per havan/mantra/temple/story,
 * grouped chunks for the 150 FAQs and 100 glossary terms (each far too small to
 * embed alone), and heading-preserving splits for the long prose sections.
 */
function chunkBaglamukhi(doc) {
  const out = [];
  const base = {
    documentType: 'deity',
    language: 'hinglish',
    deity: 'Maa Baglamukhi',
    problemCategories: [],
    intentTags: ['baglamukhi'],
  };

  // Long prose sections — one chunk each, split only if genuinely oversized.
  for (const [key, heading, type] of [
    ['about', 'Maa Baglamukhi — parichay', 'deity'],
    ['nalkheda', 'Maa Baglamukhi Mandir, Nalkheda', 'temple'],
    ['kavach', 'Baglamukhi Kavach', 'anushthan'],
    ['yantra', 'Baglamukhi Yantra', 'anushthan'],
    ['sadhanaGuide', 'Sadhana guide', 'anushthan'],
    ['theology', 'Theology', 'deity'],
    ['dosAndDonts', 'Kya karein, kya na karein', 'faq'],
    ['resultTimelines', 'Result timelines', 'faq'],
  ]) {
    const section = doc[key];
    if (!section) continue;
    const text = typeof section === 'string'
      ? section
      : Object.entries(section)
        .map(([k, v]) => line(k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
          Array.isArray(v) ? v : (typeof v === 'object' && v !== null ? JSON.stringify(v) : v)))
        .filter(Boolean).join('\n');
    if (!clean(text)) continue;

    splitLong(heading, `${heading}\n\n${text}`).forEach((part, i) => out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#${key}${i ? `-${i}` : ''}`,
      title: heading,
      heading,
      content: part,
      documentType: type,
      city: key === 'nalkheda' ? 'Nalkheda' : null,
      state: key === 'nalkheda' ? 'Madhya Pradesh' : null,
    }));
  }

  // One chunk per havan — these are the retrievable "what should I do" units.
  for (const h of doc.havanTypes || []) {
    out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#havan-${h.id}`,
      title: clean(h.name),
      heading: clean(h.name),
      content: block(
        `${clean(h.name)}${h.nameEnglish ? ` (${clean(h.nameEnglish)})` : ''}`,
        line('Uddeshya', h.purpose),
        line('Kab karein', h.whenToPerform),
        line('Avadhi', h.duration),
        line('Mantra jaap', h.mantraCount),
        line('Samagri', h.samagriList),
      ),
      documentType: 'havan',
      intentTags: ['baglamukhi', clean(h.id)].filter(Boolean),
    });
  }

  for (const m of doc.mantras || []) {
    out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#mantra-${clean(m.name).toLowerCase().replace(/\s+/g, '-')}`,
      title: clean(m.name),
      heading: clean(m.name),
      content: block(
        clean(m.name),
        line('Mantra', m.mantraText),
        line('Arth', m.meaning),
        line('Kab japein', m.whenToChant),
        line('Kaise japein', m.howToChant),
        line('Sankhya', m.count),
        line('Srot', m.origin),
      ),
      documentType: 'anushthan',
    });
  }

  // Index in the sourceRef, not just the slugified name: two entries here are
  // both called "Baglamukhi Mandir" (different states), which collapsed to one
  // sourceRef — and uq_ai_doc_source_ref would have made the second silently
  // overwrite the first, losing a temple.
  for (const [i, t] of (doc.temples || []).entries()) {
    out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#temple-${i}-${clean(t.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: [clean(t.name), clean(t.location)].filter(Boolean).join(', '),
      heading: clean(t.name),
      content: block(clean(t.name), line('Sthaan', t.location), line('Rajya', t.state), line('Mahatva', t.significance)),
      documentType: 'temple',
      state: clean(t.state) || null,
    });
  }

  for (const [i, s] of (doc.stories || []).entries()) {
    out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#story-${i}`,
      title: clean(s.title),
      heading: clean(s.title),
      content: block(clean(s.title), clean(s.content)),
      documentType: 'deity',
    });
  }

  // 150 FAQs, each a couple of lines — grouped so a chunk carries real signal.
  groupSmall(doc.faq || [], (f) => `${clean(f.q)}\n${clean(f.a)}`).forEach((group, i) => out.push({
    ...base,
    sourceRef: `baglamukhi-knowledge.json#faq-${i}`,
    title: `Baglamukhi FAQ ${i + 1}`,
    heading: 'Aksar pooche jaane wale sawal',
    content: block('Aksar pooche jaane wale sawal',
      ...group.map((f) => `\nQ: ${clean(f.q)}\nA: ${clean(f.a)}`)),
    documentType: 'faq',
  }));

  groupSmall(doc.glossaryOfTerms || [], (g) => `${clean(g.term)}: ${clean(g.meaning)}`)
    .forEach((group, i) => out.push({
      ...base,
      sourceRef: `baglamukhi-knowledge.json#glossary-${i}`,
      title: `Shabdavali ${i + 1}`,
      heading: 'Shabdavali',
      content: block('Shabdavali', ...group.map((g) => `${clean(g.term)}: ${clean(g.meaning)}`)),
      documentType: 'faq',
    }));

  return out;
}

/* ── 4. puja-vidhi-guide.json ─────────────────────────────────────────── */
function chunkPujaVidhi(records) {
  return records.map((p) => ({
    sourceRef: `puja-vidhi-guide.json#${p.id}`,
    title: clean(p.name),
    heading: clean(p.name),
    content: block(
      `${clean(p.name)}${p.nameEnglish ? ` (${clean(p.nameEnglish)})` : ''}`,
      line('Devta', p.deity),
      line('Vivaran', p.description),
      line('Kab karein', p.whenToPerform),
      line('Avadhi', p.duration),
      line('Samagri', p.samagriList),
      (p.vidhiSteps || []).length ? `Vidhi:\n${p.vidhiSteps.map((s, i) => `  ${i + 1}. ${clean(s)}`).join('\n')}` : '',
      line('Mantra', p.mantras),
      line('Paramparagat uddeshya', p.benefits),
      line('Shastra', p.shastraReference),
      line('Ghar par ho sakti hai', p.canDoAtHome === true ? 'Haan' : p.canDoAtHome === false ? 'Nahi' : ''),
    ),
    documentType: 'puja',
    language: 'hinglish',
    problemCategories: [],
    intentTags: [clean(p.category)].filter(Boolean),
    deity: clean(p.deity) || null,
  }));
}

/* ── 5. diy-remedies.json ─────────────────────────────────────────────── */
function chunkRemedies(records) {
  return records.map((r) => ({
    sourceRef: `diy-remedies.json#${r.id}`,
    title: clean(r.title),
    heading: clean(r.title),
    content: block(
      `${clean(r.title)}${r.titleEnglish ? ` (${clean(r.titleEnglish)})` : ''}`,
      line('Vivaran', r.description),
      line('Saamagri', r.itemsNeeded),
      (r.steps || []).length ? `Vidhi:\n${r.steps.map((s, i) => `  ${i + 1}. ${clean(s)}`).join('\n')}` : '',
      line('Sabse achha samay', r.bestTime),
      line('Kitni baar', r.frequency),
      line('Kitne din', r.duration),
      line('Paramparagat uddeshya', r.expectedBenefit),
      line('Savdhani', r.precautions),
      line('Shastra', r.shastraReference),
    ),
    documentType: 'remedy',
    language: 'hinglish',
    problemCategories: [],
    intentTags: [clean(r.category)].filter(Boolean),
  }));
}

/* ── 6. herbs-encyclopedia.json ───────────────────────────────────────── */
function chunkHerbs(records) {
  return records.map((h) => ({
    sourceRef: `herbs-encyclopedia.json#${h.id}`,
    title: clean(h.nameHindi) || clean(h.nameEnglish),
    heading: clean(h.nameHindi) || clean(h.nameEnglish),
    content: block(
      [clean(h.nameHindi), clean(h.nameEnglish), clean(h.nameSanskrit)].filter(Boolean).join(' / '),
      line('Vivaran', h.description),
      line('Havan mein prayog', h.havanUse),
      line('Aadhyatmik mahatva', h.spiritualBenefit),
      line('Ayurvedic', h.ayurvedicBenefit),
      line('Vaigyanik note', h.scientificNote),
      line('In rituals mein', h.usedInRituals),
      line('Savdhani', h.precaution),
    ),
    documentType: 'remedy',
    language: 'hinglish',
    problemCategories: [],
    intentTags: ['samagri', clean(h.category)].filter(Boolean),
  }));
}

/* ── 7. bhagavad-gita.json ────────────────────────────────────────────── */
/**
 * Chapter summary as its own chunk, then verses grouped to the token target
 * with the chapter heading repeated. Verse-by-verse chunks would be ~700 tiny
 * embeddings that each lack context; whole chapters would blow the budget.
 *
 * Ingested at TYPE_WEIGHTS.scripture (0.60) so the Gita cannot outrank a
 * purpose-written problem record for a practical question.
 */
function chunkGita(doc) {
  const out = [];
  for (const ch of doc.chapters || []) {
    const heading = `Bhagavad Gita — Adhyay ${ch.chapterNumber}: ${clean(ch.name)}${ch.translation ? ` (${clean(ch.translation)})` : ''}`;
    const common = {
      documentType: 'scripture',
      language: 'hi',
      problemCategories: ['spiritual'],
      intentTags: ['bhagavad-gita', 'spiritual_growth'],
      title: heading,
      heading,
    };

    if (clean(ch.summary)) {
      out.push({
        ...common,
        sourceRef: `bhagavad-gita.json#ch${ch.chapterNumber}-summary`,
        content: block(heading, clean(ch.summary)),
      });
    }

    const render = (v) => block(
      `${ch.chapterNumber}.${v.verse}`,
      clean(v.slok),
      clean(v.tej),
    );
    groupSmall(ch.verses || [], render).forEach((group, i) => out.push({
      ...common,
      sourceRef: `bhagavad-gita.json#ch${ch.chapterNumber}-v${i}`,
      content: block(heading, ...group.map(render)),
    }));
  }
  return out;
}

/* ── registry ─────────────────────────────────────────────────────────── */
/**
 * file -> chunker. `verified` marks content we are willing to ground a devotee
 * -facing answer on. Everything here is curated, so all are true; admin-authored
 * articles start unverified and require an explicit publish.
 */
const SOURCES = [
  { file: 'custom/problems-solutions.json', chunk: chunkProblems },
  { file: 'custom/real-experiences.json', chunk: chunkTestimonials },
  { file: 'custom/baglamukhi-knowledge.json', chunk: chunkBaglamukhi },
  { file: 'custom/puja-vidhi-guide.json', chunk: chunkPujaVidhi },
  { file: 'custom/diy-remedies.json', chunk: chunkRemedies },
  { file: 'custom/herbs-encyclopedia.json', chunk: chunkHerbs },
  { file: 'scriptures/bhagavad-gita.json', chunk: chunkGita },
];

/**
 * Chunk one already-parsed file. Returns [] for an unknown filename.
 *
 * Final safety net, applied uniformly so no adapter can leak an oversized or
 * colliding chunk into the index:
 *   1. drop empties
 *   2. split anything still over the ceiling
 *   3. guarantee sourceRef uniqueness — the DB has a unique index on it, and a
 *      collision there is a silent overwrite rather than an error
 */
function chunkFile(fileName, parsed) {
  const entry = SOURCES.find((s) => s.file === fileName || s.file.endsWith(`/${fileName}`));
  if (!entry) return [];

  const expanded = [];
  for (const c of entry.chunk(parsed) || []) {
    if (!clean(c.content)) continue;
    const parts = splitLong(c.heading, c.content);
    parts.forEach((content, i) => expanded.push({
      ...c,
      content,
      sourceRef: parts.length > 1 ? `${c.sourceRef}~${i}` : c.sourceRef,
    }));
  }

  const used = new Set();
  return expanded.map((c) => {
    let ref = c.sourceRef;
    for (let n = 2; used.has(ref); n += 1) ref = `${c.sourceRef}~dup${n}`;
    used.add(ref);
    return {
      ...c,
      sourceRef: ref,
      problemCategories: c.problemCategories || [],
      intentTags: [...new Set((c.intentTags || []).filter(Boolean))],
      tokens: estimateTokens(c.content),
    };
  });
}

module.exports = {
  SOURCES,
  chunkFile,
  // exported for tests
  chunkProblems, chunkTestimonials, chunkBaglamukhi,
  chunkPujaVidhi, chunkRemedies, chunkHerbs, chunkGita,
  splitLong, groupSmall,
};
