-- ============================================================================
-- Module 23: Lead Distribution v2 — markets, entitlements, exposure
-- ============================================================================
-- The existing engine (leadDistribution.repository.js) groups pandits by
-- current_tier GLOBALLY and ranks on qualified leads alone. Three gaps:
--
--   1. No market. A ₹5k Bharat pandit is shown to a visitor in Dubai.
--   2. Fairness pools are global, so a Nalkheda pandit competes with a Kashi
--      pandit for the same "fair share" — meaningless, they serve different
--      devotees.
--   3. Leads are the only counter. A pandit shown 500 times who converted
--      nobody looks under-served and gets boosted forever, when in fact they
--      have had every chance. Exposure has to be measured too.
--
-- This migration adds markets, per-plan market entitlement, position-weighted
-- exposure, and pools keyed on temple + market + plan.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── markets ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE lead_market AS ENUM ('INDIA', 'INTERNATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- How a market was determined. Recorded because it decides which plan gets
-- credited, and 'IP_GEO' is a guess a pandit may legitimately dispute.
DO $$ BEGIN
  CREATE TYPE market_source AS ENUM (
    'VERIFIED_PHONE', 'VERIFIED_ACCOUNT', 'USER_SELECTED', 'IP_GEO', 'ADMIN_OVERRIDE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── plan → market entitlement ───────────────────────────────────────────────
-- Which markets each plan may receive leads from. A row per (plan, market);
-- absence of a row means not entitled, which fails closed.
CREATE TABLE IF NOT EXISTS plan_market_entitlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier            subscription_tier NOT NULL,
    market          lead_market NOT NULL,

    -- Share of this market's traffic this plan should receive, as a WEIGHT not
    -- a percentage. Normalised at read time against the plans that actually
    -- have eligible pandits, so an empty bucket does not swallow its share.
    allocation_weight NUMERIC(4,3) NOT NULL DEFAULT 0.500,

    -- Per-pandit daily ceiling in this market. Stops one pandit absorbing a
    -- traffic spike.
    daily_lead_cap  INTEGER NOT NULL DEFAULT 5,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tier, market),
    CONSTRAINT pme_weight_range CHECK (allocation_weight >= 0 AND allocation_weight <= 1)
);

-- ── exposure ────────────────────────────────────────────────────────────────
-- One row per rendered card. This is the counter the old engine lacked.
--
-- position_weight is stored, not derived at read time, because the weighting
-- curve may be retuned later and historical exposure must keep the value it
-- was actually credited at — otherwise changing the curve silently rewrites
-- everyone's past fairness.
CREATE TABLE IF NOT EXISTS pandit_exposure (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,

    temple_id       UUID REFERENCES temples(id) ON DELETE SET NULL,
    service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
    market          lead_market NOT NULL,

    position        INTEGER NOT NULL,
    position_weight NUMERIC(4,3) NOT NULL,

    -- Opaque; used only to deduplicate a refresh from a genuine new visit.
    session_key     VARCHAR(64),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exposure_position_positive CHECK (position >= 1)
);

