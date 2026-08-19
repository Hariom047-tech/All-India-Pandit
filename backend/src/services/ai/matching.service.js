/**
 * Marketplace Matching Engine — STEPS 9 & 10.
 *
 * "What do we actually offer, and where?"
 *
 * Every row returned by this module comes from the live relational tables.
 * Nothing here reads a knowledge chunk, because a chunk cannot know whether a
 * service was deactivated this morning. The knowledge base supplied the problem
 * categories; this module turns them into inventory that exists.
 *
 * When there is no inventory it says so and records the gap. It never widens
 * the search silently, and it never invents a service to fill a hole.
 */

const { query } = require('../../config/db');

/* ── vocabulary for the intent extractor ──────────────────────────────── */

let vocabCache = null;
let vocabCachedAt = 0;
const VOCAB_TTL_MS = 5 * 60 * 1000;

/**
 * Real names from the real tables, so intent extraction can only ever
 * recognise temples and cities that exist on the platform.
 */
async function loadVocabulary() {
  if (vocabCache && Date.now() - vocabCachedAt < VOCAB_TTL_MS) return vocabCache;

  const [temples, categories] = await Promise.all([
    query(`SELECT id, name, slug, city, state FROM temples
            WHERE is_active = TRUE AND deleted_at IS NULL`),
    query(`SELECT slug, example_phrases FROM ai_problem_categories WHERE is_active = TRUE`),
  ]);

  const cities = [...new Set(temples.rows.map((t) => t.city).filter(Boolean))];
  const states = [...new Set(temples.rows.map((t) => t.state).filter(Boolean))];

  vocabCache = {
    temples: temples.rows,
    cities,
    states,
    // Deities are not a table; they are a column on temples plus what the KB
    // knows. Kept short and explicit rather than scraped, so a stray value in
    // primary_deity cannot become a matchable entity.
    deities: ['Maa Baglamukhi', 'Baglamukhi', 'Ganesh', 'Lakshmi', 'Shiv', 'Hanuman',
      'Durga', 'Saraswati', 'Vishnu', 'Krishna', 'Ram', 'Shani', 'Surya', 'Kali'],
    categories: categories.rows.map((r) => ({
      slug: r.slug,
      examplePhrases: Array.isArray(r.example_phrases) ? r.example_phrases : [],
    })),
  };
  vocabCachedAt = Date.now();
  return vocabCache;
}

/* ── STEP 9 · service matching ────────────────────────────────────────── */

/**
 * Problem categories -> real, bookable services.
 *
 * Joined through ai_problem_service_mappings rather than derived from the
 * knowledge base's own serviceId strings, because 29 of those 30 strings match
 * no catalogue slug. A derived join returns nothing, silently. This one returns
 * only services that exist and are active.
 *
 * @param {Array<{slug, weight}>} categories  from retrieval.inferProblemCategories
 * @param {object} intent
 */
async function matchServices(categories, intent = {}, limit = 5) {
  const slugs = (categories || []).map((c) => c.slug).filter(Boolean);
  if (!slugs.length) return { services: [], gapType: 'no_knowledge' };

  const { rows } = await query(
    `SELECT DISTINCT ON (s.id)
            s.id, s.slug, s.name, s.short_description, s.description,
            s.estimated_duration, s.image_url, s.is_online_available,
            c.slug            AS matched_category,
            m.relevance_score,
            m.reason,
            m.temple_id       AS preferred_temple_id,
            (SELECT COUNT(*)::int FROM pandit_services ps
              JOIN pandits p ON p.id = ps.pandit_id
             WHERE ps.service_id = s.id AND ps.is_active
               AND p.deleted_at IS NULL AND p.verification_status = 'verified'
            )                 AS available_pandits
       FROM ai_problem_service_mappings m
       JOIN ai_problem_categories c ON c.id = m.problem_category_id
       JOIN services s ON s.id = m.service_id
      WHERE c.slug = ANY($1)
        AND m.status = 'published'
        AND s.is_active = TRUE
      ORDER BY s.id, m.relevance_score DESC`,
    [slugs],
  );

  if (!rows.length) {
    // We understood the problem — the knowledge base answered it — but the
    // catalogue has nothing to sell for it. That is a supply gap, not a
    // failure of comprehension, and the two need different admin responses.
    return { services: [], gapType: 'no_service' };
  }

  // Weight by how strongly retrieval supported each category, so a service
  // mapped to the top-ranked problem outranks one mapped to a weak secondary.
  const catWeight = new Map((categories || []).map((c) => [c.slug, c.weight]));
  const maxWeight = Math.max(...catWeight.values(), 1);

  const services = rows
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description,
      duration: r.estimated_duration,
      imageUrl: r.image_url,
      onlineAvailable: Boolean(r.is_online_available),
      reason: r.reason,
      matchedCategory: r.matched_category,
      availablePandits: r.available_pandits,
      preferredTempleId: r.preferred_temple_id,
      score: Number(r.relevance_score) * ((catWeight.get(r.matched_category) || 0.1) / maxWeight),
    }))
    // An explicit "online" request must not surface a service that cannot be
    // performed remotely — the card would be an invitation to a dead end.
    .filter((s) => !intent.wantsOnline || s.onlineAvailable)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!services.length) return { services: [], gapType: 'no_service' };
  return { services, gapType: null };
}

