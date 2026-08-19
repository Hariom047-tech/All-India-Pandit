/**
 * The pipeline. One function, one turn of conversation.
 *
 *   message
 *     -> intent + safety            deterministic, no network
 *     -> crisis short-circuit       never reaches a recommendation
 *     -> retrieval                  approved knowledge only
 *     -> confidence gate            below threshold: ask, don't guess
 *     -> service match              real catalogue rows
 *     -> temple match               location priority honoured
 *     -> pandit eligibility+ranking deterministic, code not model
 *     -> LLM                        explains what was already decided
 *     -> persist + analytics
 *
 * Ordering is not incidental. Safety precedes everything so a person in crisis
 * is never routed into an upsell. The confidence gate precedes matching so a
 * misunderstood question never produces confident-looking cards. The LLM is
 * last and receives a finished shortlist, so it cannot invent inventory.
 */

const { extractIntent, toMemory, needsClarification, searchText } = require('./intent.service');
const { retrieve, inferProblemCategories } = require('./retrieval.service');
const { loadVocabulary, matchServices, matchTemples, scopeNote } = require('./matching.service');
const { recommendPandits } = require('./ranking.service');
const { generate, crisisResponse, fallbackResponse, recommendationOffer } = require('./response.service');
const { AI_ENABLED } = require('./config');
const repo = require('../../repositories/ai.repository');

/** Wording when we understood the problem but cannot serve it. Honest, not evasive. */
function gapNote(gapType, intent) {
  const hi = intent.language !== 'en';
  switch (gapType) {
    case 'no_knowledge':
      return hi
        ? 'Is samasya ke liye mujhe PanditSuggest ki verified jankari nahi mili.'
        : 'I could not find verified PanditSuggest information for this.';
    case 'no_service':
      return hi
        ? 'Yeh seva abhi PanditSuggest par available nahi hai.'
        : 'We do not offer this service on PanditSuggest yet.';
    case 'no_pandit':
      return hi
        ? 'Is seva ke liye is location par abhi koi verified Pandit ji available nahi hai.'
        : 'No verified pandit is available for this service at that location yet.';
    default:
      return null;
  }
}

/**
 * @param {object} input
 * @param {string} input.message
 * @param {string} [input.conversationId]
 * @param {object} [input.user]        req.user, or null for a guest
 * @param {string} [input.sessionKey]  opaque guest identifier
 * @param {string} [input.market]      INDIA | INTERNATIONAL | UNKNOWN, resolved
 *   server-side by services/distribution/market.js — never trust a client claim
 */
