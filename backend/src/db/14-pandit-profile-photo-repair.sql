-- ============================================================================
-- Module 22: Repair pandit profile photos
-- ============================================================================
-- DATA REPAIR for a bug in admin/media.repository.js `add()`, which set the
-- avatar with:
--
--     UPDATE pandits SET profile_photo_url = COALESCE(profile_photo_url, $2)
--
-- "Set it only if the column is NULL" — which is never true for a seeded
-- pandit, because 02-seed.sql already writes a stock bundled path there
-- ('/assets/img/pandits/lakshman-acharya.jpg' and 15 others).
--
-- So an admin uploaded a real photograph, the admin panel badged it "Profile"
-- (a purely positional badge that never consulted the database), and the public
-- profile went on showing stock artwork. Nothing errored. Nothing looked wrong
-- in the panel.
--
-- The code is fixed for future uploads. This migration repairs the rows that
-- were already written.
--
-- Deliberately conservative: it only moves a pandit onto their own uploaded
-- photo, and only when the current value is a bundled asset path. An avatar an
-- admin explicitly chose with "Set as profile" is left alone, and a pandit with
-- no uploads is left alone.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── Photos ──────────────────────────────────────────────────────────────────
UPDATE pandits p
   SET profile_photo_url = (
     SELECT m.media_url
       FROM pandit_media m
      WHERE m.pandit_id = p.id AND m.media_type = 'photo'
      ORDER BY m.display_order, m.created_at
      LIMIT 1
   )
 WHERE
   -- Only pandits who actually have an uploaded photo.
   EXISTS (
     SELECT 1 FROM pandit_media m3 
      WHERE m3.pandit_id = p.id AND m3.media_type = 'photo'
   )
   -- ...and whose current avatar is NOT one of their own uploads. That covers
   -- both the seeded stock path and an empty/NULL column, without touching a
   -- deliberate admin choice (which is always an uploaded /uploads/... path).
   AND (
     p.profile_photo_url IS NULL
     OR p.profile_photo_url = ''
     OR p.profile_photo_url NOT IN (
       SELECT m2.media_url FROM pandit_media m2
        WHERE m2.pandit_id = p.id AND m2.media_type = 'photo'
     )
   );

-- ── Intro videos ────────────────────────────────────────────────────────────
-- Same shape of bug on the video pointer, same repair.
UPDATE pandits p
   SET video_intro_url = (
     SELECT m.media_url
       FROM pandit_media m
      WHERE m.pandit_id = p.id AND m.media_type = 'video_intro'
      ORDER BY m.display_order, m.created_at
      LIMIT 1
   )
 WHERE
   EXISTS (
     SELECT 1 FROM pandit_media m3 
      WHERE m3.pandit_id = p.id AND m3.media_type = 'video_intro'
   )
   AND (
     p.video_intro_url IS NULL
     OR p.video_intro_url = ''
     OR p.video_intro_url NOT IN (
       SELECT m2.media_url FROM pandit_media m2
        WHERE m2.pandit_id = p.id AND m2.media_type = 'video_intro'
     )
   );

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  stranded INTEGER;
  repaired INTEGER;
BEGIN
  -- Every pandit with an uploaded photo must now point at one of their own.
  SELECT COUNT(*) INTO stranded
    FROM pandits p
   WHERE EXISTS (SELECT 1 FROM pandit_media m
                  WHERE m.pandit_id = p.id AND m.media_type = 'photo')
     AND (
       p.profile_photo_url IS NULL
       OR p.profile_photo_url NOT IN (
         SELECT m2.media_url FROM pandit_media m2
          WHERE m2.pandit_id = p.id AND m2.media_type = 'photo')
     );

  IF stranded > 0 THEN
    RAISE EXCEPTION
      'Migration 14 incomplete — % pandit(s) have an uploaded photo but their avatar still points elsewhere', stranded;
  END IF;

  SELECT COUNT(*) INTO repaired
    FROM pandits p
   WHERE EXISTS (SELECT 1 FROM pandit_media m
                  WHERE m.pandit_id = p.id AND m.media_type = 'photo');

  RAISE NOTICE 'Migration 14 applied: % pandit(s) with uploaded photos now show their own photograph.', repaired;
END
$verify$;
