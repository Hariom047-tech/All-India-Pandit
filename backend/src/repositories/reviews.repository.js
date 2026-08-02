const { query } = require('../config/db');

/** Public feed — used by the homepage/testimonials section. */
async function list({ targetType, targetSlug } = {}) {
  const where = ['r.is_approved = TRUE', 'r.deleted_at IS NULL'];
  const params = [];
  if (targetType && targetSlug) {
    const table = targetType === 'pandit' ? 'pandits' : 'temples';
    params.push(targetType, targetSlug);
    where.push(`r.reviewable_type = $${params.length - 1}`);
    where.push(`r.reviewable_id = (SELECT id FROM ${table} WHERE slug = $${params.length})`);
  }
  const { rows } = await query(
    `SELECT r.id, u.full_name AS name, u.city, r.rating, r.title, r.body AS text, sv.name AS service, r.created_at
     FROM reviews r JOIN users u ON u.id = r.user_id LEFT JOIN services sv ON sv.id = r.service_id
     WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC`,
    params,
  );
  return rows;
}

async function resolveTargetId(targetType, targetSlug) {
  const table = targetType === 'pandit' ? 'pandits' : 'temples';
  const { rows } = await query(`SELECT id FROM ${table} WHERE slug = $1`, [targetSlug]);
  return rows[0]?.id || null;
}

async function create({ userId, targetType, targetId, rating, title, body, serviceSlug }) {
  let serviceId = null;
  if (serviceSlug) {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1', [serviceSlug]);
    serviceId = rows[0]?.id || null;
  }
  // Not RLS-gated (reviews has no RLS enabled — reviews are always public
  // once approved), so a plain RETURNING here is fine regardless of context.
  const { rows } = await query(
    `INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, title, body, service_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, targetType, targetId, rating, title || null, body || null, serviceId],
  );

  if (targetType === 'pandit') {
    // notifications_insert_system (01-schema.sql) allows this unconditionally.
    await query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT p.user_id, 'new_review', 'New review received', $2
       FROM pandits p WHERE p.id = $1`,
      [targetId, `You received a ${rating}-star review.`],
    );
  }
  return rows[0].id;
}

module.exports = { list, resolveTargetId, create };
