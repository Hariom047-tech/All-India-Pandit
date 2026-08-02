const { query } = require('../config/db');

const BASE_SELECT = `
  SELECT s.id, s.slug, s.name, s.icon_name AS icon, sc.slug AS cat, s.estimated_duration AS dur,
         s.description AS desc, s.samagri_list AS samagri, s.is_popular,
         (SELECT COUNT(*) FROM pandit_services ps WHERE ps.service_id = s.id AND ps.is_active = TRUE)::int AS pandit_count
  FROM services s JOIN service_categories sc ON sc.id = s.category_id
`;

async function list({ q, cat }) {
  const where = ['s.is_active = TRUE'];
  const params = [];
  if (cat && cat !== 'all') { params.push(cat); where.push(`sc.slug = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(`${BASE_SELECT} ${whereSql} ORDER BY s.name`, params);
  return rows;
}

async function getBySlug(slug) {
  const { rows } = await query(`${BASE_SELECT} WHERE s.slug = $1`, [slug]);
  return rows[0] || null;
}

async function findIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM services WHERE slug = $1', [slug]);
  return rows[0]?.id || null;
}

module.exports = { list, getBySlug, findIdBySlug };
