-- ============================================================================
-- Module 25: Distribution grants — guard and least privilege
-- ============================================================================
-- Migration 15 originally shipped with NO grants at all for the four tables it
-- created, so the unprivileged app role could not read them. That was a real
-- bug and the fix added to migration 15 was correct in substance.
--
-- Two problems remain with it, and this migration fixes both.
--
-- ── 1. The GRANTs are unguarded ─────────────────────────────────────────────
-- Every other migration in this project wraps its grants in:
--
--     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app')
--
-- because the role is created by a separate provisioning step that a fresh dev
-- machine or a CI database will not have run. A bare GRANT there raises
--
--     ERROR: role "panditconnect_app" does not exist
--
-- and because it sits inside migration 15's BEGIN...COMMIT, the ENTIRE
-- migration rolls back — the tables, the enums, the entitlement seed, all of
-- it. The next developer to clone this repo would get a confusing failure on a
-- line that has nothing to do with what they were doing.
--
-- ── 2. The app role has write access it never uses ──────────────────────────
-- Migration 15 grants INSERT, UPDATE and DELETE on all four tables. The
-- application only ever SELECTs two of them:
--
--     distribution_config        getConfig()        SELECT
--     plan_market_entitlements   getEntitlements()  SELECT
--
-- These two tables are the business rules of the entire plan system: which
-- plans may receive leads from which market, and every fairness weight. If a
-- SQL injection is ever found anywhere in the application, DELETE on
-- plan_market_entitlements collapses the plan system silently — no pandit is
-- entitled to anything, every pool comes back empty, and the listing just goes
-- quiet. There is no reason to carry that risk for permissions nothing uses.
--
-- Idempotent. Safe to run on a database where 15 already applied.
-- ============================================================================

DO $grants$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    RAISE NOTICE 'Role panditconnect_app does not exist — skipping grants. This is expected on a fresh dev database.';
    RETURN;
  END IF;

  -- ── read-only: the app never writes these ─────────────────────────────────
  -- Revoke first, then grant, so this corrects a database where migration 15
  -- already handed out the wider permissions.
  REVOKE ALL ON plan_market_entitlements FROM panditconnect_app;
  REVOKE ALL ON distribution_config      FROM panditconnect_app;
  GRANT SELECT ON plan_market_entitlements TO panditconnect_app;
  GRANT SELECT ON distribution_config      TO panditconnect_app;

  -- Admin changes to these go through a migration or a privileged console, not
  -- the request path. When the admin distribution controls are built they will
  -- need an explicit, audited write path — which is the point: that decision
  -- should be deliberate rather than inherited from a blanket grant.

  -- ── append-only analytics ─────────────────────────────────────────────────
  -- INSERT for recordExposure(), SELECT for the fairness counters, DELETE for
  -- the retention policy. No UPDATE: an exposure row is a historical fact, and
  -- position_weight in particular must keep the value it was credited at —
  -- rewriting it would retroactively change everyone's past fairness.
  REVOKE ALL ON pandit_exposure FROM panditconnect_app;
  GRANT SELECT, INSERT, DELETE ON pandit_exposure TO panditconnect_app;

  REVOKE ALL ON visitor_geo_log FROM panditconnect_app;
  GRANT SELECT, INSERT, DELETE ON visitor_geo_log TO panditconnect_app;

  RAISE NOTICE 'Distribution grants tightened: config and entitlements are read-only to the app role.';
END
$grants$;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  bad TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    RAISE NOTICE 'Migration 17: role absent, nothing to verify.';
    RETURN;
  END IF;

  -- The app must still be able to READ everything the engine depends on.
  -- Losing any of these makes distribute() fall back to hardcoded defaults
  -- WITHOUT erroring — getConfig() and getEntitlements() both swallow failures
  -- by design, so a missing SELECT grant would be invisible in production.
  IF NOT has_table_privilege('panditconnect_app', 'distribution_config', 'SELECT')
    THEN bad := bad || ' distribution_config/SELECT'; END IF;
  IF NOT has_table_privilege('panditconnect_app', 'plan_market_entitlements', 'SELECT')
    THEN bad := bad || ' plan_market_entitlements/SELECT'; END IF;
  IF NOT has_table_privilege('panditconnect_app', 'pandit_exposure', 'SELECT')
    THEN bad := bad || ' pandit_exposure/SELECT'; END IF;
  IF NOT has_table_privilege('panditconnect_app', 'pandit_exposure', 'INSERT')
    THEN bad := bad || ' pandit_exposure/INSERT'; END IF;

  IF bad <> '' THEN
    RAISE EXCEPTION 'Migration 17 broke a permission the engine needs:%', bad;
  END IF;

  -- And it must NOT be able to rewrite the plan rules.
  IF has_table_privilege('panditconnect_app', 'plan_market_entitlements', 'DELETE')
    THEN RAISE EXCEPTION 'Migration 17 incomplete — app role can still DELETE plan entitlements'; END IF;
  IF has_table_privilege('panditconnect_app', 'distribution_config', 'UPDATE')
    THEN RAISE EXCEPTION 'Migration 17 incomplete — app role can still UPDATE distribution config'; END IF;
  IF has_table_privilege('panditconnect_app', 'pandit_exposure', 'UPDATE')
    THEN RAISE EXCEPTION 'Migration 17 incomplete — app role can still UPDATE historical exposure'; END IF;

  RAISE NOTICE 'Migration 17 applied: engine reads intact, plan rules no longer writable from the request path.';
END
$verify$;
