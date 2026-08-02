const { query } = require('../config/db');

async function panchang() {
  const { rows } = await query(
    `SELECT id, tithi_name AS tithi, paksha, nakshatra, yoga, karana,
            sunrise, sunset, moonrise, moonset, hindu_month AS masa
     FROM panchang_data WHERE date = CURRENT_DATE`,
  );
  if (!rows[0]) return null;
  const { id, ...core } = rows[0];

  const { rows: muhurats } = await query(
    `SELECT activity_type AS k, quality,
            to_char(start_time, 'HH12:MI AM') || ' – ' || to_char(end_time, 'HH12:MI AM') AS v
     FROM muhurat_data WHERE panchang_id = $1 ORDER BY start_time`,
    [id],
  );
  return {
    ...core,
    auspicious: muhurats.filter((m) => m.quality === 'Shubh').map(({ k, v }) => ({ k, v })),
    inauspicious: muhurats.filter((m) => m.quality === 'Ashubh').map(({ k, v }) => ({ k, v })),
  };
}

async function festivals() {
  const { rows } = await query('SELECT slug, name, description AS note, date FROM festivals ORDER BY date');
  return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
}

async function faqs() {
  const { rows } = await query('SELECT question AS q, answer AS a FROM faqs ORDER BY display_order');
  return rows;
}

async function plans() {
  const { rows } = await query(
    `SELECT name, tier, price_monthly, features, is_popular FROM subscription_plans ORDER BY display_order`,
  );
  return rows.map((p) => ({
    name: p.name,
    tier: p.tier,
    price: p.price_monthly,
    per: p.features?.per || 'month',
    feats: p.features?.highlights || [],
    cta: p.features?.cta || 'Upgrade',
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
  panchang, festivals, faqs, plans, stats, taxonomy, blogList, blogBySlug, recommendRules,
  logAiRecommendation,
};
