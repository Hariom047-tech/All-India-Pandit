-- ============================================================================
-- 10 · Temple media placement
-- ============================================================================
-- Until now a temple upload had exactly one flag: is_cover. That single bit had
-- to answer two unrelated questions, and it answered neither well:
--
--   1. "Which image represents this temple in a list?"  (card thumbnail)
--   2. "What plays in the hero banner at the top of the temple page?"
--
-- The result was visible on the live site. The temple card on /temples fell back
-- to stock artwork because nothing joined temple_media at all, while the hero on
-- /temples/:slug silently hijacked itself to the first uploaded video — so a
-- pandit's portrait video became the banner for Maa Baglamukhi.
--
-- This migration splits the two concerns:
--
--   is_cover      -> the temple's PROFILE PICTURE. Exactly one per temple, and
--                    photos only: a video cannot be a thumbnail.
--   show_in_hero  -> whether this item appears in the hero slider. Photos AND
--                    videos are eligible. Defaults TRUE (opt-out), so existing
--                    temples keep their current hero and an admin who never
--                    opens the panel never ends up with an empty banner.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ── show_in_hero ────────────────────────────────────────────────────────────
-- DEFAULT TRUE also backfills every existing row in one statement; Postgres 11+
-- stores this as a catalog default rather than rewriting the table.
ALTER TABLE temple_media
  ADD COLUMN IF NOT EXISTS show_in_hero BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN temple_media.show_in_hero IS
  'Item appears in the temple page hero slider. Photos and videos both allowed. Opt-out: TRUE by default.';

COMMENT ON COLUMN temple_media.is_cover IS
  'The temple profile picture — used for list cards, search results and social previews. Photos only; at most one per temple (uq_temple_media_one_cover).';

-- ── One cover per temple, enforced by the database ──────────────────────────
-- setCover() writes `is_cover = (id = $2)` in a single UPDATE, which is atomic,
-- but nothing stopped a future code path or a manual psql session from setting
-- two. A partial unique index makes the invariant structural.
--
-- Repaired first: if the table already holds more than one cover for a temple,
-- CREATE UNIQUE INDEX would fail and abort the whole migration. Keep the
-- lowest display_order (the one the admin sees first) and clear the rest.
UPDATE temple_media tm
   SET is_cover = FALSE
 WHERE tm.is_cover
   AND tm.id <> (
     SELECT keep.id FROM temple_media keep
      WHERE keep.temple_id = tm.temple_id AND keep.is_cover
      ORDER BY keep.display_order, keep.created_at
      LIMIT 1
   );

-- A video can never be the profile picture. Existing bad rows are demoted
-- rather than left to violate the new rule silently.
UPDATE temple_media SET is_cover = FALSE
 WHERE is_cover AND media_type <> 'photo';

CREATE UNIQUE INDEX IF NOT EXISTS uq_temple_media_one_cover
  ON temple_media (temple_id)
  WHERE is_cover;

-- Hero reads are ordered lookups filtered on a boolean — the common query on
-- every temple page load.
CREATE INDEX IF NOT EXISTS idx_temple_media_hero
  ON temple_media (temple_id, display_order)
  WHERE show_in_hero;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- The app connects as the unprivileged panditconnect_app role. A new column on
-- an existing table inherits the table grant, so nothing extra is needed here —
-- but the role may not exist on a fresh developer machine, so guard the check.
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON temple_media TO panditconnect_app;
  END IF;
END
$grant$;

-- ── Self-check ──────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  dupes INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temple_media' AND column_name = 'show_in_hero')
    THEN RAISE EXCEPTION 'Migration 10 incomplete — temple_media.show_in_hero is missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE tablename = 'temple_media' AND indexname = 'uq_temple_media_one_cover')
    THEN RAISE EXCEPTION 'Migration 10 incomplete — uq_temple_media_one_cover was not created'; END IF;

  SELECT COUNT(*) INTO dupes FROM (
    SELECT temple_id FROM temple_media WHERE is_cover GROUP BY temple_id HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0
    THEN RAISE EXCEPTION 'Migration 10 incomplete — % temple(s) still have multiple covers', dupes; END IF;

  IF EXISTS (SELECT 1 FROM temple_media WHERE is_cover AND media_type <> 'photo')
    THEN RAISE EXCEPTION 'Migration 10 incomplete — a non-photo is still flagged as the cover'; END IF;

  RAISE NOTICE 'Migration 10 applied: is_cover = profile picture (one per temple, photos only), show_in_hero = hero slider placement.';
END
$verify$;

COMMIT;
