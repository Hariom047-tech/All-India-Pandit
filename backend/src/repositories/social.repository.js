const { query } = require('../config/db');

async function savedPandits(userId) {
  const { rows } = await query(
    `SELECT p.id, p.slug, u.full_name AS name, u.city, p.avg_rating AS rating, p.profile_photo_url AS img, sp.created_at AS saved_at
     FROM saved_pandits sp JOIN pandits p ON p.id = sp.pandit_id JOIN users u ON u.id = p.user_id
     WHERE sp.user_id = $1 ORDER BY sp.created_at DESC`,
    [userId],
  );
  return rows;
}

async function savePandit(userId, panditSlug) {
  const { rows } = await query('SELECT id FROM pandits WHERE slug = $1', [panditSlug]);
  if (!rows[0]) return null;
  await query('INSERT INTO saved_pandits (user_id, pandit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, rows[0].id]);
  return rows[0].id;
}

async function unsavePandit(userId, panditSlug) {
  await query(
    `DELETE FROM saved_pandits WHERE user_id = $1 AND pandit_id = (SELECT id FROM pandits WHERE slug = $2)`,
    [userId, panditSlug],
  );
}

async function savedTemples(userId) {
  const { rows } = await query(
    `SELECT t.id, t.slug, t.name, t.city, t.avg_rating AS rating, t.cover_image_url AS img, st.created_at AS saved_at
     FROM saved_temples st JOIN temples t ON t.id = st.temple_id
     WHERE st.user_id = $1 ORDER BY st.created_at DESC`,
    [userId],
  );
  return rows;
}

async function saveTemple(userId, templeSlug) {
  const { rows } = await query('SELECT id FROM temples WHERE slug = $1', [templeSlug]);
  if (!rows[0]) return null;
  await query('INSERT INTO saved_temples (user_id, temple_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, rows[0].id]);
  return rows[0].id;
}

async function unsaveTemple(userId, templeSlug) {
  await query(
    `DELETE FROM saved_temples WHERE user_id = $1 AND temple_id = (SELECT id FROM temples WHERE slug = $2)`,
    [userId, templeSlug],
  );
}

// notifications has RLS enabled (own rows only) — both of these need RLS
// context, so callers must go through withUserContext(userId, (q) => ...).
async function notifications(userId, { unreadOnly } = {}, q = query) {
  const where = ['user_id = $1'];
  if (unreadOnly) where.push('is_read = FALSE');
  const { rows } = await q(
    `SELECT id, type, title, body, action_url, is_read, created_at FROM notifications
     WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

async function markNotificationRead(userId, id, q = query) {
  const { rowCount } = await q(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rowCount > 0;
}

module.exports = {
  savedPandits, savePandit, unsavePandit, savedTemples, saveTemple, unsaveTemple,
  notifications, markNotificationRead,
};
