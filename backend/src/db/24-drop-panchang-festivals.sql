-- ============================================================================
-- Module 30: Remove Panchang & Festivals entirely
-- ============================================================================
-- These two features (today's panchang/muhurat lookup, the festival calendar)
-- are being removed from the product — public pages, admin management screens,
-- and the API endpoints backing them are all removed alongside this migration.
-- muhurat_data is a child of panchang_data (FK), so it must go first, or drop
-- panchang_data with CASCADE. Neither table is referenced from anywhere else
-- in the schema (verified: no other FK points at festivals/panchang_data).
-- Idempotent (IF EXISTS).
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS muhurat_data;
DROP TABLE IF EXISTS panchang_data;
DROP TABLE IF EXISTS festivals;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name IN ('festivals', 'panchang_data', 'muhurat_data')) THEN
    RAISE EXCEPTION 'Migration 24 incomplete — panchang/festival tables still present';
  END IF;
  RAISE NOTICE 'Migration 24 applied: festivals, panchang_data and muhurat_data dropped.';
END
$verify$;
