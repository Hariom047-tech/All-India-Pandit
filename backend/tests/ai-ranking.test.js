/**
 * Ranking + intent tests. No database, no network, no API key.
 *
 * Scoring was written as pure functions specifically so these can run — a
 * ranking engine that can only be checked against a live database is a ranking
 * engine nobody checks.
 *
 *   npm run test:ranking
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  scoreCandidate, rankCandidates, bayesianRating, matchLabel, toPublicCard, WEIGHT_DEFAULTS,
} = require('../src/services/ai/ranking.service');
const {
  extractIntent, detectLanguage, safetyCheck, mergeMemory, needsClarification,
} = require('../src/services/ai/intent.service');

const NOW = '2026-08-12T00:00:00Z';

/** Minimal candidate row in the shape CANDIDATE_SQL returns. */
function candidate(over = {}) {
  return {
    id: over.id || 'p-1',
    slug: 'pandit-x',
    full_name: 'Pandit X',
    title: 'Pandit',
    short_bio: 'Vedic priest',
    profile_photo_url: 'https://example/p.jpg',
    video_intro_url: null,
    experience_years: 8,
    completed_ceremonies: 40,
    avg_rating: '4.6',            // node-postgres returns NUMERIC as a string
    review_count: 50,
    verification_status: 'verified',
    video_kyc_completed: true,
    is_available: true,
    accepts_online: false,
    subscription_expires_at: null,
    specializations: ['Havan'],
    primary_specialization: 'Havan',
    whatsapp_number: '9999999999',
    city: 'Nalkheda',
    state: 'Madhya Pradesh',
    service_offers_online: false,
    service_reviews: 12,
    service_rating: '4.7',
    serves_temple: true,
    same_city: true,
    same_state: true,
    last_lead_at: '2026-08-01T00:00:00Z',
    leads_90d: 10,
    leads_completed: 6,
    ...over,
  };
}

const ctx = { serviceName: 'Baglamukhi Havan', templeName: 'Nalkheda', now: NOW };

/* ── Bayesian rating ──────────────────────────────────────────────────── */

test('Bayesian shrinkage: 5.0 x2 reviews loses to 4.8 x300', () => {
  const a = bayesianRating(5.0, 2);
  const b = bayesianRating(4.8, 300);
  assert.ok(b > a, `expected 4.8x300 (${b.toFixed(2)}) to beat 5.0x2 (${a.toFixed(2)})`);
  assert.ok(Math.abs(a - 4.364) < 0.01, `got ${a}`);
  assert.ok(Math.abs(b - 4.769) < 0.01, `got ${b}`);
});

test('zero reviews assumes the platform mean, not zero', () => {
  // Scoring an unrated pandit as 0 would permanently bury every new arrival.
  assert.strictEqual(bayesianRating(0, 0), 4.3);
});

test('a large review count converges on the raw average', () => {
  assert.ok(Math.abs(bayesianRating(4.5, 5000) - 4.5) < 0.01);
});

/* ── weights ──────────────────────────────────────────────────────────── */