/* ── STEP 10 · temple matching ────────────────────────────────────────── */

/**
 * Location priority, in the order the spec fixes and in no other:
 *   1. temple the user named
 *   2. city the user named
 *   3. state the user named
 *   4. the user's own saved location
 *   5. nothing -> broader options, and say so
 *
 * Never assumes Nalkheda. Nalkheda wins only when the user asked for it, or
 * when it genuinely offers the matched service and nothing closer does.
 */
async function matchTemples(serviceIds, intent = {}, limit = 3) {
  if (!serviceIds?.length) return { temples: [], scope: 'none' };

  // Locked to one temple: filter, do not rank. Offering alternatives above the
  // thing someone explicitly asked for is the fastest way to feel unheard.
  if (intent.isLockedToTemple && intent.templeId) {
    const { rows } = await query(
      `SELECT t.id, t.slug, t.name, t.city, t.state, t.cover_image_url,
              EXISTS (SELECT 1 FROM temple_services ts
                       WHERE ts.temple_id = t.id AND ts.service_id = ANY($2)) AS offers_service
         FROM temples t
        WHERE t.id = $1 AND t.is_active = TRUE AND t.deleted_at IS NULL`,
      [intent.templeId, serviceIds],
    );
    return { temples: rows.map(shapeTemple), scope: 'locked', exclusive: true };
  }

  const { rows } = await query(
    `SELECT t.id, t.slug, t.name, t.city, t.state, t.cover_image_url,
            TRUE AS offers_service,
            CASE
              WHEN $2::uuid IS NOT NULL AND t.id = $2::uuid THEN 100
              WHEN $3::text IS NOT NULL AND LOWER(t.city)  = LOWER($3::text) THEN 80
              WHEN $4::text IS NOT NULL AND LOWER(t.state) = LOWER($4::text) THEN 50
              ELSE 10
            END AS location_score
       FROM temples t
      WHERE t.is_active = TRUE AND t.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM temple_services ts
                     WHERE ts.temple_id = t.id AND ts.service_id = ANY($1))
      ORDER BY location_score DESC, t.avg_rating DESC NULLS LAST, t.pandit_count DESC
      LIMIT $5`,
    [serviceIds, intent.templeId || null, intent.city || null, intent.state || null, limit],
  );

  const scope = rows.length === 0 ? 'none'
    : rows[0].location_score >= 100 ? 'exact'
      : rows[0].location_score >= 80 ? 'city'
        : rows[0].location_score >= 50 ? 'state'
          : 'wider';

  return { temples: rows.map(shapeTemple), scope, exclusive: false };
}

function shapeTemple(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    state: r.state,
    imageUrl: r.cover_image_url,
    offersService: r.offers_service !== false,
  };
}

/**
 * Human-readable note when the search had to widen. Shown to the devotee —
 * silently returning a Delhi pandit for a Nalkheda request is the failure the
 * spec calls out by name.
 */
function scopeNote(scope, intent) {
  const hi = intent.language !== 'en';
  switch (scope) {
    case 'city':
      return hi ? `${intent.city} ke aas-paas ke options.` : `Options in and around ${intent.city}.`;
    case 'state':
      return hi
        ? `${intent.city || 'aapke shahar'} me abhi kuch nahi mila, isliye ${intent.state} ke options dikha raha hoon.`
        : `Nothing in ${intent.city || 'your city'} yet, so these are across ${intent.state}.`;
    case 'wider':
      return hi
        ? 'Aapke bataye location par abhi kuch nahi mila, isliye doosre sthaan dikha raha hoon.'
        : 'Nothing at the location you mentioned, so these are from elsewhere.';
    default:
      return null;
  }
}

module.exports = { loadVocabulary, matchServices, matchTemples, scopeNote };
