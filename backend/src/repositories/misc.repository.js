const { query } = require('../config/db');

/**
 * `features` has two shapes in the wild:
 *   - the ORIGINAL seeded object: { per, highlights: [], cta }
 *   - the ARRAY an admin now produces from the Plans screen: ["Verified badge", ...]
 * Both are supported rather than migrating the seed, because the seed file is
 * regenerated from frontend content.ts (see README's data-sync chain) and a
 * one-way migration would be undone the next time someone runs `npm run seed`.
 */
function readInclusions(features) {
  if (Array.isArray(features)) return features;
  if (features && Array.isArray(features.highlights)) return features.highlights;
  return [];
}

async function plans() {
  const { rows } = await query(
    `SELECT name, tier, price_monthly, price_quarterly, price_yearly, currency,
            features, description, tagline, lead_credits_monthly,
            max_temple_listings, max_service_listings, max_photos, is_popular
       FROM subscription_plans
      WHERE is_active = TRUE
      ORDER BY display_order`,
  );
  return rows.map((p) => ({
    name: p.name,
    tier: p.tier,
    price: p.price_monthly,
    priceMonthly: p.price_monthly,
    priceQuarterly: p.price_quarterly,
    priceYearly: p.price_yearly,
    currency: p.currency || 'INR',
    per: (!Array.isArray(p.features) && p.features?.per) || 'month',
    // `feats` is the long-standing key the existing plan cards render from —
    // kept so nothing on the current site breaks; `inclusions` is the same
    // list under the name the new pandit Plan page uses.
    feats: readInclusions(p.features),
    inclusions: readInclusions(p.features),
    description: p.description || null,
    tagline: p.tagline || null,
    leadCreditsMonthly: p.lead_credits_monthly,
    limits: {
      templeListings: p.max_temple_listings,
      serviceListings: p.max_service_listings,
      photos: p.max_photos,
    },
    cta: (!Array.isArray(p.features) && p.features?.cta) || 'Upgrade',
    popular: p.is_popular,
  }));
}

async function stats() {
  const { rows } = await query('SELECT icon, number_label AS num, label FROM stats ORDER BY display_order');
  return rows;
}

async function taxonomy() {
  const { rows } = await query('SELECT kind, value FROM taxonomy ORDER BY kind, display_order');
  return {
    cities: rows.filter((r) => r.kind === 'city').map((r) => r.value),
    states: rows.filter((r) => r.kind === 'state').map((r) => r.value),
    languages: rows.filter((r) => r.kind === 'language').map((r) => r.value),
  };
}

async function blogList({ q, cat }) {
  const where = ["status = 'published'"];
  const params = [];
  if (cat && cat !== 'All') { params.push(cat); where.push(`category = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR excerpt ILIKE $${params.length})`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(
    `SELECT slug AS id, category AS cat, title, published_at AS date, excerpt FROM blog_posts ${whereSql} ORDER BY published_at DESC`,
    params,
  );
  return rows;
}

async function blogBySlug(slug) {
  const { rows } = await query(
    `SELECT slug AS id, category AS cat, title, published_at AS date, excerpt, body FROM blog_posts WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  return rows[0] || null;
}

async function recommendRules() {
  const { rows } = await query('SELECT keywords AS keys, service_slugs AS svc, why FROM recommend_rules');
  return rows;
}

async function logAiRecommendation({ userId, text, why, serviceIds, responseTimeMs }) {
  await query(
    `INSERT INTO ai_recommendations (user_id, user_query, recommendation_text, recommended_services, model_version, response_time_ms)
     VALUES ($1, $2, $3, $4, 'rule-engine-v1', $5)`,
    [userId || null, text, why, serviceIds.length ? serviceIds : null, responseTimeMs],
  );
}

module.exports = {
  plans, stats, taxonomy, blogList, blogBySlug, recommendRules,
  logAiRecommendation,
};
