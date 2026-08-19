-- ============================================================
-- Module 22: Reviews for pandits, temples AND the platform
-- ============================================================
-- Three changes:
--   1. reviewable_type gains 'platform' so devotees can review PanditSuggest
--      itself, not only a pandit or a temple.
--   2. reviewable_id becomes nullable — a platform review has no target row.
--   3. One review per user per target, enforced by the database rather than
--      by hoping the UI prevents a double submit.

-- ADD VALUE first and on its own. Postgres will not let a newly added enum
-- label be *used* in the same transaction that added it, so every reference
-- below compares reviewable_type::text instead of the enum literal.
ALTER TYPE reviewable_type ADD VALUE IF NOT EXISTS 'platform';

ALTER TABLE reviews ALTER COLUMN reviewable_id DROP NOT NULL;

-- A pandit/temple review must name its target; a platform review must not.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_target_shape;
ALTER TABLE reviews ADD CONSTRAINT reviews_target_shape CHECK (
  (reviewable_type::text = 'platform' AND reviewable_id IS NULL)
  OR (reviewable_type::text <> 'platform' AND reviewable_id IS NOT NULL)
);

-- One review per user per target. Two partial indexes because NULL is never
-- equal to NULL, so a single UNIQUE(user_id, type, id) would let a user post
-- unlimited platform reviews.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_user_target
  ON reviews (user_id, reviewable_type, reviewable_id)
  WHERE reviewable_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_review_per_user
  ON reviews (user_id)
  WHERE reviewable_id IS NULL AND deleted_at IS NULL;

COMMENT ON COLUMN reviews.reviewable_id IS
  'pandit.id or temple.id. NULL for a platform review.';

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'reviewable_type' AND e.enumlabel = 'platform')
    THEN RAISE EXCEPTION 'Migration 09 incomplete — reviewable_type is missing "platform"'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='reviews' AND column_name='reviewable_id' AND is_nullable='NO')
    THEN RAISE EXCEPTION 'Migration 09 incomplete — reviewable_id is still NOT NULL'; END IF;
  RAISE NOTICE 'Migration 09 applied: platform reviews enabled, one review per user per target.';
END
$verify$;
