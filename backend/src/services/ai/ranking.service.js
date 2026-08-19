/**
 * Pandit Ranking Engine — STEPS 11 & 12.
 *
 * Two halves, kept apart on purpose:
 *
 *   fetchCandidates()   SQL. Hard eligibility gates. Touches the database.
 *   scoreCandidate()    Pure arithmetic. No I/O. Fully unit-testable.
 *
 * The LLM is not involved at any point. It never sees a pandit this module did
 * not already select, so it cannot invent one, cannot reorder them on a whim,
 * and cannot be argued into recommending someone unverified.
 *
 * See docs/AI_RANKING_ENGINE.md for the reasoning behind each weight.
 */

const { query } = require('../../config/db');
const { DEFAULTS } = require('./config');
// Reused, not reimplemented: the same deterministic per-(session,id) hash the
// distribution engine uses for its own session-stable rotation noise.
const { hash01 } = require('../distribution/fairness');

/* ── eligibility + signal gathering ───────────────────────────────────── */

/**
 * One query. Every gate is a WHERE clause, not a weight — there is no score
 * high enough to surface a suspended or unverified pandit.
 *
 * Location note: pandits have no city column. A pandit's location is their
 * user's city/state (users.city), plus the temples they are attached to via
 * pandit_temples. Both are checked.
 *
 * Service-specific rating comes from reviews.service_id, which exists — so
 * "4.95 across 120 Baglamukhi havans" is a real number here, not a wish.
 */
const CANDIDATE_SQL = `
SELECT
  p.id, p.slug, u.full_name, p.title, p.short_bio, p.bio,
  p.profile_photo_url, p.video_intro_url,
  p.experience_years, p.completed_ceremonies,
  p.avg_rating, p.review_count,
  p.verification_status, p.video_kyc_completed,
  p.is_available, p.accepts_online, p.current_tier, p.subscription_expires_at,
  p.specializations, p.primary_specialization, p.traditions,
  p.whatsapp_number, p.public_phone,
  u.city, u.state,

  ps.offers_online          AS service_offers_online,
  ps.price_range_min, ps.price_range_max,

  -- Service-specific signals (the point of PHASE 20/56).
  COALESCE(sr.service_reviews, 0)   AS service_reviews,
  sr.service_rating                 AS service_rating,

  -- Location relationship, strongest first.
  EXISTS (SELECT 1 FROM pandit_temples pt
           WHERE pt.pandit_id = p.id AND pt.is_active
             AND pt.temple_id = $2::uuid)                         AS serves_temple,
  ($3::text IS NOT NULL AND LOWER(u.city)  = LOWER($3::text))     AS same_city,
  ($4::text IS NOT NULL AND LOWER(u.state) = LOWER($4::text))     AS same_state,

  -- Recent activity. Qualified leads are the only reliable timestamped signal
  -- of a pandit actually being reachable; reviews lag by weeks.
  (SELECT MAX(ql.last_interaction_at) FROM qualified_leads ql
    WHERE ql.pandit_id = p.id)                                    AS last_lead_at,
  (SELECT COUNT(*)::int FROM qualified_leads ql
    WHERE ql.pandit_id = p.id
      AND ql.created_at > NOW() - INTERVAL '90 days')             AS leads_90d,
  (SELECT COUNT(*)::int FROM qualified_leads ql
    WHERE ql.pandit_id = p.id AND ql.status = 'completed')        AS leads_completed

FROM pandits p
JOIN users u          ON u.id = p.user_id
JOIN pandit_services ps ON ps.pandit_id = p.id AND ps.service_id = $1::uuid AND ps.is_active
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS service_reviews, AVG(r.rating)::numeric AS service_rating
    FROM reviews r
   WHERE r.reviewable_type = 'pandit' AND r.reviewable_id = p.id
     AND r.service_id = $1::uuid
     AND r.is_approved AND NOT r.is_flagged AND r.deleted_at IS NULL
) sr ON TRUE

WHERE p.deleted_at IS NULL
  AND p.verification_status = 'verified'   -- unverified NEVER surfaces
  AND p.is_available = TRUE
  AND u.status = 'active'                  -- suspended / banned excluded
  AND COALESCE(u.full_name, '') <> ''
  AND COALESCE(p.whatsapp_number, p.public_phone, '') <> ''   -- must be contactable
  AND (
        $5::boolean IS NOT TRUE            -- caller did not require online
     OR ps.offers_online = TRUE            -- ...or this pandit does it online
  )
  AND (
        $2::uuid IS NULL AND $3::text IS NULL AND $4::text IS NULL
     OR EXISTS (SELECT 1 FROM pandit_temples pt
                 WHERE pt.pandit_id = p.id AND pt.is_active AND pt.temple_id = $2::uuid)
     OR ($3::text IS NOT NULL AND LOWER(u.city)  = LOWER($3::text))
     OR ($4::text IS NOT NULL AND LOWER(u.state) = LOWER($4::text))
     OR ($5::boolean IS TRUE AND ps.offers_online = TRUE)   -- remote ignores geography
  )
  -- Market entitlement — same table and same "unknown means show everyone"
  -- rule as services/distribution/engine.js. The AI assistant must never
  -- recommend a pandit whose plan does not cover this visitor's market; it
  -- is a second, independent scorer and must not be a second, independent
  -- place that rule can be forgotten.
  AND (
        $6::text IS NULL
     OR EXISTS (SELECT 1 FROM plan_market_entitlements pme
                 WHERE pme.tier = p.current_tier AND pme.market = $6::lead_market AND pme.is_active)
  )
LIMIT 200
`;

