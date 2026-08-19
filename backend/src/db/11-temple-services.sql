-- ============================================================
-- Module 19: Temple services — catalogue links + temple-specific rituals
-- ============================================================
-- The "Services performed here" tab was empty on every temple, and it always
-- would have been: temple_services has existed since 01-schema.sql but nothing
-- in the codebase ever INSERTed into it. It was read in three places and
-- written in none, so the public page had nothing to render.
--
-- Two separate needs, so two separate mechanisms:
--
--   temple_services         a link to a catalogue service. Gets a real detail
--                           page, samagri list and the pandits who offer it.
--                           Written by the new admin picker; no schema change
--                           needed, the table was already correct.
--
--   temples.custom_services rituals particular to THIS temple that do not
--                           exist in the global catalogue — "Baglamukhi
--                           Ashtami Special Havan". No detail page, so tapping
--                           one opens the temple enquiry form instead.
--
-- Idempotent.

BEGIN;

-- Ordered array of objects: [{"name": "...", "description": "..."}].
-- JSONB to match temples.highlights (migration 05) and services.benefits
-- (migration 04), so every admin editor on this project serialises the same way.
ALTER TABLE temples ADD COLUMN IF NOT EXISTS custom_services JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN temples.custom_services IS
  'Temple-specific rituals not in the services catalogue. Ordered array of {name, description}. Rendered in "Services performed here"; tapping one opens the enquiry form because it has no detail page.';

-- Shape guard. Without it a bad admin payload — an object instead of an array,
-- or an array of bare strings — would be stored happily and then crash the
-- public page at render time, which is exactly how the lat/lng string bug took
-- the whole temple page down.
DO $shape$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'temples_custom_services_shape') THEN
    -- PostgreSQL does not allow subqueries in CHECK constraints; guard only the
    -- top-level type (array vs object/scalar). The row-level shape (each element
    -- must be an object with a "name" key) is enforced by the API layer instead.
    ALTER TABLE temples ADD CONSTRAINT temples_custom_services_shape CHECK (
      jsonb_typeof(custom_services) = 'array'
    );
  END IF;
END
$shape$;


-- The admin picker replaces a temple's whole link set on every save, so this
-- lookup runs on each write as well as on every public temple page.
CREATE INDEX IF NOT EXISTS idx_temple_services_temple ON temple_services(temple_id);

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON temple_services TO panditconnect_app;
  END IF;
END
$grant$;

COMMIT;

-- ============================================================
-- Self-check
-- ============================================================
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temples' AND column_name = 'custom_services')
    THEN RAISE EXCEPTION 'Migration 11 incomplete — temples.custom_services is missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'temples_custom_services_shape')
    THEN RAISE EXCEPTION 'Migration 11 incomplete — the custom_services shape CHECK was not created'; END IF;

  IF EXISTS (SELECT 1 FROM temples WHERE jsonb_typeof(custom_services) <> 'array')
    THEN RAISE EXCEPTION 'Migration 11 incomplete — a temple holds a non-array custom_services'; END IF;

  RAISE NOTICE 'Migration 11 applied: temples can link catalogue services and define their own.';
END
$verify$;
