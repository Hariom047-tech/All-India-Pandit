/**
 * AI subsystem configuration.
 *
 * Model names and dimensions live here; ranking/retrieval numbers that the
 * business may want to tune live in the ai_ranking_config table (migration 12)
 * and are read at runtime, so changing a weight does not need a deploy.
 */

const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small';

/**
 * Must equal the vector(N) column width in migration 12. Asserted on every
 * embedding batch: a model swap that silently returned 3072-dim vectors would
 * otherwise fail deep inside an INSERT with an opaque pgvector error, halfway
 * through a re-index.
 */
const EMBEDDING_DIMENSIONS = 1536;

const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'gpt-4o-mini';

/** Master kill switch — when false the UI falls back to plain search. */
const AI_ENABLED = process.env.AI_ENABLED !== 'false';

/* ── Chunking ─────────────────────────────────────────────────────────────
   400–800 tokens per the architecture doc. MAX is a hard ceiling that forces
   a split; TARGET is what the grouping adapters aim for. */
const CHUNK_TARGET_TOKENS = 600;
const CHUNK_MAX_TOKENS = 800;

/**
 * Token estimate without a tokenizer dependency.
 *
 * Devanagari is far more token-dense than Latin text under the cl100k/o200k
 * BPEs — often close to one token per character — so a single chars/4 rule
 * would badly under-count Hindi and let chunks blow past the context budget.
 * Counting the two scripts separately keeps the estimate honest in both.
 *
 * Deliberately an over-estimate. Being wrong towards "smaller chunks" costs a
 * little recall; being wrong the other way truncates a prompt.
 */
function estimateTokens(text) {
  if (!text) return 0;
  const devanagari = (text.match(/[ऀ-ॿ]/g) || []).length;
  const rest = text.length - devanagari;
  return Math.ceil(devanagari * 0.9 + rest / 3.5);
}

/* ── Retrieval ────────────────────────────────────────────────────────────
   Hybrid weights. Vector leads, but lexical matters more here than in an
   English corpus: "Nalkheda" and "Baglamukhi" are exactly the tokens a devotee
   is most specific about, and cosine similarity smooths proper nouns away. */
const HYBRID_WEIGHTS = { vector: 0.60, lexical: 0.25, metadata: 0.15 };

/**
 * Per-type retrieval weight.
 *
 * Scripture is included but damped. The Gita is ~700 verses of highly
 * evocative text; left at parity it would outrank a purpose-written problem
 * record for "business mein rukawat", which is not what the devotee asked for.
 * It still surfaces for genuinely spiritual questions.
 */
const TYPE_WEIGHTS = {
  spiritual_guidance: 1.00,
  puja: 1.00,
  havan: 1.00,
  anushthan: 1.00,
  remedy: 0.95,
  temple: 0.95,
  deity: 0.90,
  faq: 0.90,
  testimonial: 0.85,
  scripture: 0.60,
};

/** Fallbacks used only when ai_ranking_config has not been read yet. */
const DEFAULTS = {
  'retrieval.min_confidence': 0.60,
  'retrieval.top_k': 20,
  'retrieval.final_k': 6,
};

module.exports = {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  CHAT_MODEL,
  AI_ENABLED,
  CHUNK_TARGET_TOKENS,
  CHUNK_MAX_TOKENS,
  HYBRID_WEIGHTS,
  TYPE_WEIGHTS,
  DEFAULTS,
  estimateTokens,
};
