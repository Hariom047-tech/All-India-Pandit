const crypto = require('crypto');
const { query } = require('../config/db');
const panditsRepo = require('./pandits.repository');

const SORT_COLUMNS = {
  rating: 'avg_rating DESC',
  reviews: 'review_count DESC',
  pandits: 'pandit_count DESC',
  name: 'name ASC',
};

/**
 * The list card image.
 *
 * This used to read `cover_image_url` alone, which is the legacy text column
 * nothing writes to any more — so a temple with a freshly uploaded profile
 * picture still showed stock artwork on /temples while the detail page showed
 * the real photo. The LATERAL join resolves the uploaded profile picture and
 * falls back, in order, to the first uploaded photo and then the legacy column.
 *
 * `temples` is deliberately left unaliased: list() composes WHERE fragments
 * that reference `temples.id` by name, and aliasing the table would break them.
 * The subquery exposes only `media_url`, so the bare column names in the
 * SELECT list stay unambiguous.
 */
const COVER_JOIN = `
  LEFT JOIN LATERAL (
    SELECT tm.media_url
      FROM temple_media tm
     WHERE tm.temple_id = temples.id AND tm.media_type = 'photo'
     ORDER BY tm.is_cover DESC, tm.display_order, tm.created_at
     LIMIT 1
  ) cover ON TRUE
`;

const BASE_SELECT = `
  SELECT id, slug, name, city, state, primary_deity AS deity, avg_rating AS rating,
         review_count AS reviews, pandit_count AS pandits,
         COALESCE(cover.media_url, cover_image_url) AS img,
         short_description AS about
  FROM temples
  ${COVER_JOIN}
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

async function getBySlug(slug, market) {
  // Defensive: check if migration-11 column exists before including it in the query
  const { rows: colCheck } = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='temples' AND column_name='custom_services'`,
  );
  const hasCustomServices = colCheck.length > 0;

  const { rows } = await query(
    `SELECT id, slug, name, description, short_description AS about, primary_deity AS deity, city, state,
            address_line1, latitude AS lat, longitude AS lng, cover_image_url AS img,
            history, significance, established_year,
            ${hasCustomServices ? 'custom_services,' : "('[]'::jsonb) AS custom_services,"}
            highlights,
            avg_rating AS rating, review_count AS reviews, pandit_count AS pandits, is_verified, is_featured,
            meta_title, meta_description
     FROM temples WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  if (!rows[0]) return null;
  const temple = rows[0];

  const { rows: services } = await query(
    `SELECT sv.slug FROM temple_services ts JOIN services sv ON sv.id = ts.service_id WHERE ts.temple_id = $1`,
    [temple.id],
  );
  const availablePandits = await panditsRepo.forTemple(temple.id, market);

  // Real uploaded gallery, replacing the bundled stock artwork the detail page
  // fell back to. `gallery` is photos only (the lightbox grid); `videos` is
  // kept separate so the page never tries to render an <img> for an mp4.
  const { rows: media } = await query(
    `SELECT id, media_url, media_type, title, caption, is_cover, show_in_hero
       FROM temple_media WHERE temple_id = $1
      ORDER BY display_order, created_at`,
    [temple.id],
  );

  const photos = media.filter((m) => m.media_type === 'photo');
  const cover = photos.find((m) => m.is_cover) || photos[0];

  const shape = (m) => ({
    id: m.id,
    url: m.media_url,
    type: m.media_type === 'video' ? 'video' : 'photo',
    title: m.title,
    caption: m.caption,
  });

  /**
   * Hero slides, in the admin's order, photos and videos mixed.
   *
   * The banner used to hardcode "first uploaded video wins", which is how a
   * pandit's portrait video ended up as the Maa Baglamukhi banner. Placement
   * is now an explicit admin decision (temple_media.show_in_hero).
   *
   * The fallback chain matters: an admin who unticks everything should still
   * get a banner rather than a blank strip, so fall back to the profile
   * picture and finally to whatever the legacy column holds.
   */
  let hero = media.filter((m) => m.show_in_hero).map(shape);
  if (hero.length === 0) {
    const fallback = cover?.media_url || temple.img;
    hero = fallback ? [{ id: 'fallback', url: fallback, type: 'photo', title: null, caption: null }] : [];
  }

  return {
    ...temple,
    // An uploaded profile picture wins over the legacy cover_image_url column.
    img: cover?.media_url || temple.img,
    services: services.map((r) => r.slug),
    // Rituals particular to this temple, with no catalogue entry. Defensive
    // Array.isArray: the column is guarded by a CHECK, but a temple row that
    // predates migration 11 in a partially-migrated database would be null.
    customServices: Array.isArray(temple.custom_services) ? temple.custom_services : [],
    availablePandits,
    hero,
    gallery: photos.map(shape),
    videos: media.filter((m) => m.media_type === 'video').map(shape),
  };
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
