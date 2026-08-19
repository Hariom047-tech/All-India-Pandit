/**
 * Hybrid retrieval over the approved knowledge base.
 *
 * Vector search alone fails on exactly the words a devotee is most deliberate
 * about. "Nalkheda" and "Baglamukhi" are proper nouns; cosine similarity treats
 * them as mildly-spiritual-sounding tokens and happily returns a Datia chunk
 * instead. Lexical search catches them. Neither is sufficient alone, so both
 * run and their scores combine.
 *
 * This module answers ONE question: "what is traditionally relevant here?"
 * It never returns a price, a rating, an availability or a pandit. Those come
 * from the relational tables, in the Marketplace Matching and Ranking engines.
 */

const { query } = require('../../config/db');
const { embedOne, toVectorLiteral } = require('./embeddings.service');
const { HYBRID_WEIGHTS, TYPE_WEIGHTS, DEFAULTS } = require('./config');

/* ── config, read from the DB so weights are tunable without a deploy ──── */
let configCache = null;
let configCachedAt = 0;
const CONFIG_TTL_MS = 60_000;

async function getConfig() {
  if (configCache && Date.now() - configCachedAt < CONFIG_TTL_MS) return configCache;
  try {
    const { rows } = await query('SELECT key, value FROM ai_ranking_config');
    configCache = { ...DEFAULTS };
    for (const r of rows) configCache[r.key] = Number(r.value);
    configCachedAt = Date.now();
  } catch {
    configCache = { ...DEFAULTS };   // table missing (pre-migration) — do not crash
  }
  return configCache;
}

/**
 * One round trip returning both scores.
 *
 * The two halves are separate CTEs with their own LIMIT and ORDER BY so each
 * uses its own index — the HNSW index for the vector side, the GIN index for
 * the lexical side. A single WHERE combining them would defeat both.
 *
 * FULL OUTER JOIN because a chunk can be a strong lexical match with a mediocre
 * vector score (exact temple name) or the reverse (paraphrased problem), and
 * dropping either would lose the case the hybrid exists to catch.
 */
const SEARCH_SQL = `
WITH vec AS (
  SELECT c.id, 1 - (c.embedding <=> $1::vector) AS vscore
    FROM ai_knowledge_chunks c
   WHERE c.is_retrievable AND c.embedding IS NOT NULL
   ORDER BY c.embedding <=> $1::vector
   LIMIT $3
),
lex AS (
  SELECT c.id, ts_rank(c.content_tsv, plainto_tsquery('simple', $2)) AS lscore
    FROM ai_knowledge_chunks c
   WHERE c.is_retrievable
     AND $2 <> ''
     AND c.content_tsv @@ plainto_tsquery('simple', $2)
   ORDER BY lscore DESC
   LIMIT $3
)
SELECT c.id, c.content, c.heading, c.document_type, c.language,
       d.id AS document_id, d.title, d.source, d.source_ref,
       d.deity, d.city, d.state, d.service_id, d.temple_id,
       d.intent_tags, d.problem_categories,
       COALESCE(vec.vscore, 0) AS vscore,
       COALESCE(lex.lscore, 0) AS lscore
  FROM vec
  FULL OUTER JOIN lex ON lex.id = vec.id
  JOIN ai_knowledge_chunks c ON c.id = COALESCE(vec.id, lex.id)
  JOIN ai_knowledge_documents d ON d.id = c.document_id
 WHERE d.status = 'published' AND d.verified
`;

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Metadata boost, 0..1.
 *
 * These are the explicit signals — a devotee who typed "Nalkheda" told us
 * something far more reliable than any similarity score, and the ranking has
 * to reflect that rather than average it away.
 */
