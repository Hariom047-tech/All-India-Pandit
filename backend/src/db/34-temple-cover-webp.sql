-- ============================================================================
-- Serve temple cover photos as WebP
-- ============================================================================
-- Every temple's S3-hosted cover photo (media.panditsuggest.com/temples/*.jpg)
-- was a re-encoded-but-unresized JPEG, 77KB-435KB each — the dominant weight
-- on the Temples list and Temple detail pages under PageSpeed's mobile
-- Slow-4G test (LCP 9.6s).
--
-- A same-dimension WebP re-encode of each one already exists in S3 (uploaded
-- alongside the JPEGs, same key with a .webp extension) — this just repoints
-- the URL, no re-encoding here. Only rewrites a temple whose cover is still
-- the S3 JPEG path; a temple with no S3-hosted cover (test fixtures, any
-- future admin-uploaded cover_image_url pointing elsewhere) is untouched.
--
-- Idempotent.
-- ============================================================================

BEGIN;

UPDATE temples
   SET cover_image_url = REPLACE(cover_image_url, '.jpg', '.webp')
 WHERE cover_image_url LIKE 'https://media.panditsuggest.com/temples/%.jpg';

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  remaining INTEGER;
  switched INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM temples
   WHERE cover_image_url LIKE 'https://media.panditsuggest.com/temples/%.jpg';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Migration 34 incomplete — % temple(s) still point at a JPEG cover', remaining;
  END IF;

  SELECT COUNT(*) INTO switched
    FROM temples
   WHERE cover_image_url LIKE 'https://media.panditsuggest.com/temples/%.webp';

  RAISE NOTICE 'Migration 34 applied: % temple(s) now serve their cover photo as WebP.', switched;
END
$verify$;
