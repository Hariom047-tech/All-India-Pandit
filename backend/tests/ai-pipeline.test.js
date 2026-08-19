/**
 * End-to-end pipeline guarantees — STEP 19.
 *
 * Runs with NO network and NO database. Every external dependency is replaced
 * through require.cache before the pipeline loads, so these assert the wiring
 * and the invariants rather than the infrastructure.
 *
 * What they exist to catch is the class of bug that unit tests miss: a stage
 * correct in isolation, wired wrongly into the whole.
 *
 *   npm run test:pipeline
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

/* ── stubbing ─────────────────────────────────────────────────────────── */

const resolve = (p) => require.resolve(path.join(__dirname, '..', 'src', p));

/** Replace a module in the require cache before anything imports it. */
function stub(relPath, exports) {
  const id = resolve(relPath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

/** Everything the pipeline writes, captured for assertions. */
const written = { messages: [], events: [], analytics: [], memory: [] };

function resetCaptures() {
  written.messages.length = 0;
  written.events.length = 0;
  written.analytics.length = 0;
  written.memory.length = 0;
}

/** Fixtures the stubbed stages return. Mutated per test. */
const scenario = {
  chunks: [],
  confidence: 0.8,
  shouldRecommend: true,
  services: [],
  temples: [],
  pandits: [],
  llmAnswer: 'Paramparagat roop se is samasya ke liye havan kiya jata hai.',
};

stub('config/db.js', {
  query: async () => ({ rows: [] }),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) },
  withUserContext: async (_id, fn) => fn(async () => ({ rows: [] })),
  withAiContext: async (_ctx, fn) => fn(async () => ({ rows: [] })),
});

stub('repositories/ai.repository.js', {
  EVENT_TYPES: new Set(['ai_response_shown', 'pandit_recommended', 'service_recommended', 'temple_recommended']),
  getOrCreateConversation: async ({ conversationId }) => ({
    id: conversationId || 'conv-1', user_id: null, session_key: 'k', memory: {}, message_count: 0,
  }),
  addMessage: async (convId, userId, msg) => {
    written.messages.push({ convId, userId, ...msg });
    return { id: `msg-${written.messages.length}` };
  },
  updateMemory: async (convId, userId, slots) => { written.memory.push(slots); },
  recordEvent: async (e) => { written.events.push(e); },
  recordImpressions: async (e) => { written.events.push({ impressions: true, ...e }); },
  recordQueryAnalytics: async (r) => { written.analytics.push(r); },
  recordFeedback: async () => {},
});

stub('services/ai/retrieval.service.js', {
  retrieve: async () => ({
    chunks: scenario.chunks,
    topScore: scenario.confidence,
    confidenceScore: scenario.confidence,
    confidence: scenario.confidence >= 0.65 ? 'good' : 'low',
    shouldRecommend: scenario.shouldRecommend,
  }),
  inferProblemCategories: (chunks) => (chunks.length ? [{ slug: 'business-loss', weight: 1 }] : []),
});

stub('services/ai/matching.service.js', {
  loadVocabulary: async () => ({
    temples: [{ id: 't1', name: 'Maa Baglamukhi Temple Nalkheda', city: 'Nalkheda', state: 'Madhya Pradesh' }],
    cities: ['Nalkheda'], states: ['Madhya Pradesh'],
    deities: ['Maa Baglamukhi'], categories: [],
  }),
  matchServices: async () => ({
    services: scenario.services,
    gapType: scenario.services.length ? null : 'no_service',
  }),
  matchTemples: async () => ({ temples: scenario.temples, scope: 'exact' }),
  scopeNote: () => null,
});

stub('services/ai/ranking.service.js', {
  recommendPandits: async () => ({
    pandits: scenario.pandits,
    gapType: scenario.pandits.length ? null : 'no_pandit',
  }),
});

// The real response service, but with the network call replaced. This keeps
// validateOutput() — the anti-hallucination gate — genuinely in the loop.
const realResponse = require('../src/services/ai/response.service');
stub('services/ai/response.service.js', {
  ...realResponse,
  generate: async (ctx) => {
    if (ctx.intent?.crisis) return realResponse.crisisResponse(ctx.intent.language);
    const validated = realResponse.validateOutput({ answer: scenario.llmAnswer }, ctx);
    if (!validated.ok) {
      return { ...realResponse.fallbackResponse(ctx.intent?.language), rejected: validated.problems };
    }
    return { answer: validated.answer, followUpQuestion: null, model: 'stub', inputTokens: 10, outputTokens: 20 };
  },
});

