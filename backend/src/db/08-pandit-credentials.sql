-- ============================================================
-- Module 21: Real pandit credential fields
-- ============================================================
-- "Vedic education" and "Gotra / tradition" rendered as empty bordered boxes
-- on every profile. There were no columns for them: normalize.ts tried to
-- scrape them out of the bio with a regex looking for "Education:" and
-- "Gotra:" prefixes that no bio actually contains. Making them real fields
-- means an admin can fill them and the boxes can hide when genuinely blank.

BEGIN;

ALTER TABLE pandits ADD COLUMN IF NOT EXISTS vedic_education VARCHAR(300);
ALTER TABLE pandits ADD COLUMN IF NOT EXISTS gotra           VARCHAR(150);
ALTER TABLE pandits ADD COLUMN IF NOT EXISTS tradition       VARCHAR(150);
ALTER TABLE pandits ADD COLUMN IF NOT EXISTS responds_within VARCHAR(60);

COMMENT ON COLUMN pandits.vedic_education IS 'e.g. "Acharya, Sanskrit & Jyotish — Ujjain".';
COMMENT ON COLUMN pandits.gotra IS 'Gotra, shown in the credentials block.';
COMMENT ON COLUMN pandits.tradition IS 'Sampradaya / parampara.';
COMMENT ON COLUMN pandits.responds_within IS
  'Honest, admin-set expectation such as "Usually replies within 2 hours". '
  'Deliberately free text and admin-owned rather than computed — a derived '
  'response time would be guesswork until there is real messaging data.';

COMMIT;

DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='pandits' AND column_name='vedic_education')
    THEN missing := missing || ' pandits.vedic_education'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='pandits' AND column_name='gotra')
    THEN missing := missing || ' pandits.gotra'; END IF;
  IF missing <> '' THEN RAISE EXCEPTION 'Migration 08 incomplete —%', missing; END IF;
  RAISE NOTICE 'Migration 08 applied: pandit credentials are real fields.';
END
$verify$;
