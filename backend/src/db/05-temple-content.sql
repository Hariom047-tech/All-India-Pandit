-- ============================================================
-- Module 18: Admin-managed temple content
-- ============================================================
-- "History & significance", "Highlights & special sevas" and "Established"
-- rendered blank on every temple because nothing wrote to them:
-- established_year / history / significance existed but were never in the
-- admin form, and `highlights` had no column at all — the public page was
-- reading it from bundled frontend content.
--
-- Idempotent. Runs as the fifth init file on a fresh container, or via
-- `npm run db:migrate` on an existing database.

BEGIN;

-- Ordered list of plain strings: ["Special Baglamukhi Havan", "Annadaan seva"].
-- JSONB rather than TEXT[] to match the services tables added in migration 04,
-- so both admin editors serialise the same way.
ALTER TABLE temples ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN temples.highlights IS
  'Ordered array of strings rendered as "Highlights & special sevas".';
COMMENT ON COLUMN temples.significance IS
  'Religious significance prose, shown beneath history on the temple page.';
COMMENT ON COLUMN temples.established_year IS
  'Year the temple was established, shown in the Overview fact cards.';

COMMIT;

-- ============================================================
-- Self-check
-- ============================================================
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temples' AND column_name = 'highlights')
    THEN missing := missing || ' temples.highlights'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temples' AND column_name = 'significance')
    THEN missing := missing || ' temples.significance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'temples' AND column_name = 'established_year')
    THEN missing := missing || ' temples.established_year'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 05 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 05 applied: temple history, significance, highlights and established year are admin-editable.';
END
$verify$;
