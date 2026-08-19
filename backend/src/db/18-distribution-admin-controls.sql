-- ============================================================================
-- Module 26: Admin control over distribution
-- ============================================================================
-- Everything the engine uses becomes settable from the admin panel: pool
-- selection mode, allocation weights, priority order, seat caps, daily caps and
-- every fairness knob.
--
-- Three design decisions worth stating, because each one is the difference
-- between a control panel and a foot-gun.
--
-- ── 1. Ranges live in the database, not the UI ──────────────────────────────
-- An admin who types 5 into fairness_strength (a 0-1 value) does not get an
-- error — they get an engine that has silently stopped ranking on quality at
-- all. Validating only in React means the API, a script, or a future admin tool
-- bypasses it. So every key carries min_value/max_value and the setter enforces
-- them. The UI reads the same numbers, so the slider bounds cannot drift from
-- what is actually allowed.
--
-- ── 2. The tables stay non-writable to the app role ─────────────────────────
-- Migration 17 deliberately revoked write access to distribution_config and
-- plan_market_entitlements, because they hold the rules of the whole plan
-- system. Handing the grants back for the admin panel would undo that: one SQL
-- injection anywhere in the app could then rewrite every plan.
--
-- Instead the writes go through SECURITY DEFINER functions that validate,
-- audit, and only ever touch one row. The app role can call them; it still
-- cannot UPDATE or DELETE the tables directly.
--
-- ── 3. seat_cap is a SALES limit, not a distribution filter ─────────────────
-- It must NOT make the engine skip pandits above the cap. If 201 pandits hold a
-- 200-seat plan, pandit #201 has paid — silently showing them to nobody would
-- be the worst possible behaviour, and invisible. The cap is enforced when a
-- plan is SOLD, and surfaced in admin as "203/200 seats — oversold". The engine
-- keeps serving everyone who paid.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── config gains bounds and a description ───────────────────────────────────
ALTER TABLE distribution_config ALTER COLUMN value TYPE NUMERIC(12,3);
ALTER TABLE distribution_config ADD COLUMN IF NOT EXISTS min_value NUMERIC(12,3);
ALTER TABLE distribution_config ADD COLUMN IF NOT EXISTS max_value NUMERIC(12,3);
ALTER TABLE distribution_config ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE distribution_config ADD COLUMN IF NOT EXISTS step NUMERIC(12,3) DEFAULT 0.01;

-- ── entitlements gain priority order and seat caps ──────────────────────────
-- priority_order: lower runs first in PRIORITY mode. Ignored in WEIGHTED mode.
ALTER TABLE plan_market_entitlements ADD COLUMN IF NOT EXISTS priority_order INTEGER NOT NULL DEFAULT 100;
-- seat_cap: how many pandits may HOLD this plan. NULL = unlimited.
ALTER TABLE plan_market_entitlements ADD COLUMN IF NOT EXISTS seat_cap INTEGER;
-- What the plan costs, so the panel can compute ₹ per lead. In rupees.
ALTER TABLE plan_market_entitlements ADD COLUMN IF NOT EXISTS plan_price_inr INTEGER;

COMMENT ON COLUMN plan_market_entitlements.seat_cap IS
  'Sales limit: how many pandits may hold this plan. NEVER used to filter the distribution — a pandit above the cap has still paid and must still be shown.';
COMMENT ON COLUMN plan_market_entitlements.priority_order IS
  'Lower runs first in PRIORITY pool mode. Ignored in WEIGHTED mode.';

