-- ============================================================================
-- Module 31: Universal FAQ CMS
-- ============================================================================
-- Extends the existing bare `faqs` table (id, question, answer, display_order
-- — no scoping, no status, no admin UI ever built for it, see docs/ADMIN.md's
-- own note that "the frontend is a static multi-page site with no dynamic
-- meta-tag system to manage") into an entity-scoped, admin-managed table.
--
-- In place, not a parallel table: 8 rows, one read-only consumer
-- (GET /api/faqs, the Contact page), zero FK dependents — an ALTER/RENAME
-- preserves those rows' ids and content exactly, and leaves nothing dead
-- behind to become a third disconnected FAQ system later.
--
-- services.faqs JSONB (04-dynamic-content.sql) is untouched by this migration
-- — it already has full working admin CRUD via the Services edit modal, and
-- stays that way; the app layer (services.repository.js) decides per-service
-- whether to prefer a published universal_faqs row over the JSONB list.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE faqs RENAME TO universal_faqs;

ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) NOT NULL DEFAULT 'GLOBAL';
DO $ck$ BEGIN
  ALTER TABLE universal_faqs ADD CONSTRAINT universal_faqs_entity_type_check
    CHECK (entity_type IN ('GLOBAL', 'HOME', 'TEMPLE', 'SERVICE', 'PANDIT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $ck$;
-- CHECK, not a native enum: this list is expected to grow as later SEO
-- phases add entity types (locations, guides, ...), and ALTER TYPE ADD VALUE
-- cannot run inside a transaction the way ALTER TABLE ... ADD CONSTRAINT can.

-- Polymorphic, no physical FK — same pattern already used by
-- reviews.reviewable_type/reviewable_id (01-schema.sql). NULL for
-- GLOBAL/HOME rows, which have no specific entity to point at.
ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS entity_id UUID NULL;

ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS slug VARCHAR(220);

-- Reuses the existing content_status enum (already used by blog_posts,
-- community_posts) rather than inventing a new type.
ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS status content_status NOT NULL DEFAULT 'draft';

DO $rn$ BEGIN
  ALTER TABLE universal_faqs RENAME COLUMN display_order TO sort_order;
EXCEPTION WHEN undefined_column THEN NULL; -- already renamed (idempotent re-run)
END $rn$;

ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);
ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE universal_faqs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: the 8 rows seeded by 02-seed.sql become published, global FAQs.
-- Both are already the column defaults for pre-existing rows, so this is a
-- documented safety net (belt-and-suspenders), not a real data move.
UPDATE universal_faqs
   SET entity_type = 'GLOBAL', status = 'published'
 WHERE entity_type = 'GLOBAL' AND status = 'draft';

DROP TRIGGER IF EXISTS trg_universal_faqs_updated ON universal_faqs;
CREATE TRIGGER trg_universal_faqs_updated
  BEFORE UPDATE ON universal_faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_universal_faqs_entity ON universal_faqs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_universal_faqs_status ON universal_faqs(status);
CREATE INDEX IF NOT EXISTS idx_universal_faqs_sort ON universal_faqs(entity_type, entity_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_universal_faqs_slug
  ON universal_faqs(entity_type, entity_id, slug) WHERE slug IS NOT NULL;

COMMIT;

-- ============================================================================
-- Row-Level Security — new public-content-with-admin-CRUD table, so (unlike
-- temples/services, which predate this pattern and rely on app-layer
-- requireAdmin alone) this one is protected at the database layer from day
-- one too, mirroring home_hero_images (04-dynamic-content.sql).
-- ============================================================================
ALTER TABLE universal_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS universal_faqs_select_public ON universal_faqs;
CREATE POLICY universal_faqs_select_public ON universal_faqs
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS universal_faqs_select_admin ON universal_faqs;
CREATE POLICY universal_faqs_select_admin ON universal_faqs
  FOR SELECT USING (current_app_user_is_admin());

DROP POLICY IF EXISTS universal_faqs_write_admin ON universal_faqs;
CREATE POLICY universal_faqs_write_admin ON universal_faqs
  FOR ALL USING (current_app_user_is_admin()) WITH CHECK (current_app_user_is_admin());

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON universal_faqs TO panditconnect_app;
  END IF;
END
$grants$;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE global_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_faqs') THEN
    RAISE EXCEPTION 'Migration 25 incomplete — universal_faqs table missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'faqs') THEN
    RAISE EXCEPTION 'Migration 25 incomplete — old faqs table name still present';
  END IF;
  SELECT COUNT(*) INTO global_count FROM universal_faqs WHERE entity_type = 'GLOBAL' AND status = 'published';
  IF global_count < 8 THEN
    RAISE EXCEPTION 'Migration 25 incomplete — expected >= 8 published GLOBAL FAQs, found %', global_count;
  END IF;
  RAISE NOTICE 'Migration 25 applied: universal_faqs live, % published GLOBAL rows.', global_count;
END
$verify$;
