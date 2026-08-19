const { query } = require('../config/db');

const BASE_SELECT = `
  SELECT s.id, s.slug, s.name, s.icon_name AS icon, sc.slug AS cat, s.estimated_duration AS dur,
         s.description AS desc, s.short_description, s.samagri_list AS samagri, s.is_popular,
         s.image_url, s.recommended_muhurat, s.recommended_tithi,
         -- Admin-managed content that used to be hardcoded in
         -- frontend/app/src/data/serviceMeta.ts.
         s.benefits, s.process, s.faqs,
         s.is_online_available, s.online_note,
         s.meta_title, s.meta_description,
         (SELECT COUNT(*) FROM pandit_services ps WHERE ps.service_id = s.id AND ps.is_active = TRUE)::int AS pandit_count
  FROM services s JOIN service_categories sc ON sc.id = s.category_id
`;

async function list({ q, cat, online }) {
  const where = ['s.is_active = TRUE'];
  const params = [];
  if (cat && cat !== 'all') { params.push(cat); where.push(`sc.slug = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
  // ?online=true powers the "Online Puja / Havan" listing.
  if (online === 'true' || online === true) where.push('s.is_online_available = TRUE');

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(`${BASE_SELECT} ${whereSql} ORDER BY s.name`, params);
  return rows;
}

/** If this service has any published rows in the newer universal_faqs CMS
 *  (entity_type='SERVICE'), they replace the legacy s.faqs JSONB list for
 *  display — never both at once, so a devotee never sees the same question
 *  twice. No rows there (the common case today) leaves s.faqs untouched. */
async function getBySlug(slug) {
  const { rows } = await query(`${BASE_SELECT} WHERE s.slug = $1`, [slug]);
  const service = rows[0];
  if (!service) return null;

  const { rows: cmsFaqs } = await query(
    `SELECT question AS q, answer AS a FROM universal_faqs
      WHERE entity_type = 'SERVICE' AND entity_id = $1 AND status = 'published'
      ORDER BY sort_order`,
    [service.id],
  );
  if (cmsFaqs.length) service.faqs = cmsFaqs;
  return service;
}

async function findIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM services WHERE slug = $1', [slug]);
  return rows[0]?.id || null;
}

/**
 * Categories for the "Most booked services" strip.
 *
 * pandit_count and service_count are COMPUTED, not stored. The previous
 * hardcoded figures (186 / 257 / 251 / 167) were invented and could never be
 * right; a number on a public page should either be true or absent.
 *
 * Only categories an admin has given a home_rank appear here, so the strip
 * stays curated instead of growing silently with every new category.
 */
async function homeCategories() {
  const { rows } = await query(
    `SELECT sc.slug, sc.name, sc.image_url, sc.tagline, sc.icon_name,
            (SELECT COUNT(*) FROM services s
              WHERE s.category_id = sc.id AND s.is_active = TRUE)::int AS service_count,
            (SELECT COUNT(DISTINCT ps.pandit_id)
               FROM pandit_services ps
               JOIN services s2 ON s2.id = ps.service_id
              WHERE s2.category_id = sc.id AND ps.is_active = TRUE)::int AS pandit_count
       FROM service_categories sc
      WHERE sc.is_active = TRUE AND sc.home_rank IS NOT NULL
      ORDER BY sc.home_rank, sc.display_order
      LIMIT 8`,
  );
  return rows;
}

module.exports = {
  homeCategories, list, getBySlug, findIdBySlug };
