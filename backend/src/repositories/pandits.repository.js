const crypto = require('crypto');
const { query } = require('../config/db');

const SORT_COLUMNS = {
  rating: 'p.avg_rating DESC',
  exp: 'p.experience_years DESC',
  reviews: 'p.review_count DESC',
  name: 'u.full_name ASC',
};

/**
 * Market-entitlement condition, or null if none applies.
 *
 * Mirrors services/distribution/engine.js's own rule: an UNKNOWN/unresolved
 * market means "we do not guess" — every plan_market_entitlements row is
 * left untouched and the caller sees the same candidates as before. Only
 * INDIA/INTERNATIONAL actually narrow the pool, using the same table the
 * distribution engine reads, so there is exactly one source of truth for
 * "which market can this pandit's plan be shown in".
 */
function marketCondition(params, market) {
  if (market !== 'INDIA' && market !== 'INTERNATIONAL') return null;
  params.push(market);
  return `EXISTS (SELECT 1 FROM plan_market_entitlements pme
            WHERE pme.tier = p.current_tier AND pme.market = $${params.length}::lead_market AND pme.is_active)`;
}

const BASE_SELECT = `
  SELECT p.id, p.slug, p.title, u.full_name AS name, u.city, u.state, p.experience_years AS exp,
         p.avg_rating AS rating, p.review_count AS reviews, p.verification_status, p.current_tier,
         p.public_phone AS phone, p.whatsapp_number, p.bio AS about, p.short_bio, p.profile_photo_url AS img,
         p.is_available, p.is_featured, p.rank_score,
         p.vedic_education, p.gotra, p.tradition, p.responds_within, p.accepts_online,
         p.meta_title, p.meta_description
  FROM pandits p JOIN users u ON u.id = p.user_id
`;

/** Filterable, sortable, paginated pandit list. Every filter is optional and
 *  additive (AND'ed together); city/service/lang accept one or many values. */