const { runTurn } = require('../src/services/ai/pipeline.service');

const PANDIT = {
  panditId: 'p-1', slug: 'pandit-x', name: 'Pandit X', verified: true,
  rating: 4.8, reviewCount: 120, experienceYears: 12, completedCeremonies: 90,
  serviceReviews: 40, city: 'Nalkheda', offersOnline: false,
  matchLabel: 'Excellent match', reason: 'Performs at Nalkheda.',
  _score: 0.93, _factors: { serviceMatch: 1 },
};
const SERVICE = { id: 's-1', slug: 'havan-yagna', name: 'Havan Yagna', shortDescription: 'A havan' };
const TEMPLE = { id: 't1', slug: 'maa-baglamukhi', name: 'Maa Baglamukhi', city: 'Nalkheda', state: 'MP' };

function goodScenario() {
  resetCaptures();
  scenario.chunks = [{ id: 'c1', sourceRef: 'problems-solutions.json#business-loss', content: 'Samajh: …', documentType: 'spiritual_guidance', problemCategories: ['business-loss'], score: 0.8 }];
  scenario.confidence = 0.8;
  scenario.shouldRecommend = true;
  scenario.services = [SERVICE];
  scenario.temples = [TEMPLE];
  scenario.pandits = [PANDIT];
  scenario.llmAnswer = 'Paramparagat roop se vyapar ki baadha ke liye havan kiya jata hai.';
}

/* ── happy path ───────────────────────────────────────────────────────── */

test('an ordinary problem gets an answer and an OFFER, not cards', async () => {
  // Behaviour change: the assistant explains, then asks before recommending.
  goodScenario();
  const res = await runTurn({ message: 'business me rukawat aa rahi hai', sessionKey: 'k' });
  assert.ok(res.answer);
  assert.strictEqual(res.offeredRecommendations, true, 'no offer was made');
  assert.strictEqual(res.recommendations.pandits.length, 0, 'cards were pushed unasked');
  assert.match(res.answer, /suggest kar|suggest the best/i, 'the offer text is missing');
});

test('an outright request returns the cards immediately', async () => {
  goodScenario();
  const res = await runTurn({ message: 'business ke liye best pandit ji suggest kro', sessionKey: 'k' });

  assert.ok(res.answer);
  assert.strictEqual(res.recommendations.services.length, 1);
  assert.strictEqual(res.recommendations.pandits.length, 1);
  assert.strictEqual(res.conversationId, 'conv-1');
  assert.ok(res.messageId);
});

test('internal ranking detail never reaches the wire', async () => {
  goodScenario();
  const res = await runTurn({ message: 'business ke liye best pandit ji suggest kro', sessionKey: 'k' });
  const wire = JSON.stringify(res);
  assert.ok(!wire.includes('_score'), '_score leaked to the client');
  assert.ok(!wire.includes('_factors'), '_factors leaked to the client');
  assert.ok(wire.includes('Excellent match'), 'the human-readable label should survive');
});

test('an answer is auditable back to its source documents', async () => {
  goodScenario();
  await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  const assistant = written.messages.find((m) => m.role === 'assistant');
  assert.ok(assistant.retrieval.sourceRefs.includes('problems-solutions.json#business-loss'),
    'the grounding chunks must be recorded, or a bad answer cannot be traced');
});

/* ── the lead boundary ────────────────────────────────────────────────── */

test('a full AI turn creates NO qualified lead', async () => {
  goodScenario();
  await runTurn({ message: 'business ke liye best pandit ji suggest kro', sessionKey: 'k' });

  // Impressions are recorded; leads are not. The AI added a surface, not a new
  // way to manufacture leads.
  assert.ok(written.events.length > 0, 'impressions should be recorded');
  const serialised = JSON.stringify(written.events) + JSON.stringify(written.analytics);
  assert.ok(!/qualified_lead/i.test(serialised), 'the pipeline touched qualified leads');
});

test('recommendation events carry only ids, never contact details', async () => {
  goodScenario();
  await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  const serialised = JSON.stringify(written.events);
  for (const f of ['whatsapp_number', 'public_phone', 'public_email']) {
    assert.ok(!serialised.includes(f), `${f} leaked into an analytics event`);
  }
});

