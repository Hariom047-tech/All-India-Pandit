-- ============================================================================
-- Blended pool mode
-- ============================================================================
-- A third pool_mode: BLENDED (2). Unlike WEIGHTED (0), which picks one plan
-- bucket per VISITOR SESSION and only converges on the configured split in
-- aggregate across many visitors, BLENDED mixes the entitled plans within one
-- PAGE — the higher-priority plan's cards first, then the next plan's, sized
-- by the same allocation_weight the admin already sets per tier/market. Unlike
-- PRIORITY (1), the lower plan is never starved outright.
--
-- No new columns: allocation_weight already carries the split and
-- priority_order already carries the block order — this migration only widens
-- pool_mode's allowed range so the engine (backend/src/services/distribution/
-- rotation.js's POOL_MODE.BLENDED) and the admin panel can select it.
--
-- distribution_config.value already holds 2 on this database (pool_mode was
-- set to BLENDED before the engine code that supports it existed — the
-- engine silently fell back to WEIGHTED's behavior for any unrecognized mode
-- number). This migration just brings max_value in line with the value
-- that's already there, and the code in this same deploy makes it real.
--
-- Idempotent.
-- ============================================================================

BEGIN;

UPDATE distribution_config
   SET max_value = 2,
       description = 'Pool selection: 0 = weighted share, 1 = strict priority, 2 = blended (mixed per page)'
 WHERE key = 'pool_mode';

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  v_max NUMERIC;
BEGIN
  SELECT max_value INTO v_max FROM distribution_config WHERE key = 'pool_mode';
  IF v_max IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Migration 35 incomplete — pool_mode.max_value is %, expected 2', v_max;
  END IF;

  RAISE NOTICE 'Migration 35 applied: pool_mode accepts 2 (blended).';
END
$verify$;