async function list({ q, city, service, lang, minExp, minRating, verified, sort, page, perPage, market }) {
  const where = ['u.status = \'active\'', 'p.deleted_at IS NULL', 'u.deleted_at IS NULL'];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(
      u.full_name ILIKE $${params.length} OR u.city ILIKE $${params.length} OR u.state ILIKE $${params.length}
      OR EXISTS (SELECT 1 FROM pandit_languages pl WHERE pl.pandit_id = p.id AND pl.language ILIKE $${params.length})
      OR EXISTS (SELECT 1 FROM pandit_services ps JOIN services sv ON sv.id = ps.service_id
                 WHERE ps.pandit_id = p.id AND sv.name ILIKE $${params.length})
    )`);
  }
  if (city && city.length) { params.push(city); where.push(`u.city = ANY($${params.length})`); }
  if (service && service.length) {
    params.push(service);
    where.push(`EXISTS (SELECT 1 FROM pandit_services ps JOIN services sv ON sv.id = ps.service_id
                 WHERE ps.pandit_id = p.id AND sv.slug = ANY($${params.length}))`);
  }
  if (lang && lang.length) {
    params.push(lang);
    where.push(`EXISTS (SELECT 1 FROM pandit_languages pl WHERE pl.pandit_id = p.id AND pl.language = ANY($${params.length}))`);
  }
  if (minExp) { params.push(minExp); where.push(`p.experience_years >= $${params.length}`); }
  if (minRating) { params.push(minRating); where.push(`p.avg_rating >= $${params.length}`); }
  if (verified === true || verified === 'true') where.push("p.verification_status = 'verified'");
  const marketCond = marketCondition(params, market);
  if (marketCond) where.push(marketCond);

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const orderSql = SORT_COLUMNS[sort] || SORT_COLUMNS.rating;

  params.push(perPage, (page - 1) * perPage);
  const sql = `${BASE_SELECT} ${whereSql}
               ORDER BY ${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`;
  // full_count via a second, unpaginated COUNT — clearer here than a window
  // function once the SELECT list stopped being a plain `p.*`.
  const countSql = `SELECT COUNT(*)::int AS total FROM pandits p JOIN users u ON u.id = p.user_id ${whereSql}`;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(sql, params),
    query(countSql, params.slice(0, params.length - 2)),
  ]);

  return { data: await hydrate(rows), total: countRows[0].total };
}

/** Attaches langs[]/services[]/temples[] (as slugs) to one or more bare pandit rows. */
async function hydrate(pandits) {
  if (!pandits.length) return [];
  const ids = pandits.map((p) => p.id);
  const [{ rows: langs }, { rows: svcs }, { rows: temples }] = await Promise.all([
    query('SELECT pandit_id, language FROM pandit_languages WHERE pandit_id = ANY($1)', [ids]),
    query(`SELECT ps.pandit_id, sv.slug FROM pandit_services ps JOIN services sv ON sv.id = ps.service_id WHERE ps.pandit_id = ANY($1)`, [ids]),
    query(`SELECT pt.pandit_id, t.slug FROM pandit_temples pt JOIN temples t ON t.id = pt.temple_id WHERE pt.pandit_id = ANY($1)`, [ids]),
  ]);
  return pandits.map((p) => ({
    ...p,
    langs: langs.filter((l) => l.pandit_id === p.id).map((l) => l.language),
    services: svcs.filter((s) => s.pandit_id === p.id).map((s) => s.slug),
    temples: temples.filter((t) => t.pandit_id === p.id).map((t) => t.slug),
  }));
}

async function getBySlug(slug) {
  const { rows } = await query(`${BASE_SELECT} WHERE p.slug = $1 AND p.deleted_at IS NULL`, [slug]);
  if (!rows[0]) return null;
  const [hydrated] = await hydrate([rows[0]]);

  const { rows: temples } = await query(
    `SELECT t.id, t.slug, t.name, t.city, t.state, t.avg_rating AS rating
     FROM temples t JOIN pandit_temples pt ON pt.temple_id = t.id
     WHERE pt.pandit_id = $1 AND pt.is_active = TRUE`,
    [hydrated.id],
  );
  // Media for the public profile: the vertical reels slider reads `videos`,
  // the gallery reads `photos`. Ordered by the admin's display_order.
  const { rows: media } = await query(
    `SELECT id, media_url, media_type, title, caption
       FROM pandit_media
      WHERE pandit_id = $1 AND media_type IN ('video_intro', 'photo')
      ORDER BY display_order, created_at`,
    [hydrated.id],
  );

  return {
    ...hydrated,
    associatedTemples: temples,
    videos: media
      .filter((m) => m.media_type === 'video_intro')
      .map((m) => ({ id: m.id, url: m.media_url, title: m.title, caption: m.caption })),
    photos: media
      .filter((m) => m.media_type === 'photo')
      .map((m) => ({ id: m.id, url: m.media_url, title: m.title })),
  };
}

async function findIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM pandits WHERE slug = $1 AND deleted_at IS NULL', [slug]);
  return rows[0]?.id || null;
}

async function exists(slug) {
  return !!(await findIdBySlug(slug));
}

/**
 * Pandits allocated to perform one specific service ONLINE.
 *
 * Requires all three: the service supports remote delivery, the pandit's
 * profile accepts online work, and the admin ticked online for this specific
 * pandit+service pair. Any one of them alone would over-promise.
 */
async function forServiceOnline(serviceSlug, market) {
  const params = [serviceSlug];
  const marketCond = marketCondition(params, market);
  const { rows } = await query(
    `${BASE_SELECT} JOIN pandit_services ps ON ps.pandit_id = p.id
     JOIN services sv ON sv.id = ps.service_id
     WHERE sv.slug = $1 AND ps.is_active = TRUE
       AND ps.offers_online = TRUE
       AND p.accepts_online = TRUE
       AND sv.is_online_available = TRUE
       AND p.deleted_at IS NULL AND u.status = 'active'
       ${marketCond ? `AND ${marketCond}` : ''}
     ORDER BY p.rank_score DESC, p.avg_rating DESC`,
    params,
  );
  return hydrate(rows);
}

async function forService(serviceSlug, market) {
  const params = [serviceSlug];
  const marketCond = marketCondition(params, market);
  const { rows } = await query(
    `${BASE_SELECT} JOIN pandit_services ps ON ps.pandit_id = p.id
     JOIN services sv ON sv.id = ps.service_id
     WHERE sv.slug = $1 AND ps.is_active = TRUE
       ${marketCond ? `AND ${marketCond}` : ''}
     ORDER BY p.avg_rating DESC`,
    params,
  );
  return hydrate(rows);
}

async function forTemple(templeId, market) {
  const params = [templeId];
  const marketCond = marketCondition(params, market);
  const { rows } = await query(
    `${BASE_SELECT} JOIN pandit_temples pt ON pt.pandit_id = p.id
     WHERE pt.temple_id = $1 AND pt.is_active = TRUE
       ${marketCond ? `AND ${marketCond}` : ''}
     ORDER BY p.avg_rating DESC`,
    params,
  );
  return hydrate(rows);
}

/** Picks a pandit to route a temple-level inquiry to, when the caller didn't
 *  name one — prefers one offering the requested service, else the temple's
 *  top-rated associated pandit. Returns null if the temple has none.
 *  `market` narrows both attempts the same way public listings are narrowed —
 *  an auto-routed inquiry must not land on a pandit ineligible for this
 *  visitor's market any more than a browsed listing would show one. */
async function pickForTemple(templeId, serviceSlug, market) {
  if (serviceSlug) {
    const params = [templeId, serviceSlug];
    const marketCond = marketCondition(params, market);
    const { rows } = await query(
      `SELECT p.id FROM pandits p
       JOIN pandit_temples pt ON pt.pandit_id = p.id
       JOIN pandit_services ps ON ps.pandit_id = p.id
       JOIN services sv ON sv.id = ps.service_id
       WHERE pt.temple_id = $1 AND pt.is_active = TRUE AND sv.slug = $2
         ${marketCond ? `AND ${marketCond}` : ''}
       ORDER BY p.avg_rating DESC LIMIT 1`,
      params,
    );
    if (rows[0]) return rows[0].id;
  }
  const params = [templeId];
  const marketCond = marketCondition(params, market);
  const { rows } = await query(
    `SELECT p.id FROM pandits p JOIN pandit_temples pt ON pt.pandit_id = p.id
     WHERE pt.temple_id = $1 AND pt.is_active = TRUE
       ${marketCond ? `AND ${marketCond}` : ''}
     ORDER BY p.avg_rating DESC LIMIT 1`,
    params,
  );
  return rows[0]?.id || null;
}

// Client-generated id, no RETURNING — see temples.repository.addInquiry for
// why: inquiries has RLS with no unconditional SELECT policy, and this
// insert runs anonymously (no user context to satisfy one).
async function addEnquiry({ panditId, templeId, serviceSlug, name, phone, date, message }) {
  let serviceId = null;
  if (serviceSlug) {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1', [serviceSlug]);
    serviceId = rows[0]?.id || null;
  }
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO inquiries (id, pandit_id, temple_id, service_id, full_name, phone, message, preferred_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, panditId, templeId || null, serviceId, name, phone, message || null, date || null],
  );
  return id;
}

async function addContactClick({ panditId, method }) {
  const dbMethod = method === 'call' ? 'phone_call' : method;
  await query(
    `INSERT INTO contact_clicks (pandit_id, contact_method) VALUES ($1, $2)`,
    [panditId, dbMethod]
  );
  await query(`SELECT increment_pandit_stats($1, 'click', $2)`, [panditId, dbMethod]);
}

/**
 * A profile view is anonymous by design: no viewer id is recorded, only a
 * counter. The pandit dashboard reports views as daily/weekly/monthly TOTALS
 * and never as a list of who looked.
 */
async function addView(panditId) {
  const { LEAD_REPORTING_TIMEZONE } = require('../config/leads');
  await query(`SELECT increment_pandit_stats($1, 'view')`, [panditId]);
  // Daily rollup so the dashboard has a real time series, not just a
  // lifetime counter.
  await query(
    `INSERT INTO pandit_analytics (pandit_id, date, profile_views)
     VALUES ($1, (NOW() AT TIME ZONE $2)::date, 1)
     ON CONFLICT (pandit_id, date) DO UPDATE
       SET profile_views = pandit_analytics.profile_views + 1`,
    [panditId, LEAD_REPORTING_TIMEZONE],
  );
}

module.exports = { forServiceOnline, list, hydrate, getBySlug, findIdBySlug, exists, forService, forTemple, pickForTemple, addEnquiry, addContactClick, addView };