function metadataBoost(row, intent) {
  let score = 0;
  let max = 0;
  const add = (weight, hit) => { max += weight; if (hit) score += weight; };

  const cats = Array.isArray(row.problem_categories) ? row.problem_categories.map(norm) : [];
  const tags = Array.isArray(row.intent_tags) ? row.intent_tags.map(norm) : [];

  if (intent.problemCategory) add(0.35, cats.includes(norm(intent.problemCategory)));
  if (intent.temple) add(0.30, norm(row.title).includes(norm(intent.temple)) || norm(row.city) === norm(intent.temple));
  if (intent.deity) add(0.20, norm(row.deity).includes(norm(intent.deity)) || tags.includes(norm(intent.deity)));
  if (intent.city) add(0.15, norm(row.city) === norm(intent.city));
  if (intent.state) add(0.10, norm(row.state) === norm(intent.state));

  return max > 0 ? score / max : 0;
}

/** ts_rank is unbounded and corpus-dependent, so normalise within the result set. */
function normaliseLexical(rows) {
  const max = Math.max(...rows.map((r) => Number(r.lscore) || 0), 0);
  return max > 0 ? (v) => Number(v) / max : () => 0;
}

/**
 * Map raw cosine similarity onto a usable 0–1 scale.
 *
 * Cosine is NOT a probability. For a short query against a long chunk with
 * text-embedding-3-small, a genuinely excellent topical match lands around
 * 0.45–0.55 and an unrelated one around 0.15–0.25 — the whole useful signal
 * lives in a narrow band well below 1.0.
 *
 * The first version compared raw cosine against a 0.60 gate, which no result
 * could ever reach: measured scores came back 0.17–0.51 and every single query,
 * including obviously correct ones, was classed "low confidence". The system
 * would have asked a clarifying question forever and never recommended
 * anything.
 *
 * Floor and ceiling are read from ai_ranking_config and should be MEASURED for
 * your corpus with `npm run ai:calibrate`, not guessed.
 */
function calibrateVector(cosine, floor, ceiling) {
  if (!(ceiling > floor)) return clamp01(cosine);
  return clamp01((cosine - floor) / (ceiling - floor));
}

/**
 * Weights renormalised over the signals actually available for THIS query.
 *
 * The second half of the same bug. A Devanagari query against a Roman-Hinglish
 * corpus produces no lexical match, and a query naming no temple or deity
 * produces no metadata boost — so 0.40 of the weight budget was unwinnable and
 * silently dragged every score down. Redistributing across present signals
 * means a query answerable by vector alone can still score 1.0.
 */
function effectiveWeights({ hasLexical, hasMetadata }) {
  const w = {
    vector: HYBRID_WEIGHTS.vector,
    lexical: hasLexical ? HYBRID_WEIGHTS.lexical : 0,
    metadata: hasMetadata ? HYBRID_WEIGHTS.metadata : 0,
  };
  const total = w.vector + w.lexical + w.metadata;
  return { vector: w.vector / total, lexical: w.lexical / total, metadata: w.metadata / total };
}

/**
 * Confidence combines absolute strength with SEPARATION.
 *
 * Absolute score alone is fragile across models and languages. If the top hit
 * stands clearly apart from the rest of the candidates, retrieval found
 * something specific — that is meaningful even when the absolute number is
 * moderate. If everything scores the same, nothing was really found, however
 * high the numbers look.
 */
function confidenceOf(scores) {
  if (!scores.length) return { score: 0, margin: 0, band: 'low' };
  const top = scores[0];
  const rest = scores.slice(1);
  const mean = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : 0;
  const margin = top > 0 ? clamp01((top - mean) / top) : 0;

  // 80% strength, 20% distinctiveness. Separation is corroboration, not the
  // main event — a query can legitimately match several chunks well.
  const combined = clamp01(0.8 * top + 0.2 * margin);
  return { score: combined, margin, band: confidenceBand(combined) };
}

function confidenceBand(score) {
  if (score >= 0.80) return 'high';
  if (score >= 0.65) return 'good';
  if (score >= 0.50) return 'possible';
  return 'low';
}

/**
 * Retrieve grounding chunks.
 *
 * @param {string} rawQuery      the devotee's message (or a rewritten form)
 * @param {object} intent        { problemCategory, temple, deity, city, state, documentTypes }
 * @returns {{ chunks, topScore, confidence, shouldRecommend }}
 */
