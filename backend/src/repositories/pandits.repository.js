const crypto = require('crypto');
const { query } = require('../config/db');

const SORT_COLUMNS = {
  rating: 'p.avg_rating DESC',
  exp: 'p.experience_years DESC',
  reviews: 'p.review_count DESC',
  name: 'u.full_name ASC',
};

const BASE_SELECT = `
  SELECT p.id, p.slug, p.title, u.full_name AS name, u.city, u.state, p.experience_years AS exp,
         p.avg_rating AS rating, p.review_count AS reviews, p.verification_status, p.current_tier,
         p.public_phone AS phone, p.whatsapp_number, p.bio AS about, p.short_bio, p.profile_photo_url AS img,
         p.is_available, p.is_featured, p.rank_score
  FROM pandits p JOIN users u ON u.id = p.user_id
`;

/** Filterable, sortable, paginated pandit list. Every filter is optional and
 *  additive (AND'ed together); city/service/lang accept one or many values. */
async function list({ q, city, service, lang, minExp, minRating, verified, sort, page, perPage }) {
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
  return { ...hydrated, associatedTemples: temples };
}

async function findIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM pandits WHERE slug = $1 AND deleted_at IS NULL', [slug]);
  return rows[0]?.id || null;
}

async function exists(slug) {
  return !!(await findIdBySlug(slug));
}

async function forService(serviceSlug) {
  const { rows } = await query(
    `${BASE_SELECT} JOIN pandit_services ps ON ps.pandit_id = p.id
     JOIN services sv ON sv.id = ps.service_id
     WHERE sv.slug = $1 AND ps.is_active = TRUE
     ORDER BY p.avg_rating DESC`,
    [serviceSlug],
  );
  return hydrate(rows);
}

async function forTemple(templeId) {
  const { rows } = await query(
    `${BASE_SELECT} JOIN pandit_temples pt ON pt.pandit_id = p.id
     WHERE pt.temple_id = $1 AND pt.is_active = TRUE
     ORDER BY p.avg_rating DESC`,
    [templeId],
  );
  return hydrate(rows);
}

/** Picks a pandit to route a temple-level inquiry to, when the caller didn't
 *  name one — prefers one offering the requested service, else the temple's
 *  top-rated associated pandit. Returns null if the temple has none. */
async function pickForTemple(templeId, serviceSlug) {
  if (serviceSlug) {
    const { rows } = await query(
      `SELECT p.id FROM pandits p
       JOIN pandit_temples pt ON pt.pandit_id = p.id
       JOIN pandit_services ps ON ps.pandit_id = p.id
       JOIN services sv ON sv.id = ps.service_id
       WHERE pt.temple_id = $1 AND pt.is_active = TRUE AND sv.slug = $2
       ORDER BY p.avg_rating DESC LIMIT 1`,
      [templeId, serviceSlug],
    );
    if (rows[0]) return rows[0].id;
  }
  const { rows } = await query(
    `SELECT p.id FROM pandits p JOIN pandit_temples pt ON pt.pandit_id = p.id
     WHERE pt.temple_id = $1 AND pt.is_active = TRUE ORDER BY p.avg_rating DESC LIMIT 1`,
    [templeId],
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

module.exports = { list, hydrate, getBySlug, findIdBySlug, exists, forService, forTemple, pickForTemple, addEnquiry };