async function fetchCandidates({ serviceId, templeId = null, city = null, state = null, wantsOnline = false, market = null }) {
  if (!serviceId) return [];
  const { rows } = await query(CANDIDATE_SQL, [serviceId, templeId, city, state, wantsOnline, market]);
  return rows;
}

/* ── weights ──────────────────────────────────────────────────────────── */

let weightsCache = null;
let weightsCachedAt = 0;
const WEIGHTS_TTL_MS = 60_000;

const WEIGHT_DEFAULTS = {
  'weight.service_match': 0.30,
  'weight.location_match': 0.20,
  'weight.performance': 0.15,
  'weight.review_quality': 0.10,
  'weight.service_experience': 0.10,
  'weight.recent_activity': 0.05,
  'weight.profile_completeness': 0.05,
  'weight.availability': 0.05,
  'rating.prior_mean': 4.30,
  'rating.prior_weight': 20,
  'exploration.slots': 1,
  'exploration.min_score': 0.60,
  // Session-seeded rotation among comparably-relevant candidates — see
  // rankCandidates(). Small relative to a 0-1 relevance score: it can
  // reorder two close candidates, never promote a clearly worse match.
  'rotation.noise': 0.03,
  'rotation.band_multiplier': 3,
};

async function getWeights() {
  if (weightsCache && Date.now() - weightsCachedAt < WEIGHTS_TTL_MS) return weightsCache;
  try {
    const { rows } = await query('SELECT key, value FROM ai_ranking_config');
    weightsCache = { ...WEIGHT_DEFAULTS, ...DEFAULTS };
    for (const r of rows) weightsCache[r.key] = Number(r.value);
    weightsCachedAt = Date.now();
  } catch {
    weightsCache = { ...WEIGHT_DEFAULTS, ...DEFAULTS };
  }
  return weightsCache;
}

