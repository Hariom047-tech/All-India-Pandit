/** temple_media CRUD. The table existed since 01-schema.sql but nothing ever
 *  wrote to it, so temple galleries could only show bundled stock artwork.
 *
 *  Two independent placement flags, split by migration 10:
 *    is_cover      — the temple PROFILE PICTURE. Photos only, one per temple.
 *                    Drives list cards, search results and social previews.
 *    show_in_hero  — appears in the hero slider on the temple page. Photos and
 *                    videos both eligible. Opt-out (TRUE by default).
 *
 *  Every function here receives `q` from req.db, which is bound to a
 *  withUserContext() transaction — so multi-statement writes below are atomic.
 */

const COLUMNS = `id, media_url, media_key, media_type, title, caption, display_order,
                 is_cover, show_in_hero, mime_type, created_at`;

async function list(q, templeId) {
  const { rows } = await q(
    `SELECT ${COLUMNS}
       FROM temple_media WHERE temple_id = $1
      ORDER BY display_order, created_at`,
    [templeId],
  );
  return rows;
}

async function add(q, templeId, { mediaUrl, mediaKey, mediaType, title, caption, mimeType, sizeBytes, uploadedBy }) {
  const { rows: orderRows } = await q(
    'SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM temple_media WHERE temple_id = $1',
    [templeId],
  );
  // First photo becomes the profile picture unless one is already set.
  const { rows: coverRows } = await q(
    `SELECT 1 FROM temple_media WHERE temple_id = $1 AND is_cover = TRUE LIMIT 1`, [templeId],
  );
  const isCover = mediaType === 'photo' && coverRows.length === 0;

  const { rows } = await q(
    `INSERT INTO temple_media
       (temple_id, media_url, media_key, media_type, title, caption, display_order, is_cover, mime_type, file_size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4::media_type, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLUMNS}`,
    [templeId, mediaUrl, mediaKey || null, mediaType, title || null, caption || null,
      orderRows[0].next, isCover, mimeType || null, sizeBytes || null, uploadedBy || null],
  );
  return rows[0];
}

async function remove(q, templeId, mediaId) {
  const { rows } = await q(
    'DELETE FROM temple_media WHERE id = $1 AND temple_id = $2 RETURNING media_url, media_type, is_cover',
    [mediaId, templeId],
  );
  if (!rows[0]) return null;
  // Promote the next photo rather than leaving the temple with no profile
  // picture — otherwise the list card silently falls back to stock artwork.
  if (rows[0].is_cover) {
    await q(
      `UPDATE temple_media SET is_cover = TRUE
        WHERE id = (SELECT id FROM temple_media
                     WHERE temple_id = $1 AND media_type = 'photo'
                     ORDER BY display_order, created_at LIMIT 1)`,
      [templeId],
    );
  }
  return rows[0];
}

/** Set the temple's profile picture. Photos only — a video cannot be a thumbnail. */
async function setCover(q, templeId, mediaId) {
  const { rows } = await q(
    `SELECT id FROM temple_media WHERE id = $1 AND temple_id = $2 AND media_type = 'photo'`,
    [mediaId, templeId],
  );
  if (!rows[0]) return false;

  // Two statements, not `SET is_cover = (id = $2)`. Migration 10 added a
  // partial unique index on (temple_id) WHERE is_cover, and a single UPDATE
  // touching both rows can hit that index mid-statement if Postgres happens to
  // set the new cover before clearing the old one. Clearing first makes the
  // order explicit; the surrounding transaction keeps it atomic.
  await q('UPDATE temple_media SET is_cover = FALSE WHERE temple_id = $1 AND is_cover', [templeId]);
  await q('UPDATE temple_media SET is_cover = TRUE WHERE id = $1 AND temple_id = $2', [mediaId, templeId]);
  return true;
}

/**
 * Toggle whether an item appears in the hero slider.
 *
 * Unlike the profile picture this is a plain per-row flag: any number of items
 * can be in the hero, and videos are allowed. Returns null when the media does
 * not belong to this temple, so the controller can answer 404 rather than
 * silently reporting success.
 */
async function setHero(q, templeId, mediaId, show) {
  const { rows } = await q(
    `UPDATE temple_media SET show_in_hero = $3
      WHERE id = $1 AND temple_id = $2
      RETURNING ${COLUMNS}`,
    [mediaId, templeId, Boolean(show)],
  );
  return rows[0] || null;
}

async function reorder(q, templeId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await q('UPDATE temple_media SET display_order = $3 WHERE id = $1 AND temple_id = $2',
      [orderedIds[i], templeId, i]);
  }
  return list(q, templeId);
}

module.exports = { list, add, remove, setCover, setHero, reorder };
