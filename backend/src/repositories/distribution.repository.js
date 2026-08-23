/**
 * Reads for the lead-distribution engine.
 *
 * One job: fetch the eligible pandits for a pool, WITH the two counters the
 * fairness engine needs — qualified leads and position-weighted exposure —
 * scoped to the market and the rolling window.
 *
 * Everything here is a read. The scoring itself lives in
 * services/distribution/fairness.js and is pure, so it can be simulated.
 */

const { query } = require('../config/db');

/**
 * Candidates for one pool: temple × market × plan.
 *
 * The counters are computed as correlated subqueries rather than joins, on
 * purpose. A LEFT JOIN onto qualified_leads and pandit_exposure would multiply
 * rows against each other and inflate both counts — the classic fan-out bug,
 * and here it would silently corrupt the fairness maths rather than error.
 *
 * `market` filters the counters too. A ₹9k Global pandit keeps SEPARATE India
 * and International histories: strong performance in India must not make them
 * look over-served in the international pool, where they may be brand new.
 */
const CANDIDATE_SQL = `
SELECT
  p.id, p.slug, u.full_name, p.title, p.short_bio, p.bio,
  p.profile_photo_url, p.video_intro_url,
  p.experience_years, p.completed_ceremonies,
  p.avg_rating, p.review_count,
  p.verification_status, p.video_kyc_completed,
  p.is_available, p.accepts_online, p.current_tier, p.is_paused,
  p.subscription_expires_at, p.specializations, p.primary_specialization,
  p.whatsapp_number, p.public_phone,
  u.status AS user_status, u.city, u.state, u.created_at AS joined_at,

  -- Qualified leads in this market, inside the rolling window.
  (SELECT COUNT(*)::int FROM qualified_leads ql
    WHERE ql.pandit_id = p.id
      AND ql.market = $2::lead_market
      AND ($3::uuid IS NULL OR ql.temple_id = $3::uuid)
      AND ql.created_at > NOW() - ($4 || ' days')::interval
  ) AS qualified_leads,

  -- Today's leads, for the daily cap. Uses the reporting timezone rather than
  -- UTC midnight, or a pandit's "day" would roll over at 5:30am local.
  (SELECT COUNT(*)::int FROM qualified_leads ql
    WHERE ql.pandit_id = p.id
      AND ql.market = $2::lead_market
      AND ql.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
  ) AS today_leads,

  -- Position-weighted exposure. SUM of the weight STORED on each row, not
  -- recomputed — retuning the curve must not rewrite history.
  COALESCE((SELECT SUM(pe.position_weight) FROM pandit_exposure pe
    WHERE pe.pandit_id = p.id
      AND pe.market = $2::lead_market
      AND ($3::uuid IS NULL OR pe.temple_id = $3::uuid)
      AND pe.created_at > NOW() - ($4 || ' days')::interval
  ), 0)::float AS weighted_exposure,

  -- Entitlement: which markets this pandit's plan may receive leads from.
  ARRAY(
    SELECT pme.market::text FROM plan_market_entitlements pme
     WHERE pme.tier = p.current_tier AND pme.is_active
  ) AS markets,

  -- IDs, not slugs — eligibilityFailure() compares this against ctx.serviceId,
  -- which is always a resolved UUID (see pandits.controller.js's
  -- resolveServiceId). A slug here would never equal that UUID, so every
  -- service-scoped request would silently find zero eligible candidates —
  -- exactly the bug this comment replaced.
  ARRAY(SELECT ps.service_id::text FROM pandit_services ps
         WHERE ps.pandit_id = p.id AND ps.is_active) AS services,

  ARRAY(SELECT pt.temple_id::text FROM pandit_temples pt
         WHERE pt.pandit_id = p.id AND pt.is_active) AS temples

FROM pandits p
JOIN users u ON u.id = p.user_id
WHERE p.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND ($1::uuid IS NULL OR EXISTS (
        SELECT 1 FROM pandit_temples pt
         WHERE pt.pandit_id = p.id AND pt.temple_id = $1::uuid AND pt.is_active))
  AND ($5::uuid IS NULL OR EXISTS (
        SELECT 1 FROM pandit_services ps
         WHERE ps.pandit_id = p.id AND ps.service_id = $5::uuid AND ps.is_active))
LIMIT 2000
`;

/**
 * @param {object} opts
 * @param {string} [opts.templeId]
 * @param {string} [opts.serviceId]
 * @param {string} opts.market     INDIA | INTERNATIONAL
 * @param {number} opts.windowDays
 */