/* ── crisis ───────────────────────────────────────────────────────────── */

test('a crisis message short-circuits before any recommendation', async () => {
  goodScenario();      // cards ARE available — they must still not be returned
  const res = await runTurn({ message: 'mera jeene ka mann nahi karta', sessionKey: 'k' });

  assert.strictEqual(res.isCrisis, true);
  assert.deepStrictEqual(res.recommendations, { services: [], temples: [], pandits: [] },
    'a person in crisis was shown a puja recommendation');
  assert.match(res.answer, /14416|helpline/i);

  const analytics = written.analytics.at(-1);
  assert.strictEqual(analytics.detectedIntent, 'crisis');
  assert.ok(!written.events.some((e) => e.impressions), 'impressions fired on a crisis turn');
});

/* ── confidence gate ──────────────────────────────────────────────────── */

test('low confidence asks instead of recommending', async () => {
  goodScenario();
  scenario.confidence = 0.2;
  scenario.shouldRecommend = false;

  const res = await runTurn({ message: 'kuch ajeeb ho raha hai', sessionKey: 'k' });
  assert.strictEqual(res.needsClarification, true);
  assert.deepStrictEqual(res.recommendations, { services: [], temples: [], pandits: [] });
  assert.strictEqual(written.analytics.at(-1).gapType, 'low_confidence');
});

test('an explicit request is never blocked by the confidence gate', async () => {
  goodScenario();
  scenario.confidence = 0.2;
  scenario.shouldRecommend = false;   // retrieval unsure...

  // ...but the devotee named the temple. Their words outrank our uncertainty.
  const res = await runTurn({
    message: 'Maa Baglamukhi Temple Nalkheda me havan karvana hai', sessionKey: 'k',
  });
  assert.notStrictEqual(res.needsClarification, true,
    'an explicit temple request was met with a clarifying question');
  assert.ok(res.recommendations.pandits.length > 0);
});

/* ── inventory gaps ───────────────────────────────────────────────────── */

test('no service is reported as a demand gap, not invented', async () => {
  goodScenario();
  scenario.services = [];
  scenario.temples = [];
  scenario.pandits = [];

  const res = await runTurn({ message: 'saraswati puja karani hai', sessionKey: 'k' });
  assert.strictEqual(res.recommendations.services.length, 0);
  assert.strictEqual(res.gapType, 'no_service');
  assert.strictEqual(written.analytics.at(-1).gapType, 'no_service');
});

test('no eligible pandit is reported honestly', async () => {
  goodScenario();
  scenario.pandits = [];
  const res = await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  assert.strictEqual(res.recommendations.pandits.length, 0);
  assert.strictEqual(res.gapType, 'no_pandit');
});

/* ── hallucination ────────────────────────────────────────────────────── */

test('a model answer promising an outcome is rejected, not shown', async () => {
  goodScenario();
  scenario.llmAnswer = 'This havan will definitely solve your business problem, guaranteed.';

  const res = await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  assert.ok(!/guaranteed/i.test(res.answer), 'a guaranteed outcome reached the devotee');
  assert.ok(/available nahi|unavailable/i.test(res.answer), 'should have degraded to the fallback');
});

test('a model answer naming an unknown pandit id is rejected', async () => {
  goodScenario();
  scenario.llmAnswer = 'Contact 99999999-9999-9999-9999-999999999999 for this havan.';
  const res = await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  assert.ok(!res.answer.includes('99999999'), 'a hallucinated pandit id reached the devotee');
});

/* ── memory ───────────────────────────────────────────────────────────── */

test('memory slots persist so a later turn keeps context', async () => {
  goodScenario();
  await runTurn({ message: 'business me rukawat aa rahi hai', sessionKey: 'k' });
  const slots = written.memory.at(-1);
  assert.ok(slots, 'nothing was written to memory');
  assert.strictEqual(slots.problemCategory, 'business-loss',
    'the problem was not remembered, so "Nalkheda" next turn would lose context');
});

/* ── analytics completeness ───────────────────────────────────────────── */

test('every turn records analytics, including successful ones', async () => {
  goodScenario();
  await runTurn({ message: 'business me rukawat', sessionKey: 'k' });
  const a = written.analytics.at(-1);
  assert.ok(a);
  assert.strictEqual(a.servicesFound, 1);
  assert.strictEqual(a.panditsFound, 1);
  assert.ok(Number.isFinite(a.latencyMs));
});