async function runTurn({ message, conversationId, user = null, sessionKey = null, market = null }) {
  const started = Date.now();
  const userId = user?.id || null;

  if (!AI_ENABLED) {
    return { ...fallbackResponse('hinglish'), conversationId: conversationId || null };
  }

  /* 1 · vocabulary + conversation memory --------------------------------- */
  const vocab = await loadVocabulary();
  const conversation = await repo.getOrCreateConversation({
    conversationId, userId, sessionKey,
  });
  const memory = conversation.memory || {};

  /* 2 · intent + safety --------------------------------------------------- */
  const intent = extractIntent(message, vocab, memory);

  await repo.addMessage(conversation.id, userId, {
    role: 'user', content: message, intent,
  }, sessionKey);

  /* 3 · crisis short-circuit ---------------------------------------------- */
  if (intent.crisis) {
    const crisis = crisisResponse(intent.language);
    const saved = await repo.addMessage(conversation.id, userId, {
      role: 'assistant', content: crisis.answer, intent,
    }, sessionKey);
    await repo.recordQueryAnalytics({
      conversationId: conversation.id, queryText: message, language: intent.language,
      detectedIntent: 'crisis', fallbackUsed: 'crisis', latencyMs: Date.now() - started,
    });
    return { ...crisis, conversationId: conversation.id, messageId: saved.id };
  }

  /* 4 · retrieval --------------------------------------------------------- */
  // Short follow-ups are searched together with what the conversation already
  // established — "career ke liye" alone retrieves nothing useful.
  const queryText = searchText(message, memory);
  const retrieval = await retrieve(queryText, intent);
  const categories = inferProblemCategories(retrieval.chunks);

  // Memory is updated with whatever retrieval confirmed, so the next turn
  // ("Nalkheda") resolves against this turn's problem.
  const inferredCategory = intent.problemCategory || categories[0]?.slug || null;
  const enriched = { ...intent, problemCategory: inferredCategory };

  /* 5 · clarification gate ------------------------------------------------ */
  // Ask once, then commit. Re-deciding independently each turn is what
  // produced four consecutive questions in a real conversation.
  const clarifyCount = Number(memory.clarifyCount) || 0;
  const clarify = needsClarification(enriched, retrieval, {
    alreadyAsked: clarifyCount >= 1,
    hasContext: Boolean(memory.problemCategory || memory.temple || memory.deity),
  });
  if (clarify) {
    const saved = await repo.addMessage(conversation.id, userId, {
      role: 'assistant', content: clarify, intent: enriched,
      confidence: retrieval.confidenceScore,
    }, sessionKey);
    await repo.updateMemory(conversation.id, userId,
      toMemory(enriched, { clarifyCount: clarifyCount + 1 }), sessionKey);
    await repo.recordQueryAnalytics({
      conversationId: conversation.id, queryText: message, language: intent.language,
      detectedIntent: 'clarification_needed', problemCategory: inferredCategory,
      topScore: retrieval.confidenceScore, chunksRetrieved: retrieval.chunks.length,
      gapType: retrieval.chunks.length ? 'low_confidence' : 'no_knowledge',
      latencyMs: Date.now() - started,
    });
    return {
      answer: clarify,
      followUpQuestion: null,
      needsClarification: true,
      confidence: retrieval.confidence,
      recommendations: { services: [], temples: [], pandits: [] },
      conversationId: conversation.id,
      messageId: saved.id,
    };
  }

  /* 6 · marketplace matching ---------------------------------------------- */
  const { services, gapType: serviceGap } = await matchServices(categories, enriched);
  const serviceIds = services.map((s) => s.id);

  /*
   * Temples are matched for CONTEXT only — they are no longer shown as cards.
   * The assistant recommends a ritual and a pandit; which temple that pandit
   * serves is already stated on their card ("Performs at ..."), and suggesting
   * a temple the devotee never asked about was both unwanted and, below,
   * actively harmful to the ranking.
   */
  const { temples, scope } = serviceIds.length
    ? await matchTemples(serviceIds, enriched)
    : { temples: [], scope: 'none' };

  /* 7 · pandit eligibility + ranking -------------------------------------- */
  let pandits = [];
  let panditGap = null;
  if (serviceIds.length) {
    const top = services[0];
    /*
     * templeId comes ONLY from what the devotee actually said.
     *
     * It used to fall back to `temples[0].id` — the highest-rated temple that
     * happens to offer the service. For a query with no location at all that
     * was Shree Siddhivinayak in Mumbai, which then scored locationMatch = 1.0
     * in the ranking and put a Mumbai pandit at the top of a search that never
     * mentioned Mumbai. Guessing a location and then ranking as if the devotee
     * had chosen it is worse than having no location signal.
     */
    const explicitTempleId = enriched.templeId || null;
    const result = await recommendPandits({
      serviceId: top.id,
      serviceName: top.name,
      templeId: explicitTempleId,
      templeName: explicitTempleId ? enriched.temple : null,
      city: enriched.city,
      state: enriched.state,
      wantsOnline: enriched.wantsOnline,
      // Stable per-visitor rotation seed — a logged-in devotee's id when
      // there is one (consistent across conversations), else the guest's
      // opaque per-conversation key. Without this, ranking.service.js's
      // session-seeded rotation degrades to "no signal", which still works
      // (falls back to '') but means every guest asking the same question
      // in a fresh conversation gets a fresh seed rather than a stable one.
      sessionKey: userId || sessionKey,
      // UNKNOWN/null intentionally does not filter — same "we do not guess"
      // rule the browsing engine applies (services/distribution/market.js).
      market: market && market !== 'UNKNOWN' ? market : null,
    });
    pandits = result.pandits;
    panditGap = result.gapType;
  }

  const gap = serviceGap || panditGap
    || (retrieval.chunks.length ? null : 'no_knowledge');

  /* 8 · show the cards, or offer them ------------------------------------- */
  /*
   * Two-step by default: explain first, then ask before recommending anyone.
   *
   * Leading with cards on a "kya karun?" question feels like being sold to
   * before being heard. So an ordinary problem description gets the answer plus
   * one short offer, and the cards arrive when the devotee says haan.
   *
   * The exception matters as much as the rule: someone who typed "best pandit
   * ji suggest kro" has already decided. Offering to do what they just asked
   * for is the same insult as re-asking a question they already answered — so
   * an explicit request, or a yes to our previous offer, shows the cards now.
   */
  const showCards = Boolean(
    enriched.wantsRecommendations
    || (memory.offeredRecommendations && enriched.isAffirmative),
  );
  /*
   * isExplicitRequest is deliberately NOT in that list. Naming a deity and a
   * ritual ("Maa Baglamukhi puja karani hai") makes the INTENT explicit, but it
   * is not a request to be shown pandits — and pushing cards at that point is
   * the "sold to before being heard" feeling. It still skips the clarifying
   * question; it just gets the offer rather than the cards.
   */

  const generated = await generate({
    message,
    intent: enriched,
    chunks: retrieval.chunks,
    // Withheld from the prompt too, not just the response — otherwise the
    // model describes pandits the devotee cannot yet see.
    services: showCards ? services : [],
    // Only when the devotee named it. Passing a matched-but-unrequested temple
    // invited the model to open with "you should go to X", which is exactly
    // the suggestion we do not want to make.
    temples: enriched.templeId ? temples.filter((t) => t.id === enriched.templeId) : [],
    pandits: showCards ? pandits : [],
    gapNote: gapNote(gap, enriched),
  });

  // Only offer when we actually have something to offer.
  const canOffer = !showCards && (services.length > 0 || pandits.length > 0);
  const answerText = canOffer
    ? generated.answer + recommendationOffer(enriched.language)
    : generated.answer;

  const locationNote = scopeNote(scope, enriched);

  /* 9 · persist + analytics ----------------------------------------------- */
  const saved = await repo.addMessage(conversation.id, userId, {
    role: 'assistant',
    content: answerText,
    intent: enriched,
    retrieval: {
      chunkIds: retrieval.chunks.map((c) => c.id),
      sourceRefs: retrieval.chunks.map((c) => c.sourceRef),
      confidence: retrieval.confidenceScore,
    },
    recommendations: {
      services: serviceIds,
      temples: temples.map((t) => t.id),
      pandits: pandits.map((p) => p.panditId),
    },
    confidence: retrieval.confidenceScore,
    model: generated.model,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
    latencyMs: Date.now() - started,
  }, sessionKey);

  await repo.updateMemory(conversation.id, userId,
    toMemory(enriched, { offeredRecommendations: canOffer }), sessionKey);

  // Impressions. Analytics only — see the header of ai.repository.js.
  // Impressions only for cards actually rendered — counting a withheld card
  // as shown would inflate CTR's denominator and make it meaningless.
  if (showCards) {
    await repo.recordImpressions({
      conversationId: conversation.id, messageId: saved.id, userId,
      services, temples: [], pandits,
    });
  }

  await repo.recordQueryAnalytics({
    conversationId: conversation.id,
    queryText: message,
    language: enriched.language,
    detectedIntent: enriched.isExplicitRequest ? 'explicit_service_search' : 'problem_description',
    problemCategory: inferredCategory,
    requestedService: services[0]?.name || null,
    requestedCity: enriched.city,
    requestedState: enriched.state,
    requestedTemple: enriched.temple,
    topScore: retrieval.confidenceScore,
    chunksRetrieved: retrieval.chunks.length,
    servicesFound: services.length,
    panditsFound: pandits.length,
    gapType: gap,
    fallbackUsed: generated.isFallback ? 'llm_unavailable' : null,
    latencyMs: Date.now() - started,
  });

  // _score / _factors are internal ranking detail; strip before the wire.
  const publicPandits = pandits.map(({ _score, _factors, ...rest }) => rest);

  return {
    answer: answerText,
    followUpQuestion: generated.followUpQuestion,
    offeredRecommendations: canOffer,
    confidence: retrieval.confidence,
    intent: {
      language: enriched.language,
      problemCategory: inferredCategory,
      temple: enriched.temple,
      city: enriched.city,
      wantsOnline: enriched.wantsOnline,
    },
    // temples deliberately absent: the assistant suggests a ritual and a
    // pandit, not a place to travel to. The pandit card already names where
    // they serve.
    recommendations: showCards
      ? { services, temples: [], pandits: publicPandits }
      : { services: [], temples: [], pandits: [] },
    locationNote,
    gapType: gap,
    conversationId: conversation.id,
    messageId: saved.id,
    latencyMs: Date.now() - started,
  };
}

module.exports = { runTurn, gapNote };