-- ── audit ───────────────────────────────────────────────────────────────────
-- Who changed which knob, when, and from what. Distribution settings decide who
-- earns money on this platform; a change with no author is not defensible if a
-- pandit ever disputes their share.
CREATE TABLE IF NOT EXISTS distribution_config_audit (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope       VARCHAR(40) NOT NULL,     -- 'config' | 'entitlement'
    target      VARCHAR(80) NOT NULL,     -- key, or 'tier/market'
    old_value   TEXT,
    new_value   TEXT,
    changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dist_audit_recent ON distribution_config_audit (changed_at DESC);

COMMIT;

-- ============================================================================
-- Seed: bounds, labels, and the new pool_mode key
-- ============================================================================

INSERT INTO distribution_config (key, value, description) VALUES
  ('pool_mode', 0, 'Pool selection: 0 = weighted share, 1 = strict priority')
ON CONFLICT (key) DO NOTHING;

-- Bounds for every knob. Applied with UPDATE (not ON CONFLICT) so re-running
-- corrects bounds on a database that already has the rows.
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 1,     label = 'Pool selection mode'         WHERE key = 'pool_mode';
UPDATE distribution_config SET min_value = 1, max_value = 180,   step = 1,     label = 'Fairness window (days)'      WHERE key = 'window_days';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'Fairness strength'           WHERE key = 'fairness_strength';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'Quality weight'              WHERE key = 'quality_weight';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'Fairness split: leads'       WHERE key = 'lead_deficit_weight';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'Fairness split: exposure'    WHERE key = 'exposure_deficit_weight';
UPDATE distribution_config SET min_value = 1, max_value = 20,    step = 0.5,   label = 'Over-share throttle (×)'     WHERE key = 'max_share_multiplier';
UPDATE distribution_config SET min_value = 0, max_value = 90,    step = 1,     label = 'New-pandit boost (days)'     WHERE key = 'cold_start_days';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'New-pandit boost size'       WHERE key = 'cold_start_boost';
UPDATE distribution_config SET min_value = 0, max_value = 100000, step = 10,   label = 'Boost stops after exposure'  WHERE key = 'cold_start_max_exposure';
UPDATE distribution_config SET min_value = 0, max_value = 0.5,   step = 0.005, label = 'Tie-break jitter'            WHERE key = 'rotation_noise';
UPDATE distribution_config SET min_value = 1, max_value = 20,    step = 1,     label = 'Rotation band (× page size)' WHERE key = 'rotation_depth';
UPDATE distribution_config SET min_value = 0, max_value = 1,     step = 0.05,  label = 'Minimum profile quality'     WHERE key = 'min_profile_completeness';
UPDATE distribution_config SET min_value = 1, max_value = 100,   step = 1,     label = 'Page size'                   WHERE key = 'page_size';

-- Priority order, seat caps and prices for the three real plans.
-- Priority reflects what the plans cost: the more expensive the plan, the
-- earlier it is offered when the admin switches to PRIORITY mode.
UPDATE plan_market_entitlements SET priority_order = 10, seat_cap = 150, plan_price_inr = 15000 WHERE tier = 'diamond';
UPDATE plan_market_entitlements SET priority_order = 20, seat_cap = 150, plan_price_inr = 9000  WHERE tier = 'gold';
UPDATE plan_market_entitlements SET priority_order = 30, seat_cap = 200, plan_price_inr = 5000  WHERE tier = 'silver';

-- ============================================================================
-- Writers — validated, audited, single-row
-- ============================================================================

CREATE OR REPLACE FUNCTION set_distribution_config(
    p_key      VARCHAR,
    p_value    NUMERIC,
    p_admin_id UUID
)
RETURNS TABLE(key VARCHAR, value NUMERIC, changed BOOLEAN) AS $$
DECLARE
    v_row RECORD;
BEGIN
    SELECT dc.key, dc.value, dc.min_value, dc.max_value INTO v_row
      FROM distribution_config dc WHERE dc.key = p_key;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown distribution config key: %', p_key
          USING HINT = 'Keys are fixed by migration. The panel cannot invent new ones.';
    END IF;

    -- Bounds are enforced HERE, not only in the UI. A value outside them does
    -- not error the engine — it silently changes how ranking behaves, which is
    -- far worse than a rejected save.
    IF v_row.min_value IS NOT NULL AND p_value < v_row.min_value THEN
        RAISE EXCEPTION '% must be at least % (got %)', p_key, v_row.min_value, p_value;
    END IF;
    IF v_row.max_value IS NOT NULL AND p_value > v_row.max_value THEN
        RAISE EXCEPTION '% must be at most % (got %)', p_key, v_row.max_value, p_value;
    END IF;

    IF v_row.value = p_value THEN
        RETURN QUERY SELECT p_key, p_value, FALSE; RETURN;
    END IF;

    INSERT INTO distribution_config_audit (scope, target, old_value, new_value, changed_by)
    VALUES ('config', p_key, v_row.value::text, p_value::text, p_admin_id);

    UPDATE distribution_config dc
       SET value = p_value, updated_by = p_admin_id, updated_at = NOW()
     WHERE dc.key = p_key;

    RETURN QUERY SELECT p_key, p_value, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_plan_entitlement(
    p_tier      subscription_tier,
    p_market    lead_market,
    p_weight    NUMERIC,
    p_daily_cap INTEGER,
    p_priority  INTEGER,
    p_seat_cap  INTEGER,
    p_price     INTEGER,
    p_active    BOOLEAN,
    p_admin_id  UUID
)
RETURNS TABLE(tier TEXT, market TEXT, changed BOOLEAN) AS $$
DECLARE
    v_old RECORD;
BEGIN
    IF p_weight < 0 OR p_weight > 1 THEN
        RAISE EXCEPTION 'allocation_weight must be between 0 and 1 (got %)', p_weight;
    END IF;
    IF p_daily_cap < 0 THEN
        RAISE EXCEPTION 'daily_lead_cap cannot be negative';
    END IF;
    IF p_seat_cap IS NOT NULL AND p_seat_cap < 0 THEN
        RAISE EXCEPTION 'seat_cap cannot be negative';
    END IF;

    SELECT * INTO v_old FROM plan_market_entitlements e
     WHERE e.tier = p_tier AND e.market = p_market;

    IF NOT FOUND THEN
        -- Creating a (tier, market) pair is a real product decision — it grants
        -- a plan access to a market it could not reach before. Allowed, but
        -- audited like everything else.
        INSERT INTO plan_market_entitlements
            (tier, market, allocation_weight, daily_lead_cap, priority_order, seat_cap, plan_price_inr, is_active)
        VALUES (p_tier, p_market, p_weight, p_daily_cap, p_priority, p_seat_cap, p_price, p_active);

        INSERT INTO distribution_config_audit (scope, target, old_value, new_value, changed_by)
        VALUES ('entitlement', p_tier || '/' || p_market, NULL,
                format('weight=%s cap=%s priority=%s seats=%s price=%s active=%s',
                       p_weight, p_daily_cap, p_priority, p_seat_cap, p_price, p_active),
                p_admin_id);

        RETURN QUERY SELECT p_tier::text, p_market::text, TRUE; RETURN;
    END IF;

    INSERT INTO distribution_config_audit (scope, target, old_value, new_value, changed_by)
    VALUES ('entitlement', p_tier || '/' || p_market,
            format('weight=%s cap=%s priority=%s seats=%s price=%s active=%s',
                   v_old.allocation_weight, v_old.daily_lead_cap, v_old.priority_order,
                   v_old.seat_cap, v_old.plan_price_inr, v_old.is_active),
            format('weight=%s cap=%s priority=%s seats=%s price=%s active=%s',
                   p_weight, p_daily_cap, p_priority, p_seat_cap, p_price, p_active),
            p_admin_id);

    UPDATE plan_market_entitlements e
       SET allocation_weight = p_weight,
           daily_lead_cap    = p_daily_cap,
           priority_order    = p_priority,
           seat_cap          = p_seat_cap,
           plan_price_inr    = p_price,
           is_active         = p_active,
           updated_at        = NOW()
     WHERE e.tier = p_tier AND e.market = p_market;

    RETURN QUERY SELECT p_tier::text, p_market::text, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER with a public grant would let anyone rewrite the plan rules.
REVOKE ALL ON FUNCTION set_distribution_config(VARCHAR, NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_plan_entitlement(subscription_tier, lead_market, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, UUID) FROM PUBLIC;

DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION set_distribution_config(VARCHAR, NUMERIC, UUID) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION set_plan_entitlement(subscription_tier, lead_market, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, UUID) TO panditconnect_app;
    GRANT SELECT ON distribution_config_audit TO panditconnect_app;
  END IF;
END $g$;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM distribution_config WHERE min_value IS NULL OR max_value IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration 18 incomplete — % config key(s) have no bounds. An unbounded knob can be set to a value that breaks ranking without erroring.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM distribution_config WHERE key = 'pool_mode') THEN
    RAISE EXCEPTION 'Migration 18 incomplete — pool_mode missing';
  END IF;

  SELECT COUNT(*) INTO n FROM plan_market_entitlements WHERE plan_price_inr IS NULL;
  IF n > 0 THEN
    RAISE WARNING '% entitlement row(s) have no price — the admin panel cannot show ₹/lead for them.', n;
  END IF;

  -- Priority must be a strict order, or PRIORITY mode has ties it resolves
  -- arbitrarily and the admin's intent is not honoured.
  SELECT COUNT(*) INTO n FROM (
    SELECT market, priority_order FROM plan_market_entitlements WHERE is_active
     GROUP BY market, priority_order HAVING COUNT(*) > 1
  ) dupes;
  IF n > 0 THEN
    RAISE WARNING '% market(s) have tied priority_order values — PRIORITY mode will break those ties arbitrarily.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_distribution_config')
    THEN RAISE EXCEPTION 'Migration 18 incomplete — set_distribution_config() missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_plan_entitlement')
    THEN RAISE EXCEPTION 'Migration 18 incomplete — set_plan_entitlement() missing'; END IF;

  RAISE NOTICE 'Migration 18 applied: distribution is admin-controllable, bounded, and audited.';
END
$verify$;