async function retrieve(rawQuery, intent = {}) {
  const text = (rawQuery || '').trim();
  if (!text) {
    return { chunks: [], topScore: 0, confidence: 'low', shouldRecommend: false };
  }

  const cfg = await getConfig();
  const topK = Math.round(cfg['retrieval.top_k'] ?? 20);
  const finalK = Math.round(cfg['retrieval.final_k'] ?? 6);
  const minConfidence = cfg['retrieval.min_confidence'] ?? 0.60;

  const embedding = await embedOne(text);
  const { rows } = await query(SEARCH_SQL, [toVectorLiteral(embedding), text, topK]);

  if (!rows.length) {
    return { chunks: [], topScore: 0, confidence: 'low', shouldRecommend: false };
  }

  const lexNorm = normaliseLexical(rows);
  const floor = cfg['retrieval.cosine_floor'] ?? 0.20;
  const ceiling = cfg['retrieval.cosine_ceiling'] ?? 0.55;

  // Which signals this query can actually win on — decided once, from the
  // result set, so every candidate is scored on the same basis.
  const hasLexical = rows.some((r) => Number(r.lscore) > 0);
  const hasMetadata = Boolean(
    intent.problemCategory || intent.temple || intent.deity || intent.city || intent.state,
  );
  const w = effectiveWeights({ hasLexical, hasMetadata });

  const scored = rows.map((r) => {
    const rawCosine = Number(r.vscore) || 0;
    const vector = calibrateVector(rawCosine, floor, ceiling);
    const lexical = lexNorm(r.lscore);
    const meta = metadataBoost(r, intent);
    const base = w.vector * vector + w.lexical * lexical + w.metadata * meta;
    // Type weight damps scripture so the Gita cannot outrank a purpose-written
    // problem record for a practical question. See config.TYPE_WEIGHTS.
    const typeWeight = TYPE_WEIGHTS[r.document_type] ?? 0.85;
    return {
      id: r.id,
      documentId: r.document_id,
      title: r.title,
      heading: r.heading,
      content: r.content,
      documentType: r.document_type,
      source: r.source,
      sourceRef: r.source_ref,
      serviceId: r.service_id,
      templeId: r.temple_id,
      problemCategories: r.problem_categories || [],
      score: base * typeWeight,
      factors: { rawCosine, vector, lexical, meta, typeWeight, weights: w },
    };
  });

  // Never two chunks from the same document — they say nearly the same thing
  // and would crowd a genuinely different perspective out of the context window.
  const byDocument = new Map();
  for (const c of scored.sort((a, b) => b.score - a.score)) {
    if (!byDocument.has(c.documentId)) byDocument.set(c.documentId, c);
  }

  const chunks = [...byDocument.values()].slice(0, finalK);
  const conf = confidenceOf(chunks.map((c) => c.score));

  return {
    chunks,
    topScore: chunks.length ? chunks[0].score : 0,
    confidenceScore: conf.score,
    margin: conf.margin,
    confidence: conf.band,
    signals: { hasLexical, hasMetadata, weights: w, cosineFloor: floor, cosineCeiling: ceiling },
    // The gate the whole design rests on: below this, ask a clarifying
    // question. Do not recommend, and do not let the model improvise.
    shouldRecommend: conf.score >= minConfidence,
  };
}

/**
 * Problem categories implied by the retrieved chunks, most-supported first.
 * This is how retrieval hands off to the Marketplace Matching engine — it
 * yields ai_problem_categories slugs, which map to real services.
 */
function inferProblemCategories(chunks) {
  const tally = new Map();
  for (const c of chunks) {
    for (const cat of c.problemCategories || []) {
      tally.set(cat, (tally.get(cat) || 0) + c.score);
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug, weight]) => ({ slug, weight }));
}

module.exports = {
  retrieve, inferProblemCategories, getConfig, metadataBoost,
  // exported for calibration + tests
  calibrateVector, effectiveWeights, confidenceOf, confidenceBand, normaliseLexical,
};
