const crypto = require('crypto');
const { query } = require('../config/db');
const panditsRepo = require('./pandits.repository');

const SORT_COLUMNS = {
  rating: 'avg_rating DESC',
  reviews: 'review_count DESC',
  pandits: 'pandit_count DESC',
  name: 'name ASC',
};

const BASE_SELECT = `
  SELECT id, slug, name, city, state, primary_deity AS deity, avg_rating AS rating,
         review_count AS reviews, pandit_count AS pandits, cover_image_url AS img, short_description AS about
  FROM temples
`;

/** Filterable, sortable, paginated temple list. Every filter is optional and
 *  additive (AND'ed together); city/state/service accept one or many values. */
async function list({ q, city, state, service, minRating, sort, page, perPage }) {
  const where = ['is_active = TRUE', 'deleted_at IS NULL'];
  const params = [];

  if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR city ILIKE $${params.length} OR state ILIKE $${params.length} OR primary_deity ILIKE $${params.length})`); }
  if (city && city.length) { params.push(city); where.push(`city = ANY($${params.length})`); }
  if (state && state.length) { params.push(state); where.push(`state = ANY($${params.length})`); }
  if (minRating) { params.push(minRating); where.push(`avg_rating >= $${params.length}`); }
  if (service && service.length) {
    params.push(service);
    where.push(`EXISTS (SELECT 1 FROM temple_services ts JOIN services sv ON sv.id = ts.service_id
                 WHERE ts.temple_id = temples.id AND sv.slug = ANY($${params.length}))`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const orderSql = SORT_COLUMNS[sort] || SORT_COLUMNS.rating;

  params.push(perPage, (page - 1) * perPage);
  const sql = `${BASE_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const countSql = `SELECT COUNT(*)::int AS total FROM temples ${whereSql}`;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(sql, params),
    query(countSql, params.slice(0, params.length - 2)),
  ]);

  return { data: rows, total: countRows[0].total };
}

async function getBySlug(slug) {
  const { rows } = await query(
    `SELECT id, slug, name, description, short_description AS about, primary_deity AS deity, city, state,
            latitude AS lat, longitude AS lng, cover_image_url AS img, history, significance,
            avg_rating AS rating, review_count AS reviews, pandit_count AS pandits, is_verified, is_featured
     FROM temples WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  if (!rows[0]) return null;
  const temple = rows[0];

  const { rows: services } = await query(
    `SELECT sv.slug FROM temple_services ts JOIN services sv ON sv.id = ts.service_id WHERE ts.temple_id = $1`,
    [temple.id],
  );
  const availablePandits = await panditsRepo.forTemple(temple.id);

  return { ...temple, services: services.map((r) => r.slug), availablePandits };
}

async function findIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM temples WHERE slug = $1 AND deleted_at IS NULL', [slug]);
  return rows[0]?.id || null;
}

async function forService(serviceSlug) {
  const { rows } = await query(
    `${BASE_SELECT}
     WHERE is_active = TRUE AND deleted_at IS NULL AND id IN (
       SELECT ts.temple_id FROM temple_services ts JOIN services sv ON sv.id = ts.service_id WHERE sv.slug = $1
     ) ORDER BY avg_rating DESC`,
    [serviceSlug],
  );
  return rows;
}

async function exists(slug) {
  return !!(await findIdBySlug(slug));
}

/** Records a temple-page inquiry. A specific pandit is always the ultimate
 *  recipient (schema requires inquiries.pandit_id) — if the devotee didn't
 *  pick one, panditsRepo.pickForTemple chooses the best match (see there).
 *
 *  Generates the id client-side and skips RETURNING: inquiries has RLS
 *  enabled with no unconditional SELECT policy (by design — only the
 *  submitter or the receiving pandit can read one back, see 01-schema.sql),
 *  and this insert runs anonymously. INSERT ... RETURNING would need the new
 *  row to also satisfy a SELECT policy, which an anonymous caller can't. */
async function addInquiry({ templeId, panditId, serviceSlug, name, phone, date, message }) {
  let serviceId = null;
  if (serviceSlug) {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1', [serviceSlug]);
    serviceId = rows[0]?.id || null;
  }
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO inquiries (id, pandit_id, temple_id, service_id, full_name, phone, message, preferred_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, panditId, templeId, serviceId, name, phone, message || null, date || null],
  );
  return id;
}

module.exports = { list, getBySlug, findIdBySlug, forService, exists, addInquiry };