test('the eight ranking weights sum to exactly 1.00', () => {
  const sum = Object.entries(WEIGHT_DEFAULTS)
    .filter(([k]) => k.startsWith('weight.'))
    .reduce((a, [, v]) => a + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}, so scores would not be 0–1`);
});

test('score is always within 0–1', () => {
  const best = scoreCandidate(candidate({
    completed_ceremonies: 5000, review_count: 5000, avg_rating: '5.0', service_reviews: 5000,
    experience_years: 60, leads_90d: 10, leads_completed: 10, last_lead_at: NOW,
  }), ctx).score;
  const worst = scoreCandidate(candidate({
    completed_ceremonies: 0, review_count: 0, avg_rating: '0', service_reviews: 0,
    experience_years: 0, profile_photo_url: null, short_bio: null, bio: null,
    video_intro_url: null, specializations: [], video_kyc_completed: false,
    serves_temple: false, same_city: false, same_state: false,
    last_lead_at: null, leads_90d: 0, leads_completed: 0, is_available: false,
  }), ctx).score;
  assert.ok(best <= 1 && best > 0.8, `best=${best}`);
  assert.ok(worst >= 0 && worst < 0.5, `worst=${worst}`);
});

/* ── the fixture from AI_RANKING_ENGINE.md §5 ─────────────────────────── */

test('documented fixture ranks A first, then C, then B', () => {
  // A: exact service + exact temple, 4.8 x300
  // B: exact service, wrong city,     5.0 x5
  // C: general puja, exact location,  4.9 x500
  const A = candidate({
    id: 'A', full_name: 'Pandit A', avg_rating: '4.8', review_count: 300,
    service_reviews: 120, serves_temple: true, same_city: true, same_state: true,
    specializations: ['Baglamukhi Havan'], primary_specialization: 'Baglamukhi Havan',
  });
  const B = candidate({
    id: 'B', full_name: 'Pandit B', avg_rating: '5.0', review_count: 5,
    service_reviews: 3, serves_temple: false, same_city: false, same_state: false,
    city: 'Delhi', state: 'Delhi',
    specializations: ['Baglamukhi Havan'], primary_specialization: 'Baglamukhi Havan',
  });
  const C = candidate({
    id: 'C', full_name: 'Pandit C', avg_rating: '4.9', review_count: 500,
    service_reviews: 2, serves_temple: true, same_city: true, same_state: true,
    specializations: ['General Puja'], primary_specialization: 'General Puja',
  });

  const ranked = rankCandidates([B, C, A], ctx, WEIGHT_DEFAULTS, 3);
  assert.deepStrictEqual(ranked.map((p) => p.panditId), ['A', 'C', 'B']);
});

test('service-specific experience beats total years', () => {
  // 10 years / 2 havans vs 7 years / 500 havans, everything else equal.
  const generalist = candidate({ id: 'gen', experience_years: 10, service_reviews: 2 });
  const specialist = candidate({ id: 'spec', experience_years: 7, service_reviews: 500 });
  const g = scoreCandidate(generalist, ctx).factors.serviceExperience;
  const s = scoreCandidate(specialist, ctx).factors.serviceExperience;
  assert.ok(s > g, `specialist ${s.toFixed(3)} should beat generalist ${g.toFixed(3)}`);
});

test('a named temple outranks the same-city pandit', () => {
  const atTemple = scoreCandidate(candidate({ serves_temple: true }), ctx).factors.locationMatch;
  const inCity = scoreCandidate(candidate({ serves_temple: false, same_city: true }), ctx).factors.locationMatch;
  const farAway = scoreCandidate(
    candidate({ serves_temple: false, same_city: false, same_state: false }), ctx,
  ).factors.locationMatch;
  assert.ok(atTemple > inCity && inCity > farAway);
});

/* ── fairness ─────────────────────────────────────────────────────────── */

test('exploration gives at most one slot, and only above min_score', () => {
  const established = Array.from({ length: 5 }, (_, i) => candidate({
    id: `est-${i}`, review_count: 200, completed_ceremonies: 200, service_reviews: 80,
  }));
  const newcomer = candidate({
    id: 'new', review_count: 1, completed_ceremonies: 0, service_reviews: 0,
    serves_temple: true, same_city: true,
    specializations: ['Baglamukhi Havan'], primary_specialization: 'Baglamukhi Havan',
  });
  const ranked = rankCandidates([...established, newcomer], ctx, WEIGHT_DEFAULTS, 3);
  const newcomers = ranked.filter((p) => p.panditId === 'new');
  assert.ok(newcomers.length <= 1, 'more than one exploration slot was used');
});

test('a weak newcomer is not promoted just for being new', () => {
  const strong = Array.from({ length: 5 }, (_, i) => candidate({ id: `s-${i}` }));
  const weakNew = candidate({
    id: 'weak', review_count: 0, completed_ceremonies: 0, service_reviews: 0,
    experience_years: 0, profile_photo_url: null, short_bio: null, bio: null,
    video_intro_url: null, specializations: [], primary_specialization: '',
    video_kyc_completed: false, serves_temple: false, same_city: false, same_state: false,
    last_lead_at: null, leads_90d: 0, leads_completed: 0,
  });
  const ranked = rankCandidates([...strong, weakNew], ctx, WEIGHT_DEFAULTS, 3);
  assert.ok(!ranked.some((p) => p.panditId === 'weak'), 'a poor match was shown for distribution');
});

test('the same pandit never appears twice', () => {
  const dupe = candidate({ id: 'same' });
  const ranked = rankCandidates([dupe, { ...dupe }, { ...dupe }, candidate({ id: 'other' })],
    ctx, WEIGHT_DEFAULTS, 3);
  assert.strictEqual(new Set(ranked.map((p) => p.panditId)).size, ranked.length);
});

/* ── rotation — Phase 3 audit ─────────────────────────────────────────── */

test('two comparably-relevant candidates can rank differently for different sessions', () => {
  // Near-identical on every scored factor — the AI would have no principled
  // reason to always prefer one over the other. Before rotation, whichever
  // sorted first would win for every visitor, forever.
  const a = candidate({ id: 'twin-a', review_count: 50, completed_ceremonies: 40 });
  const b = candidate({ id: 'twin-b', review_count: 51, completed_ceremonies: 41 });
  const seeds = ['session-1', 'session-2', 'session-3', 'session-4', 'session-5', 'session-6'];
  const winners = new Set(seeds.map((sessionKey) => {
    const ranked = rankCandidates([a, b], { ...ctx, sessionKey }, WEIGHT_DEFAULTS, 2);
    return ranked[0].panditId;
  }));
  assert.ok(winners.size > 1, 'the same twin won slot 1 for every session — rotation is not reaching this tie');
});

test('rotation cannot promote a clearly worse match over a clearly better one', () => {
  const strong = candidate({
    id: 'strong', review_count: 300, completed_ceremonies: 200, service_reviews: 80,
    serves_temple: true, same_city: true,
  });
  const weak = candidate({
    id: 'weak', review_count: 1, completed_ceremonies: 0, service_reviews: 0,
    serves_temple: false, same_city: false, same_state: false,
    last_lead_at: null, leads_90d: 0, leads_completed: 0,
  });
  for (const sessionKey of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
    const ranked = rankCandidates([strong, weak], { ...ctx, sessionKey }, WEIGHT_DEFAULTS, 2);
    assert.strictEqual(ranked[0].panditId, 'strong',
      `weak candidate won slot 1 under sessionKey="${sessionKey}" — rotation noise overpowered relevance`);
  }
});

test('the same session gets the same order — rotation is deterministic, not random', () => {
  const a = candidate({ id: 'r-a', review_count: 50 });
  const b = candidate({ id: 'r-b', review_count: 51 });
  const ctxWithSession = { ...ctx, sessionKey: 'stable-session' };
  const first = rankCandidates([a, b], ctxWithSession, WEIGHT_DEFAULTS, 2).map((p) => p.panditId);
  const second = rankCandidates([a, b], ctxWithSession, WEIGHT_DEFAULTS, 2).map((p) => p.panditId);
  assert.deepStrictEqual(first, second);
});

test('no sessionKey at all still ranks — rotation is additive, never required', () => {
  const a = candidate({ id: 'no-session-a' });
  const b = candidate({ id: 'no-session-b' });
  const ranked = rankCandidates([a, b], ctx, WEIGHT_DEFAULTS, 2);
  assert.strictEqual(ranked.length, 2);
});

test('a higher subscription tier buys no organic ranking', () => {
  const free = scoreCandidate(candidate({ current_tier: 'free' }), ctx).score;
  const paid = scoreCandidate(candidate({ current_tier: 'diamond' }), ctx).score;
  assert.strictEqual(free, paid, 'paid placement leaked into the organic score');
});

/* ── privacy ──────────────────────────────────────────────────────────── */

test('the public card exposes no private field', () => {
  const row = candidate({ public_phone: '9876543210', whatsapp_number: '9876543210' });
  const card = toPublicCard(row, scoreCandidate(row, ctx), ctx);
  const serialised = JSON.stringify(card);
  for (const secret of ['9876543210', 'date_of_birth', 'public_email', 'id_proof']) {
    assert.ok(!serialised.includes(secret), `${secret} leaked into the card`);
  }
  assert.ok(card.name && card.panditId && card.reason);
});

test('the reason string only states facts we hold', () => {
  const row = candidate({ service_reviews: 40, completed_ceremonies: 60 });
  const card = toPublicCard(row, scoreCandidate(row, ctx), ctx);
  assert.match(card.reason, /40 verified reviews|60 ceremonies|Nalkheda/);
  assert.ok(!/\bAI\b|algorithm|our system/i.test(card.reason));
});

test('match labels are words, not false precision', () => {
  assert.strictEqual(matchLabel(0.93), 'Excellent match');
  assert.strictEqual(matchLabel(0.72), 'Strong match');
  assert.ok(!/%/.test(matchLabel(0.93)));
});

/* ── numeric hygiene ──────────────────────────────────────────────────── */

test('NUMERIC-as-string from node-postgres is handled', () => {
  // avg_rating is DECIMAL(3,2); the driver returns "4.60". Treating that as a
  // number without coercion is what blanked the temple page once already.
  const asString = scoreCandidate(candidate({ avg_rating: '4.60', review_count: 50 }), ctx).score;
  const asNumber = scoreCandidate(candidate({ avg_rating: 4.6, review_count: 50 }), ctx).score;
  assert.ok(Math.abs(asString - asNumber) < 1e-9);
});

test('missing and null signals do not produce NaN', () => {
  const { score, factors } = scoreCandidate({ id: 'sparse' }, ctx);
  assert.ok(Number.isFinite(score), 'score is NaN for a sparse row');
  for (const [k, v] of Object.entries(factors)) {
    assert.ok(Number.isFinite(v), `factor ${k} is NaN`);
  }
});

/* ── intent extraction ────────────────────────────────────────────────── */

const VOCAB = {
  temples: [{ id: 't1', name: 'Maa Baglamukhi Temple Nalkheda', city: 'Nalkheda', state: 'Madhya Pradesh' }],
  cities: ['Nalkheda', 'Ujjain', 'Datia'],
  states: ['Madhya Pradesh'],
  deities: ['Maa Baglamukhi', 'Ganesh'],
  categories: [
    { slug: 'business-loss', examplePhrases: ['Business mein bahut loss ho raha hai', 'Vyapar mein rukawat hai'] },
    { slug: 'court-case', examplePhrases: ['Court case chal raha hai, jeet nahi mil rahi'] },
  ],
};

test('language detection across all three registers', () => {
  assert.strictEqual(detectLanguage('व्यापार में रुकावट है'), 'hi');
  assert.strictEqual(detectLanguage('mere business me rukawat aa rahi hai'), 'hinglish');
  assert.strictEqual(detectLanguage('my business is not growing at all'), 'en');
});

test('an explicit temple request is detected and locked', () => {
  const i = extractIntent('Mujhe Maa Baglamukhi Temple Nalkheda me hi havan karvana hai', VOCAB);
  assert.strictEqual(i.temple, 'Maa Baglamukhi Temple Nalkheda');
  assert.strictEqual(i.city, 'Nalkheda');
  assert.strictEqual(i.serviceType, 'havan');
  assert.ok(i.isExplicitRequest);
  assert.ok(i.isLockedToTemple, '"hi" means only there — must not be offered alternatives');
});

test('an explicit request is never met with a clarifying question', () => {
  const i = extractIntent('Maa Baglamukhi Nalkheda me Business Growth Havan karvana hai', VOCAB);
  assert.strictEqual(needsClarification(i, { shouldRecommend: false }), null);
});

test('a vague request does get a clarifying question', () => {
  const i = extractIntent('koi puja batao', VOCAB);
  assert.ok(i.isVague);
  assert.match(needsClarification(i, null), /business|career/i);
});

test('online intent is picked up', () => {
  assert.ok(extractIntent('ghar baithe online puja karani hai', VOCAB).wantsOnline);
  assert.ok(!extractIntent('mandir me jaakar puja karani hai', VOCAB).wantsOnline);
});

test('crisis short-circuits before any recommendation', () => {
  for (const msg of ['I want to kill myself', 'mera jeene ka mann nahi', 'मैं आत्महत्या करना चाहता हूँ']) {
    assert.ok(safetyCheck(msg).crisis, `not detected: ${msg}`);
    assert.ok(extractIntent(msg, VOCAB).crisis);
  }
});

test('ordinary distress is NOT misread as crisis', () => {
  // A false positive here would answer a normal business worry with a
  // helpline, which is its own kind of failure.
  for (const msg of ['business me bahut loss ho raha hai', 'ghar me kalesh hai']) {
    assert.ok(!safetyCheck(msg).crisis, `false positive: ${msg}`);
  }
});

test('sensitive domains are flagged for the disclaimer', () => {
  assert.ok(safetyCheck('mujhe cancer hai kaunsi puja karu').sensitive.includes('medical'));
  assert.ok(safetyCheck('court case chal raha hai').sensitive.includes('legal'));
});

test('memory carries context forward but a new value always wins', () => {
  const carried = mergeMemory(extractIntent('Nalkheda', VOCAB), { problemCategory: 'business-loss' });
  assert.strictEqual(carried.problemCategory, 'business-loss', 'turn-1 problem was lost');
  assert.ok(carried.carriedFromMemory.includes('problemCategory'));

  const overridden = mergeMemory(extractIntent('Ujjain', VOCAB), { city: 'Nalkheda' });
  assert.strictEqual(overridden.city, 'Ujjain', 'memory overrode a fresh explicit value');
});

test('short city names do not match inside longer words', () => {
  const i = extractIntent('datiana village me rehta hoon', { ...VOCAB, cities: ['Datia'] });
  assert.strictEqual(i.city, null, '"Datia" matched inside "datiana"');
});

/* ── the clarification loop ───────────────────────────────────────────── */
/*
 * Regression tests for a real conversation that asked the devotee four
 * questions in a row. They answered every time and were asked again. Nobody
 * stays for a fifth.
 */

const { toMemory, searchText } = require('../src/services/ai/intent.service');

/** Replay a conversation the way pipeline.service does, and count questions. */
function replay(messages, vocab = VOCAB) {
  let memory = {};
  let asked = 0;
  const outcomes = [];
  for (const m of messages) {
    const intent = extractIntent(m, vocab, memory);
    const count = Number(memory.clarifyCount) || 0;
    const q = needsClarification(intent, { shouldRecommend: false }, {
      alreadyAsked: count >= 1,
      hasContext: Boolean(memory.problemCategory || memory.temple || memory.deity),
    });
    if (q) asked += 1;
    outcomes.push(q ? 'ask' : 'answer');
    memory = { ...memory, ...toMemory(intent, q ? { clarifyCount: count + 1 } : {}) };
  }
  return { asked, outcomes, memory };
}

test('the assistant never asks more than once in a conversation', () => {
  // Every one of these got a question in the real transcript.
  const { asked } = replay([
    'mujhe maa baglamukhi mandir me puja karvana h',
    'koi best pandit ji suggest kro',
    'career ke liye',
    'merko business me career bnana h',
    'kam nhi ban rha h',
    'mere kam nhi ban rhe h',
  ]);
  assert.ok(asked <= 1, `asked ${asked} questions — an interrogation, not a conversation`);
});

test('an established temple stops further questions', () => {
  const { outcomes } = replay([
    'mujhe maa baglamukhi mandir me puja karvana h',
    'koi best pandit ji suggest kro',
  ]);
  assert.deepStrictEqual(outcomes, ['answer', 'answer'],
    'the temple was already known — asking again makes the devotee repeat themselves');
});

test('a genuinely blank start still gets ONE question', () => {
  // The fix must not remove clarification altogether.
  const { asked, outcomes } = replay(['koi puja batao', 'business ke liye']);
  assert.strictEqual(asked, 1);
  assert.strictEqual(outcomes[0], 'ask');
  assert.strictEqual(outcomes[1], 'answer');
});

test('abbreviated Hinglish is not misread as English', () => {
  // "merko business me career bnana h" was answered in English mid-conversation
  // because only "me" matched the marker list.
  for (const msg of [
    'merko business me career bnana h',
    'kam nhi ban rha h',
    'mere kam nhi ban rhe h',
    'mujhe puja krni h',
    'kya kru samajh nhi aa rha',
  ]) {
    assert.strictEqual(detectLanguage(msg), 'hinglish', `misread as non-Hinglish: "${msg}"`);
  }
});

test('real English is still detected as English', () => {
  for (const msg of [
    'I want a puja for business growth',
    'my business is not growing at all',
    'which pandit should I contact for this ceremony',
  ]) {
    assert.strictEqual(detectLanguage(msg), 'en', `misread as Hinglish: "${msg}"`);
  }
});

test('a short follow-up is searched together with earlier context', () => {
  // "career ke liye" alone is a hopeless retrieval query.
  const memory = { lastProblemText: 'mujhe maa baglamukhi mandir me puja karvana hai', temple: 'Maa Baglamukhi Mandir' };
  const q = searchText('career ke liye', memory);
  assert.ok(q.includes('career'), 'the new message must survive');
  assert.ok(q.includes('baglamukhi'), 'earlier context was dropped');
  assert.ok(q.length > 'career ke liye'.length);
});

test('a substantial message is searched on its own', () => {
  const long = 'mere business me bahut loss ho raha hai aur customer nahi aa rahe';
  assert.strictEqual(searchText(long, { lastProblemText: 'something else entirely' }), long,
    'a full description must not be polluted with older context');
});

test('memory keeps the devotee\'s own problem description', () => {
  const intent = extractIntent('mere business me bahut loss ho raha hai', VOCAB);
  assert.ok(toMemory(intent).lastProblemText, 'a real description should be remembered');

  const short = extractIntent('haan', VOCAB);
  assert.ok(!toMemory(short).lastProblemText, 'a bare acknowledgement is not a problem statement');
});

/* ── offer, then show ─────────────────────────────────────────────────── */
/*
 * The assistant explains first and ASKS before recommending anyone — except
 * when the devotee already asked outright, in which case offering to do what
 * they just requested is the same insult as re-asking an answered question.
 */

/** Mirrors the decision pipeline.service makes each turn. */
function decide(message, memory = {}, retrieval = { shouldRecommend: true }) {
  const intent = extractIntent(message, VOCAB, memory);
  const clarifyCount = Number(memory.clarifyCount) || 0;
  const ask = needsClarification(intent, retrieval, {
    alreadyAsked: clarifyCount >= 1,
    hasContext: Boolean(memory.problemCategory || memory.temple || memory.deity),
  });
  // Mirrors pipeline.service: isExplicitRequest deliberately does NOT force
  // cards — naming a deity and a ritual is a clear intent, not a request to be
  // shown pandits.
  const showCards = Boolean(
    intent.wantsRecommendations
    || (memory.offeredRecommendations && intent.isAffirmative),
  );
  return { intent, ask, showCards, offer: !showCards && !ask };
}

test('an ordinary problem gets an answer plus an offer, not cards', () => {
  const d = decide('Maa Baglamukhi puja karani hai');
  assert.strictEqual(d.showCards, false, 'cards were pushed before being asked for');
  assert.strictEqual(d.offer, true, 'no offer was made, so the devotee has no next step');
});

test('"haan" after an offer shows the cards', () => {
  for (const yes of ['haan', 'ha', 'ji haan', 'yes', 'ok', 'हाँ', 'zaroor']) {
    const d = decide(yes, { offeredRecommendations: true, problemCategory: 'career' });
    assert.strictEqual(d.showCards, true, `"${yes}" did not accept the offer`);
    assert.strictEqual(d.ask, null, `"${yes}" was met with a question`);
  }
});

test('a yes with no offer pending does not conjure cards', () => {
  assert.strictEqual(decide('haan').showCards, false,
    'agreeing to nothing should not trigger recommendations');
});

test('an outright request skips the offer entirely', () => {
  for (const msg of [
    'mujhe havan krvana best pandit ji suggest kro',
    'business ke liye koi best pandit ji batao',
    'which pandit should I contact for griha pravesh',
    'career ke liye pandit ji chahiye',
  ]) {
    const d = decide(msg);
    assert.strictEqual(d.showCards, true, `"${msg}" should show cards immediately`);
    assert.strictEqual(d.offer, false, `"${msg}" was offered what it already asked for`);
  }
});

test('"nahi" is not read as consent', () => {
  for (const no of ['nahi', 'abhi nahi', 'no', 'nahi chahiye']) {
    const d = decide(no, { offeredRecommendations: true, problemCategory: 'career' });
    assert.strictEqual(d.showCards, false, `"${no}" was treated as a yes`);
  }
});

test('a full sentence is a new question, not an answer to the offer', () => {
  // Loose matching here would show cards for whatever the previous turn was.
  const d = decide('haan lekin pehle ye batao ki kitna kharcha aayega',
    { offeredRecommendations: true, problemCategory: 'career' });
  assert.strictEqual(d.intent.isAffirmative, false,
    'a sentence beginning with "haan" is not a bare yes');
});
