-- ============================================================
-- Module 19: Admin-managed home services & "Most booked" categories
-- ============================================================
-- Two hardcoded surfaces removed:
--
--  1. The homepage "Our Sacred Services" grid filtered on `service.priority`,
--     a field only the bundled content.ts ever had. The API never returned it,
--     so once the site read from the database the grid silently rendered
--     ZERO tiles. `is_popular` + `display_order` (both already admin-editable)
--     drive it instead.
--
--  2. "Most booked services" on /services was a literal array in the JSX with
--     invented pandit counts (186 / 257 / 251 / 167) and fixed stock images.
--     Categories now carry their own image and the counts are computed.

BEGIN;

ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS tagline VARCHAR(160);
-- Controls which categories appear in the "Most booked" strip and in what
-- order. NULL = not featured, so an admin can curate rather than the strip
-- silently growing every time a category is added.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS home_rank INTEGER;

COMMENT ON COLUMN service_categories.image_url IS
  'Tile image for the "Most booked services" strip.';
COMMENT ON COLUMN service_categories.home_rank IS
  'Lower = earlier in the Most-booked strip. NULL = hidden from it.';

CREATE INDEX IF NOT EXISTS idx_service_categories_home
  ON service_categories(home_rank) WHERE home_rank IS NOT NULL;

COMMIT;

-- ============================================================
-- Self-check
-- ============================================================
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'service_categories' AND column_name = 'image_url')
    THEN missing := missing || ' service_categories.image_url'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'service_categories' AND column_name = 'home_rank')
    THEN missing := missing || ' service_categories.home_rank'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 06 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 06 applied: service categories are admin-managed.';
END
$verify$;
