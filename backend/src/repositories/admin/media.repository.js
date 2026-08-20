/**
 * pandit_media CRUD. The table already existed in 01-schema.sql but nothing
 * ever wrote to it, so profile photos and videos could only be set by editing
 * the database by hand.
 *
 * `profile_photo_url` and `video_intro_url` on `pandits` are kept in sync as
 * denormalised "primary" pointers: the public list query reads the photo from
 * there, and keeping it accurate avoids a join on every card render.
 */

async function list(q, panditId) {
  const { rows } = await q(
    /*
     * is_primary is computed from the pandits row, not inferred from position.
     *
     * The panel previously badged whichever photo happened to be first as
     * "Profile". That is an assertion about the database made without asking
     * it — and it was wrong for every seeded pandit, hiding the fact that the
     * uploaded photo had never become the avatar. Now the badge reflects what
     * devotees actually see.
     */
    `SELECT m.id, m.media_url, m.media_key, m.media_type, m.title, m.caption, m.display_order,
            m.mime_type, m.file_size_bytes, m.created_at,
            (m.media_type = 'photo'       AND m.media_url = p.profile_photo_url) AS is_primary,
            (m.media_type = 'video_intro' AND m.media_url = p.video_intro_url)   AS is_primary_video
       FROM pandit_media m
       JOIN pandits p ON p.id = m.pandit_id
      WHERE m.pandit_id = $1
      ORDER BY m.media_type, m.display_order, m.created_at`,
    [panditId],
  );
  return rows;
}

async function add(q, panditId, { mediaUrl, mediaKey, mediaType, title, caption, mimeType, sizeBytes }) {
  // Append to the end of this media type's ordering.
  const { rows: orderRows } = await q(
    `SELECT COALESCE(MAX(display_order), -1) + 1 AS next
       FROM pandit_media WHERE pandit_id = $1 AND media_type = $2::media_type`,
    [panditId, mediaType],
  );

  const { rows } = await q(
    `INSERT INTO pandit_media
       (pandit_id, media_url, media_key, media_type, title, caption, display_order, mime_type, file_size_bytes)
     VALUES ($1, $2, $3, $4::media_type, $5, $6, $7, $8, $9)
     RETURNING id, media_url, media_key, media_type, title, caption, display_order, mime_type, created_at`,
    [panditId, mediaUrl, mediaKey || null, mediaType, title || null, caption || null,
      orderRows[0].next, mimeType || null, sizeBytes || null],
  );

  if (mediaType === 'photo') {
    /*
     * The FIRST UPLOADED photo becomes the avatar.
     *
     * This used to be `COALESCE(profile_photo_url, $2)` — "set it only if the
     * column is NULL". That silently did nothing for every seeded pandit,
     * because 02-seed.sql already puts a stock path there
     * ('/assets/img/pandits/lakshman-acharya.jpg'). An admin would upload a
     * real photograph, see it listed with a "Profile" badge, and the public
     * profile would keep showing the stock artwork indefinitely.
     *
     * The right question is not "is the column empty" but "does this pandit
     * have a real uploaded photo yet". A seeded placeholder is not a profile
     * photo. So: set it when this is the only photo in pandit_media — which
     * replaces the stock path — while later uploads leave the admin's chosen
     * avatar alone.
     */
    await q(
      `UPDATE pandits SET profile_photo_url = $2
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM pandit_media pm
             WHERE pm.pandit_id = $1
               AND pm.media_type = 'photo'
               AND pm.media_url <> $2
          )`,
      [panditId, mediaUrl],
    );
  }
  if (mediaType === 'video_intro') {
    await q(
      `UPDATE pandits SET video_intro_url = COALESCE(video_intro_url, $2) WHERE id = $1`,
      [panditId, mediaUrl],
    );
  }
  // Photo/video presence feeds calculate_pandit_rank().
  await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [panditId]);
  return rows[0];
}

async function findById(q, panditId, mediaId) {
  const { rows } = await q(
    'SELECT id, media_url, media_type FROM pandit_media WHERE id = $1 AND pandit_id = $2',
    [mediaId, panditId],
  );
  return rows[0] || null;
}

async function remove(q, panditId, mediaId) {
  const media = await findById(q, panditId, mediaId);
  if (!media) return null;

  await q('DELETE FROM pandit_media WHERE id = $1 AND pandit_id = $2', [mediaId, panditId]);

  // If this row was the primary pointer, promote the next one rather than
  // leaving `pandits` pointing at a file that no longer exists.
  if (media.media_type === 'photo') {
    await q(
      `UPDATE pandits SET profile_photo_url = (
         SELECT media_url FROM pandit_media
          WHERE pandit_id = $1 AND media_type = 'photo'
          ORDER BY display_order, created_at LIMIT 1)
       WHERE id = $1 AND profile_photo_url = $2`,
      [panditId, media.media_url],
    );
  }
  if (media.media_type === 'video_intro') {
    await q(
      `UPDATE pandits SET video_intro_url = (
         SELECT media_url FROM pandit_media
          WHERE pandit_id = $1 AND media_type = 'video_intro'
          ORDER BY display_order, created_at LIMIT 1)
       WHERE id = $1 AND video_intro_url = $2`,
      [panditId, media.media_url],
    );
  }
  await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [panditId]);
  return media;
}

/** Applies a new ordering. Ids not belonging to this pandit are ignored by the
 *  WHERE clause, so a tampered payload cannot reorder someone else's media. */
async function reorder(q, panditId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await q(
      'UPDATE pandit_media SET display_order = $3 WHERE id = $1 AND pandit_id = $2',
      [orderedIds[i], panditId, i],
    );
  }
  // The first video in the new order becomes the primary intro.
  await q(
    `UPDATE pandits SET video_intro_url = (
       SELECT media_url FROM pandit_media
        WHERE pandit_id = $1 AND media_type = 'video_intro'
        ORDER BY display_order, created_at LIMIT 1)
     WHERE id = $1`,
    [panditId],
  );
  /*
   * ...and the first PHOTO becomes the avatar. This was missing entirely:
   * only the video pointer was updated here. Dragging a different photo to
   * the top moved the "Profile" badge in the panel while
   * pandits.profile_photo_url kept pointing at the previous one, so the admin
   * was shown one avatar and devotees were shown another.
   */
  await q(
    `UPDATE pandits SET profile_photo_url = COALESCE((
       SELECT media_url FROM pandit_media
        WHERE pandit_id = $1 AND media_type = 'photo'
        ORDER BY display_order, created_at LIMIT 1), profile_photo_url)
     WHERE id = $1`,
    [panditId],
  );
  return list(q, panditId);
}

/** Explicitly promote one photo to be the avatar. */
async function setPrimaryPhoto(q, panditId, mediaId) {
  const media = await findById(q, panditId, mediaId);
  if (!media || media.media_type !== 'photo') return null;
  await q('UPDATE pandits SET profile_photo_url = $2 WHERE id = $1', [panditId, media.media_url]);
  return media;
}

module.exports = { list, add, findById, remove, reorder, setPrimaryPhoto };