-- The hot query is "weighted exposure for this pandit, in this market, in this
-- pool, over the rolling window".
CREATE INDEX IF NOT EXISTS idx_exposure_pool
  ON pandit_exposure (pandit_id, market, temple_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exposure_recent
  ON pandit_exposure (created_at DESC);

-- A refresh within the same hour must not inflate exposure — otherwise a
-- devotee reloading the page ten times makes everyone on it look over-served.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exposure_session_hour
  ON pandit_exposure (pandit_id, session_key, market, date_trunc('hour', created_at AT TIME ZONE 'UTC'))
  WHERE session_key IS NOT NULL;

-- ── market on qualified leads ───────────────────────────────────────────────
-- The lead itself must record which market it belongs to and how that was
-- decided. Without market_source, an IP-derived attribution is
-- indistinguishable from a verified one.
ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS market lead_market;
ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS market_source market_source;
ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS temple_id UUID REFERENCES temples(id) ON DELETE SET NULL;
ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

COMMENT ON COLUMN qualified_leads.market IS
  'Which market this lead is credited to. Decides which plan entitlement was consumed.';
COMMENT ON COLUMN qualified_leads.market_source IS
  'How the market was determined. IP_GEO is low confidence and should be reviewable.';

CREATE INDEX IF NOT EXISTS idx_qleads_pool
  ON qualified_leads (pandit_id, market, created_at DESC);

-- Existing rows predate markets. Backfilled as INDIA, which is almost certainly
-- correct for this platform's history, and flagged as an admin decision rather
-- than pretending it was verified.
UPDATE qualified_leads
   SET market = 'INDIA', market_source = 'ADMIN_OVERRIDE'
 WHERE market IS NULL;

-- ── visitor geo, for analytics and audit ────────────────────────────────────
-- Never used for entitlement on its own; recorded so a disputed attribution can
-- be investigated.
CREATE TABLE IF NOT EXISTS visitor_geo_log (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key           VARCHAR(64),
    user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
    detected_country_code VARCHAR(2),
    detected_region       VARCHAR(80),
    detection_source      VARCHAR(30),
    selected_country_code VARCHAR(2),
    resolved_market       lead_market,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visitor_geo_session ON visitor_geo_log (session_key, created_at DESC);

-- ── engine configuration ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribution_config (
    key         VARCHAR(60) PRIMARY KEY,
    value       NUMERIC(8,3) NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grants for the unprivileged application role.
--
-- Guarded, like every other migration in this project: panditconnect_app is
-- created by a separate provisioning step, and a fresh dev or CI database will
-- not have it. A bare GRANT would raise "role does not exist" — and since this
-- is inside the transaction above, it would roll back this ENTIRE migration,
-- tables and seed included, over a role that was never required.
--
-- Least privilege: the app only READS config and entitlements (getConfig,
-- getEntitlements). It never writes them, and they hold the rules of the whole
-- plan system, so it does not get write access to them. Migration 17 tightens
-- this further on databases where an earlier version of this file already ran.
DO $grants$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    RAISE NOTICE 'Role panditconnect_app absent — skipping grants (expected on a fresh dev database).';
    RETURN;
  END IF;

  GRANT SELECT ON plan_market_entitlements TO panditconnect_app;
  GRANT SELECT ON distribution_config      TO panditconnect_app;

  -- Append-only. No UPDATE: an exposure row is a historical fact, and its
  -- stored position_weight must keep the value it was credited at.
  GRANT SELECT, INSERT, DELETE ON pandit_exposure TO panditconnect_app;
  GRANT SELECT, INSERT, DELETE ON visitor_geo_log TO panditconnect_app;
END
$grants$;

COMMIT;

-- ============================================================================
-- Seed
-- ============================================================================

-- Entitlements. Mapped onto the existing subscription_tier enum:
--   silver  = ₹5,000  Bharat            India only
--   gold    = ₹9,000  Global Connect    India + International
--   diamond = ₹15,000 International     International only
INSERT INTO plan_market_entitlements (tier, market, allocation_weight, daily_lead_cap) VALUES
  ('silver',  'INDIA',         0.700, 5),
  ('gold',    'INDIA',         0.300, 5),
  ('gold',    'INTERNATIONAL', 0.300, 3),
  ('diamond', 'INTERNATIONAL', 0.700, 3)
ON CONFLICT (tier, market) DO NOTHING;

INSERT INTO distribution_config (key, value, description) VALUES
  ('window_days',              14,    'Rolling fairness window'),
  ('fairness_strength',        0.750, '0 = pure quality ranking, 1 = pure fairness'),
  ('quality_weight',           0.250, 'How much profile quality contributes'),
  ('lead_deficit_weight',      0.550, 'Split of the fairness push: qualified leads'),
  ('exposure_deficit_weight',  0.450, 'Split of the fairness push: weighted exposure'),
  ('max_share_multiplier',     3.000, 'Throttle above this multiple of fair share'),
  ('cold_start_days',          7,     'New-pandit boost duration'),
  ('cold_start_boost',         0.150, 'Size of the new-pandit boost'),
  ('cold_start_max_exposure',  200,   'Boost stops once they have had a real chance'),
  ('rotation_noise',           0.020, 'Tie-break jitter only — NOT the distribution mechanism'),
  ('rotation_depth',           3.000, 'Band width, as a multiple of page size, that rotates'),
  ('min_profile_completeness', 0.500, 'Below this, not eligible for paid distribution'),
  ('page_size',                20,    'First-page slots')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  missing TEXT := '';
  t TEXT;
  weights NUMERIC;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan_market_entitlements', 'pandit_exposure',
                           'visitor_geo_log', 'distribution_config'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t)
      THEN missing := missing || ' ' || t; END IF;
  END LOOP;
  IF missing <> '' THEN RAISE EXCEPTION 'Migration 15 incomplete — missing:%', missing; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'qualified_leads' AND column_name = 'market')
    THEN RAISE EXCEPTION 'Migration 15 incomplete — qualified_leads.market missing'; END IF;

  IF EXISTS (SELECT 1 FROM qualified_leads WHERE market IS NULL)
    THEN RAISE EXCEPTION 'Migration 15 incomplete — qualified leads left without a market'; END IF;

  -- Each market's weights should total 1.0, or traffic is silently lost or
  -- double-counted.
  FOR t IN SELECT DISTINCT market::text FROM plan_market_entitlements LOOP
    SELECT SUM(allocation_weight) INTO weights
      FROM plan_market_entitlements WHERE market::text = t AND is_active;
    IF ABS(weights - 1.0) > 0.001 THEN
      RAISE WARNING 'Market % allocation weights sum to %, not 1.00', t, weights;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 15 applied: markets, plan entitlements, weighted exposure and distribution config are in place.';
END
$verify$;
