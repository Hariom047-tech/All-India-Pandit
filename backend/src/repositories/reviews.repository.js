const { query } = require('../config/db');

/** Public feed — used by the homepage/testimonials section. */
async function list({ targetType, targetSlug } = {}) {
  const where = ['r.is_approved = TRUE', 'r.deleted_at IS NULL'];
  const params = [];
  if (targetType === 'platform') {
    // Platform reviews have no target row — reviewable_id is NULL by design.
    where.push(`r.reviewable_type = 'platform'`);
  } else if (targetType && targetSlug) {
    // Table name is chosen from a hardcoded pair, never interpolated from
    // user input — targetType is validated against an allow-list upstream.
    const table = targetType === 'pandit' ? 'pandits' : 'temples';
    params.push(targetType, targetSlug);
    where.push(`r.reviewable_type = $${params.length - 1}`);
    where.push(`r.reviewable_id = (SELECT id FROM ${table} WHERE slug = $${params.length})`);
  }
  const { rows } = await query(
    `SELECT r.id, u.full_name AS name, u.city, r.rating, r.title, r.body AS text, sv.name AS service, r.created_at, r.photo_urls, r.video_url
     FROM reviews r JOIN users u ON u.id = r.user_id LEFT JOIN services sv ON sv.id = r.service_id
     WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC`,
    params,
  );
  return rows;
}

async function resolveTargetId(targetType, targetSlug) {
  if (targetType === 'platform') return null;   // no target row, by design
  const table = targetType === 'pandit' ? 'pandits' : 'temples';
  const { rows } = await query(`SELECT id FROM ${table} WHERE slug = $1`, [targetSlug]);
  return rows[0]?.id || null;
}

async function create({ userId, targetType, targetId, rating, title, body, serviceSlug, photoUrls }) {
  let serviceId = null;
  if (serviceSlug) {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1', [serviceSlug]);
    serviceId = rows[0]?.id || null;
  }
  // Not RLS-gated (reviews has no RLS enabled — reviews are always public
  // once approved), so a plain RETURNING here is fine regardless of context.
  const { rows } = await query(
    `INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, title, body, service_id, photo_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [userId, targetType, targetId, rating, title || null, body || null, serviceId, photoUrls || []],
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

/** Has this user already reviewed this target? Backs a friendly 409 instead
 *  of surfacing the unique-index violation. */
async function alreadyReviewed(userId, targetType, targetId) {
  const { rows } = await query(
    `SELECT 1 FROM reviews
      WHERE user_id = $1 AND reviewable_type = $2::reviewable_type
        AND reviewable_id IS NOT DISTINCT FROM $3
        AND deleted_at IS NULL
      LIMIT 1`,
    [userId, targetType, targetId],
  );
  return rows.length > 0;
}

/** Is this pandit profile owned by this user? Blocks self-review. */
async function ownsPandit(userId, panditId) {
  const { rows } = await query(
    'SELECT 1 FROM pandits WHERE id = $1 AND user_id = $2 LIMIT 1', [panditId, userId]);
  return rows.length > 0;
}

module.exports = { list, resolveTargetId, create, alreadyReviewed, ownsPandit };
