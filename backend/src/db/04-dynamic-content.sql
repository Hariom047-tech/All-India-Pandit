-- ============================================================
-- Module 17: Admin-managed service content & home hero images
-- ============================================================
-- Removes the last hardcoded content from the frontend. Service benefits,
-- ritual steps and FAQs lived in frontend/app/src/data/serviceMeta.ts, so
-- changing a single bullet needed a code change and a redeploy.
--
-- Stored as JSONB rather than three child tables on purpose: these are
-- ordered, display-only lists that are always read whole with their parent
-- service and are never queried across services. Three join tables would add
-- migration and query cost for no lookup we actually perform.
--
-- Idempotent; runs automatically as the fourth init file on a fresh container
-- and via `npm run db:migrate` on an existing one.

BEGIN;

-- ------------------------------------------------------------
-- 1. Dynamic service content
-- ------------------------------------------------------------
-- benefits: [{ "title": "...", "detail": "..." }]
-- process:  [{ "step": 1, "title": "...", "detail": "...", "duration": "..." }]
-- faqs:     [{ "q": "...", "a": "..." }]
ALTER TABLE services ADD COLUMN IF NOT EXISTS benefits JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS process  JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS faqs     JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN services.benefits IS 'Ordered [{title, detail}] shown on the service detail page.';
COMMENT ON COLUMN services.process  IS 'Ordered [{step, title, detail, duration}] — the vidhi timeline.';
COMMENT ON COLUMN services.faqs     IS 'Ordered [{q, a}] rendered as the FAQ accordion.';

-- samagri_list already existed but was always NULL. Normalise it to an array
-- so the API never has to distinguish "no items" from "never set".
UPDATE services SET samagri_list = '[]'::jsonb WHERE samagri_list IS NULL;
ALTER TABLE services ALTER COLUMN samagri_list SET DEFAULT '[]'::jsonb;

-- These three are read on every service detail render and are small; a
-- containment index keeps a future "services offering X" query cheap.
CREATE INDEX IF NOT EXISTS idx_services_benefits ON services USING GIN (benefits);

-- ------------------------------------------------------------
-- 2. Home page hero images
-- ------------------------------------------------------------
-- The homepage hero previously borrowed the top three pandits' avatars, which
-- silently turned an editorial decision into a side effect of the ranking
-- algorithm: promoting a pandit changed the front page. These are chosen
-- explicitly by an admin instead.
CREATE TABLE IF NOT EXISTS home_hero_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url       TEXT NOT NULL,
    alt_text        VARCHAR(200),
    caption         VARCHAR(200),
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    mime_type       VARCHAR(50),
    file_size_bytes BIGINT,
    uploaded_by     UUID REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_hero_order
    ON home_hero_images(display_order) WHERE is_active = TRUE;

COMMIT;

-- ============================================================
-- 3. Row-Level Security
-- ============================================================
-- Hero images are public content, like temples and services: readable by
-- anyone, writable only by an admin. RLS is enabled anyway so the write side
-- is enforced by Postgres and not only by the route's requireAdmin.
ALTER TABLE home_hero_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_hero_select_public ON home_hero_images;
CREATE POLICY home_hero_select_public ON home_hero_images
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS home_hero_write_admin ON home_hero_images;
CREATE POLICY home_hero_write_admin ON home_hero_images
    FOR ALL USING (current_app_user_is_admin()) WITH CHECK (current_app_user_is_admin());

-- ============================================================
-- 4. Grants
-- ============================================================
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON home_hero_images TO panditconnect_app;
  END IF;
END
$grants$;

-- ============================================================
-- 5. Self-check
-- ============================================================
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF to_regclass('public.home_hero_images') IS NULL THEN missing := missing || ' home_hero_images'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'services' AND column_name = 'benefits') THEN missing := missing || ' services.benefits'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'services' AND column_name = 'process') THEN missing := missing || ' services.process'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'services' AND column_name = 'faqs') THEN missing := missing || ' services.faqs'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 04 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 04 applied: dynamic service content + home hero images.';
END
$verify$;
