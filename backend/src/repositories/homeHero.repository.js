const { query } = require('../config/db');

/**
 * Home page hero images.
 *
 * Previously the hero borrowed the three top-ranked pandits' avatars, which
 * made the front page a side effect of the ranking algorithm — promoting a
 * pandit silently changed the homepage. These are chosen deliberately.
 */

/** Public read: active images only, in admin-defined order. */
async function listPublic(q = query) {
  const { rows } = await q(
    `SELECT id, image_url, alt_text, caption
       FROM home_hero_images
      WHERE is_active = TRUE
      ORDER BY display_order, created_at
      LIMIT 3`,
  );
  return rows;
}

/** Admin read: everything, including deactivated. */
async function listAll(q = query) {
  const { rows } = await q(
    `SELECT id, image_url, alt_text, caption, display_order, is_active, created_at
       FROM home_hero_images ORDER BY display_order, created_at`,
  );
  return rows;
}

async function add(q, { imageUrl, imageKey, altText, caption, mimeType, sizeBytes, uploadedBy }) {
  const { rows: orderRows } = await q(
    'SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM home_hero_images',
  );
  const { rows } = await q(
    `INSERT INTO home_hero_images
       (image_url, image_key, alt_text, caption, display_order, mime_type, file_size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, image_url, image_key, alt_text, caption, display_order, is_active`,
    [imageUrl, imageKey || null, altText || null, caption || null, orderRows[0].next,
      mimeType || null, sizeBytes || null, uploadedBy || null],
  );
  return rows[0];
}

async function remove(q, id) {
  const { rows } = await q(
    'DELETE FROM home_hero_images WHERE id = $1 RETURNING image_url',
    [id],
  );
  return rows[0] || null;
}

async function reorder(q, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await q('UPDATE home_hero_images SET display_order = $2 WHERE id = $1', [orderedIds[i], i]);
  }
  return listAll(q);
}

module.exports = { listPublic, listAll, add, remove, reorder };
