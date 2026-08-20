-- ============================================================
-- Module 26: S3 media keys (vendor-neutral pointer alongside media_url)
-- ============================================================
-- Part of the S3 + CloudFront media migration (docs/S3_CLOUDFRONT_MIGRATION.md).
--
-- `media_url` / `image_url` stay the single source of truth every read path
-- already uses — they are already a fully resolved, browser-ready URL
-- (local `/uploads/...` or, once AWS_S3_MEDIA_BUCKET is set,
-- `https://media.panditsuggest.com/...`). Nothing about how those columns are
-- read changes here, so no existing query, join or denormalised pointer
-- (pandits.profile_photo_url, temple_media.is_cover comparisons, etc.) is
-- touched.
--
-- `media_key` / `image_key` are ADDITIVE: the raw S3 object key
-- (e.g. `pandits/f9a72d91.webp`), populated going forward by
-- services/media/mediaStorage.js whenever a file is stored (S3 or local —
-- the key shape is the same either way). NULL for every row uploaded before
-- this migration, and NULL forever for anything uploaded while running in
-- local-disk mode. It exists so:
--   * the historical migration script (scripts/migrate-media-to-s3.js) can
--     record which rows it has already moved, safely and idempotently;
--   * a future delete-by-key or presigned-URL feature never has to re-derive
--     an S3 key by parsing a URL string.
--
-- This is deliberately NOT a replacement for media_url — see the migration
-- doc's "Database strategy" section for why that would touch far more
-- surface area (every SELECT that reads media_url) for no safety benefit.

BEGIN;

ALTER TABLE pandit_media       ADD COLUMN IF NOT EXISTS media_key TEXT;
ALTER TABLE temple_media       ADD COLUMN IF NOT EXISTS media_key TEXT;
ALTER TABLE services           ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE home_hero_images   ADD COLUMN IF NOT EXISTS image_key TEXT;

COMMENT ON COLUMN pandit_media.media_key IS
  'Raw S3 object key (e.g. pandits/<hex>.webp), NULL for pre-migration/local-disk rows. media_url remains authoritative for display.';
COMMENT ON COLUMN temple_media.media_key IS
  'Raw S3 object key, NULL for pre-migration/local-disk rows. media_url remains authoritative for display.';
COMMENT ON COLUMN services.image_key IS
  'Raw S3 object key, NULL for pre-migration/local-disk rows. image_url remains authoritative for display.';
COMMENT ON COLUMN service_categories.image_key IS
  'Raw S3 object key, NULL for pre-migration/local-disk rows. image_url remains authoritative for display.';
COMMENT ON COLUMN home_hero_images.image_key IS
  'Raw S3 object key, NULL for pre-migration/local-disk rows. image_url remains authoritative for display.';

COMMIT;

-- ============================================================
-- Self-check
-- ============================================================
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'pandit_media' AND column_name = 'media_key')
    THEN missing := missing || ' pandit_media.media_key'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temple_media' AND column_name = 'media_key')
    THEN missing := missing || ' temple_media.media_key'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'services' AND column_name = 'image_key')
    THEN missing := missing || ' services.image_key'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'service_categories' AND column_name = 'image_key')
    THEN missing := missing || ' service_categories.image_key'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'home_hero_images' AND column_name = 'image_key')
    THEN missing := missing || ' home_hero_images.image_key'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 26 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 26 applied: media_key/image_key columns ready for S3 migration.';
END
$verify$;