async function fetchCandidates({ templeId = null, serviceId = null, market, windowDays = 14 }) {
  const { rows } = await query(CANDIDATE_SQL, [
    templeId, market, templeId, String(windowDays), serviceId,
  ]);

  // Shape into what the pure engine expects. Done here, once, so fairness.js
  // never has to know about column names or node-postgres string numerics.
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.full_name,
    title: r.title,
    tier: r.current_tier,
    markets: r.markets || [],
    services: r.services || [],
    temples: r.temples || [],

    isActive: r.user_status === 'active',
    isVerified: r.verification_status === 'verified',
    isAvailable: r.is_available === true,
    isPaused: r.is_paused === true,
    subscriptionActive: !r.subscription_expires_at
      || new Date(r.subscription_expires_at).getTime() > Date.now(),

    photoUrl: r.profile_photo_url,
    videoUrl: r.video_intro_url,
    bio: r.short_bio || r.bio,
    specializations: r.specializations || [],
    primarySpecialization: r.primary_specialization,
    videoKycCompleted: r.video_kyc_completed === true,
    experienceYears: Number(r.experience_years) || 0,
    completedCeremonies: Number(r.completed_ceremonies) || 0,
    // DECIMAL arrives as a string from node-postgres.
    rating: parseFloat(r.avg_rating) || 0,
    reviewCount: Number(r.review_count) || 0,
    whatsapp: r.whatsapp_number,
    phone: r.public_phone,
    city: r.city,
    state: r.state,
    joinedAt: r.joined_at,

    qualifiedLeads: Number(r.qualified_leads) || 0,
    todayLeads: Number(r.today_leads) || 0,
    weightedExposure: Number(r.weighted_exposure) || 0,
  }));
}

/** Engine configuration, with the pure defaults as a fallback. */
async function getConfig() {
  try {
    const { rows } = await query('SELECT key, value FROM distribution_config');
    const out = {};
    for (const r of rows) out[r.key] = Number(r.value);
    return out;
  } catch {
    return {};   // table missing (pre-migration) — the engine uses its defaults
  }
}

/** Allocation weights and daily caps, per market. */
async function getEntitlements() {
  try {
    /*
     * priority_order, seat_cap and plan_price_inr arrive with migration 18.
     *
     * Naming them directly in the SELECT would make this query fail with
     * "column does not exist" on a database that has 15 but not 18 — and the
     * catch below would swallow that, leaving the engine on hardcoded defaults
     * with nothing logged. Exactly the silent failure this file exists to
     * avoid.
     *
     * to_jsonb(e) returns whatever columns the table actually has, so a
     * pre-18 database simply yields undefined for the new keys.
     */
    const { rows } = await query(
      `SELECT tier, market, allocation_weight, daily_lead_cap, to_jsonb(e) AS all_cols
         FROM plan_market_entitlements e WHERE is_active`);
    const byMarket = {};
    for (const r of rows) {
      const extra = r.all_cols || {};
      byMarket[r.market] = byMarket[r.market] || {};
      byMarket[r.market][r.tier] = {
        weight: Number(r.allocation_weight),
        dailyCap: Number(r.daily_lead_cap),
        priority: extra.priority_order == null ? null : Number(extra.priority_order),
        seatCap: extra.seat_cap == null ? null : Number(extra.seat_cap),
        priceInr: extra.plan_price_inr == null ? null : Number(extra.plan_price_inr),
      };
    }
    return byMarket;
  } catch {
    return {};
  }
}

/**
 * Record what was actually rendered.
 *
 * Only called for cards that really reached the page — recording an impression
 * for a pandit the devotee never saw would make them look over-exposed and push
 * them down for no reason.
 *
 * ON CONFLICT DO NOTHING against uq_exposure_session_hour: a refresh within the
 * same hour must not inflate anyone's exposure.
 *
 * Best-effort. A failure here must never break the listing the devotee is
 * waiting for — it costs some fairness accuracy, not the page.
 */
async function recordExposure(rows) {
  if (!rows?.length) return 0;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 7;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4}::lead_market,$${b + 5},$${b + 6},$${b + 7})`);
    params.push(r.panditId, r.templeId || null, r.serviceId || null, r.market,
      r.position, r.positionWeight, r.sessionKey || null);
  });
  try {
    const { rowCount } = await query(
      `INSERT INTO pandit_exposure
         (pandit_id, temple_id, service_id, market, position, position_weight, session_key)
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      params,
    );
    return rowCount;
  } catch (err) {
    console.error('[distribution] exposure write failed (non-fatal):', err.message);
    return 0;
  }
}

/** Admin view: is the distribution actually fair right now? */
async function poolStats({ templeId = null, market, windowDays = 14 }) {
  const { rows } = await query(
    `SELECT p.current_tier AS tier,
            COUNT(*)::int AS pandits,
            COALESCE(SUM(l.n), 0)::int AS total_leads,
            COALESCE(MIN(l.n), 0)::int AS min_leads,
            COALESCE(MAX(l.n), 0)::int AS max_leads,
            ROUND(AVG(COALESCE(l.n, 0))::numeric, 2) AS mean_leads
       FROM pandits p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS n FROM qualified_leads ql
          WHERE ql.pandit_id = p.id AND ql.market = $1::lead_market
            AND ql.created_at > NOW() - ($2 || ' days')::interval
       ) l ON TRUE
      WHERE p.deleted_at IS NULL AND u.status = 'active'
        AND ($3::uuid IS NULL OR EXISTS (
              SELECT 1 FROM pandit_temples pt
               WHERE pt.pandit_id = p.id AND pt.temple_id = $3::uuid AND pt.is_active))
        AND EXISTS (SELECT 1 FROM plan_market_entitlements pme
                     WHERE pme.tier = p.current_tier AND pme.market = $1::lead_market AND pme.is_active)
      GROUP BY p.current_tier`,
    [market, String(windowDays), templeId],
  );
  return rows;
}

module.exports = { fetchCandidates, getConfig, getEntitlements, recordExposure, poolStats };