/* ── pure scoring ─────────────────────────────────────────────────────── */

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const num = (v) => {                       // node-postgres returns NUMERIC as string
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Bayesian shrinkage toward the platform mean.
 *
 * Two five-star reviews is not evidence. Without this, a brand-new pandit with
 * one perfect review outranks someone with 300 reviews at 4.8 — which is both
 * wrong and trivially gameable.
 *
 *   adjusted = (v·R + m·C) / (v + m)
 */
function bayesianRating(rating, count, priorMean = 4.3, priorWeight = 20) {
  const v = Math.max(0, num(count));
  const R = num(rating);
  if (v === 0) return priorMean;      // no evidence -> assume average, not zero
  return (v * R + priorWeight * priorMean) / (v + priorWeight);
}

/** Diminishing returns: the 500th ceremony says less than the 5th. */
const saturate = (value, midpoint) => {
  const v = Math.max(0, num(value));
  return v / (v + midpoint);
};

/**
 * Score one candidate. Pure — same inputs, same output, no clock, no I/O.
 *
 * `ctx.requestedTempleId` etc. describe what the devotee asked for; the row
 * describes what the pandit is. Every factor is normalised to 0–1 before the
 * weights are applied, so the total is 0–1 and "0.93" means something stable.
 */
function scoreCandidate(row, ctx = {}, weights = WEIGHT_DEFAULTS) {
  const w = { ...WEIGHT_DEFAULTS, ...weights };

  /* Service match — eligibility already guarantees they offer it, so this
     rewards depth rather than presence: a stated specialisation in the matched
     service beats merely having it listed. */
  const specs = [
    ...(Array.isArray(row.specializations) ? row.specializations : []),
    row.primary_specialization || '',
  ].join(' ').toLowerCase();
  const serviceName = (ctx.serviceName || '').toLowerCase();
  const specialised = serviceName
    && serviceName.split(/\s+/).filter((t) => t.length > 3).some((t) => specs.includes(t));
  const serviceMatch = specialised ? 1.0 : 0.75;

  /* Location — a named temple is the strongest possible signal. */
  let locationMatch = 0;
  if (row.serves_temple) locationMatch = 1.0;
  else if (row.same_city) locationMatch = 0.8;
  else if (ctx.wantsOnline && row.service_offers_online) locationMatch = 0.6;
  else if (row.same_state) locationMatch = 0.5;
  else locationMatch = 0.15;                 // reachable but far

  /* Performance — completed work and leads that converted. */
  const completionRate = num(row.leads_90d) > 0
    ? clamp01(num(row.leads_completed) / Math.max(1, num(row.leads_90d)))
    : 0.5;                                    // no data -> neutral, not punished
  const performance = clamp01(
    0.6 * saturate(row.completed_ceremonies, 25) + 0.4 * completionRate,
  );

  /* Reviews — Bayesian, never the raw average. */
  const adjusted = bayesianRating(
    row.avg_rating, row.review_count, w['rating.prior_mean'], w['rating.prior_weight'],
  );
  const reviewQuality = clamp01((adjusted - 1) / 4);   // 1–5 star scale -> 0–1

  /* Service-specific experience beats total years. 7 years and 500 Baglamukhi
     havans should outrank 10 years and 2 of them. */
  const serviceExperience = clamp01(
    0.7 * saturate(row.service_reviews, 10)
    + 0.3 * saturate(row.experience_years, 8),
  );

  /* Recency — reachable lately. Uses ctx.now so the function stays pure. */
  const now = ctx.now ? new Date(ctx.now).getTime() : Date.now();
  const lastLead = row.last_lead_at ? new Date(row.last_lead_at).getTime() : null;
  const daysSince = lastLead ? (now - lastLead) / 86_400_000 : null;
  const recentActivity = daysSince == null
    ? 0.4                                     // never contacted — new, not bad
    : clamp01(1 - daysSince / 90);

  /* Profile completeness — an empty card is worse than one fewer card. */
  const completenessChecks = [
    Boolean(row.profile_photo_url),
    Boolean(row.short_bio || row.bio),
    Boolean(row.video_intro_url),
    Array.isArray(row.specializations) && row.specializations.length > 0,
    Boolean(row.video_kyc_completed),
    num(row.experience_years) > 0,
  ];
  const profileCompleteness = completenessChecks.filter(Boolean).length / completenessChecks.length;

  /* Availability — eligibility checked is_available; this checks the plan has
     not lapsed. Note it does NOT reward a higher tier: paid placement must
     never masquerade as organic relevance (AI_RANKING_ENGINE.md §8). */
  const subscriptionLive = !row.subscription_expires_at
    || new Date(row.subscription_expires_at).getTime() > now;
  const availability = row.is_available && subscriptionLive ? 1 : 0.5;

  const factors = {
    serviceMatch, locationMatch, performance, reviewQuality,
    serviceExperience, recentActivity, profileCompleteness, availability,
  };

  const score =
      w['weight.service_match'] * serviceMatch
    + w['weight.location_match'] * locationMatch
    + w['weight.performance'] * performance
    + w['weight.review_quality'] * reviewQuality
    + w['weight.service_experience'] * serviceExperience
    + w['weight.recent_activity'] * recentActivity
    + w['weight.profile_completeness'] * profileCompleteness
    + w['weight.availability'] * availability;

  return { score: clamp01(score), factors, adjustedRating: adjusted };
}

/** "Excellent match", not "93.217%" — false precision invites argument. */
function matchLabel(score) {
  if (score >= 0.85) return 'Excellent match';
  if (score >= 0.70) return 'Strong match';
  if (score >= 0.55) return 'Good match';
  return 'Possible match';
}

/**
 * Why this pandit, in words, with every clause backed by a stored fact.
 * Never "our AI picked this one".
 */
function explain(row, factors, ctx = {}) {
  const bits = [];
  if (factors.locationMatch >= 1) bits.push(`performs at ${ctx.templeName || 'the temple you asked about'}`);
  else if (factors.locationMatch >= 0.8) bits.push(`based in ${row.city}`);
  else if (ctx.wantsOnline && row.service_offers_online) bits.push('offers this ritual online');

  if (num(row.service_reviews) >= 5) {
    bits.push(`${row.service_reviews} verified reviews for ${ctx.serviceName || 'this service'}`);
  } else if (num(row.experience_years) > 0) {
    bits.push(`${row.experience_years} years of experience`);
  }
  if (num(row.completed_ceremonies) >= 10) bits.push(`${row.completed_ceremonies} ceremonies completed`);

  if (!bits.length) return 'Verified and available for this service.';
  const s = bits.join(', ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/**
 * Sanitized shape for the LLM and the client.
 *
 * The allow-list is the point. Phone numbers, DOB, email, lead history and
 * admin notes must never reach the model — and an allow-list cannot leak a
 * column somebody adds later, whereas a deny-list silently would.
 */
function toPublicCard(row, scored, ctx) {
  return {
    panditId: row.id,
    slug: row.slug,
    name: row.full_name,
    title: row.title,
    photoUrl: row.profile_photo_url,
    verified: row.verification_status === 'verified',
    rating: num(row.avg_rating),
    reviewCount: num(row.review_count),
    experienceYears: num(row.experience_years),
    completedCeremonies: num(row.completed_ceremonies),
    serviceReviews: num(row.service_reviews),
    city: row.city,
    state: row.state,
    offersOnline: Boolean(row.service_offers_online),
    matchLabel: matchLabel(scored.score),
    reason: explain(row, scored.factors, ctx),
    // Internal only — stripped before the LLM prompt, kept for analytics.
    _score: scored.score,
    _factors: scored.factors,
  };
}

/**
 * Rank eligible candidates and return the top N.
 *
 * Exploration: at most `exploration.slots` of the returned list may be given to
 * a newly verified pandit who clears `exploration.min_score`. Relevance still
 * comes first — a weak match is never shown for the sake of distribution,
 * because that trades the devotee's outcome for the marketplace's.
 *
 * Rotation: without ctx.sessionKey, the exact same query returns the exact
 * same top-N forever, for every visitor — a pandit permanently monopolizing
 * a high-value AI recommendation slot, exactly the "same 5 pandits forever"
 * problem the distribution engine exists to solve elsewhere on the platform.
 * A small deterministic noise term, seeded per (session, candidate) the same
 * way fairness.js seeds its own rotation, is added only within a band of the
 * top ~3x candidates BEFORE picking the top N — it can reorder two already-
 * comparable matches, it cannot promote a candidate the plain relevance
 * score ranked meaningfully lower.
 */
function rankCandidates(rows, ctx = {}, weights = WEIGHT_DEFAULTS, limit = 3) {
  const w = { ...WEIGHT_DEFAULTS, ...weights };

  const scored = rows.map((row) => ({ row, ...scoreCandidate(row, ctx, w) }))
    .sort((a, b) => b.score - a.score);

  // De-duplicate defensively: a pandit attached to two matching temples could
  // otherwise appear twice through a wider join.
  const seen = new Set();
  const unique = scored.filter((s) => !seen.has(s.row.id) && seen.add(s.row.id));

  const bandMultiplier = Math.max(1, w['rotation.band_multiplier']);
  const noise = Math.max(0, w['rotation.noise']);
  const bandSize = Math.min(unique.length, Math.max(limit, Math.round(limit * bandMultiplier)));
  const band = unique.slice(0, bandSize)
    .map((s) => ({ ...s, score: s.score + noise * hash01(`${ctx.sessionKey || ''}:${s.row.id}`) }))
    .sort((a, b) => b.score - a.score);
  const rotated = [...band, ...unique.slice(bandSize)];

  const top = rotated.slice(0, limit);
  const slots = Math.max(0, Math.round(w['exploration.slots']));
  const minScore = w['exploration.min_score'];

  if (slots > 0 && rotated.length > limit) {
    const isNew = (s) => num(s.row.review_count) < 5 && num(s.row.completed_ceremonies) < 5;
    const alreadyNew = top.filter(isNew).length;
    if (alreadyNew < slots) {
      const candidate = rotated.slice(limit).find(
        (s) => isNew(s) && s.score >= minScore && s.factors.serviceMatch >= 0.75,
      );
      if (candidate) {
        top[top.length - 1] = candidate;     // replace the weakest incumbent
        top.sort((a, b) => b.score - a.score);
      }
    }
  }

  return top.map((s) => toPublicCard(s.row, s, ctx));
}

/** Full path: eligibility -> scoring -> top N. */
async function recommendPandits(opts, limit = 3) {
  const rows = await fetchCandidates(opts);
  if (!rows.length) return { pandits: [], gapType: 'no_pandit' };
  const weights = await getWeights();
  return { pandits: rankCandidates(rows, opts, weights, limit), gapType: null };
}

module.exports = {
  recommendPandits,
  fetchCandidates,
  rankCandidates,
  scoreCandidate,
  bayesianRating,
  matchLabel,
  explain,
  toPublicCard,
  getWeights,
  WEIGHT_DEFAULTS,
};
