-- ============================================================================
-- Module 27: Seat cap enforcement
-- ============================================================================
-- Migration 18 added seat_cap and the admin panel shows it. Nothing enforced
-- it. That is worse than having no cap at all: an admin who sets "200 seats"
-- reasonably believes the system will stop them at 200, and it would not have.
--
-- WHY A TRIGGER AND NOT A CHECK IN THE CONTROLLER
--
-- current_tier is written from four different places today:
--
--     repositories/payments.repository.js         (pandit buys a plan)
--     repositories/admin/subscriptions.repository (admin activates a sub)
--     repositories/admin/pandits.repository.js    (×2 — admin edits a pandit)
--
-- Adding the same guard to four call sites means the fifth one written next
-- month will not have it, and the failure is silent — the cap simply stops
-- meaning anything again. A trigger is the only place that covers every path,
-- including a manual UPDATE run in psql.
--
-- WHAT IT DOES NOT BLOCK
--
--   · renewals and any other update that does not change the tier
--   · downgrades, and moves away from a full tier
--   · anything at all when the tier has no cap set (NULL = unlimited)
--   · an admin who explicitly chooses to oversell (see the override below)
--
-- Deliberately NOT enforced anywhere near the distribution engine. A pandit who
-- is already over the cap has paid, and must keep being shown — the cap governs
-- SELLING, never serving. See migration 18.
--
-- Idempotent.
-- ============================================================================

BEGIN;

/*
 * Seats held vs allowed for one tier.
 *
 * "Held" counts live subscriptions only — active users with a subscription that
 * has not expired. Counting deleted or lapsed pandits would make a tier look
 * full when it has room, and quietly block real sales.
 */
CREATE OR REPLACE FUNCTION seat_usage(p_tier subscription_tier)
RETURNS TABLE(tier TEXT, seat_cap INTEGER, held INTEGER, available INTEGER) AS $$
DECLARE
    v_cap  INTEGER;
    v_held INTEGER;
BEGIN
    -- One cap per tier. A tier entitled to two markets has the same seat count
    -- in both — you sell a plan, not a plan-per-market — so MIN() collapses
    -- the rows rather than double-counting.
    SELECT MIN(e.seat_cap) INTO v_cap
      FROM plan_market_entitlements e
     WHERE e.tier = p_tier AND e.is_active;

    SELECT COUNT(*)::int INTO v_held
      FROM pandits p
      JOIN users u ON u.id = p.user_id
     WHERE p.current_tier = p_tier
       AND p.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND u.status = 'active'
       AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at > NOW());

    RETURN QUERY SELECT p_tier::text, v_cap, v_held,
        CASE WHEN v_cap IS NULL THEN NULL ELSE GREATEST(0, v_cap - v_held) END;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION seat_usage(subscription_tier) IS
  'Live seats held vs the sales cap. available IS NULL means the tier is uncapped.';

/*
 * The guard.
 *
 * Runs only when a pandit ARRIVES on a tier — either a new row, or an update
 * that changes current_tier. An update that leaves the tier alone (a renewal,
 * a bio edit, a photo change) never reaches the count.
 */
CREATE OR REPLACE FUNCTION enforce_seat_cap()
RETURNS TRIGGER AS $$
DECLARE
    v RECORD;
BEGIN
    -- Not a tier arrival: nothing to check.
    IF TG_OP = 'UPDATE' AND NEW.current_tier IS NOT DISTINCT FROM OLD.current_tier THEN
        RETURN NEW;
    END IF;

    -- 'free' is not a sold plan and is never capped.
    IF NEW.current_tier IS NULL OR NEW.current_tier = 'free' THEN
        RETURN NEW;
    END IF;

    /*
     * Explicit override.
     *
     * An admin may have a genuine reason to oversell — a promised seat, a
     * migration, a bulk import. Blocking that outright would mean the only way
     * forward is to disable the cap entirely, which is how safety rails get
     * removed permanently. So the escape hatch is per-transaction, deliberate,
     * and has to be set by the caller.
     */
    IF COALESCE(current_setting('app.allow_seat_overflow', true), '') = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v FROM seat_usage(NEW.current_tier);

    IF v.seat_cap IS NULL THEN
        RETURN NEW;                       -- uncapped tier
    END IF;

    IF v.held >= v.seat_cap THEN
        RAISE EXCEPTION 'seat_cap_reached'
          USING DETAIL = format('%s is full: %s of %s seats held.', NEW.current_tier, v.held, v.seat_cap),
                HINT = 'Raise the seat cap in Distribution Controls, or set app.allow_seat_overflow to deliberately oversell.',
                ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_seat_cap ON pandits;
CREATE TRIGGER trg_enforce_seat_cap
    BEFORE INSERT OR UPDATE OF current_tier ON pandits
    FOR EACH ROW EXECUTE FUNCTION enforce_seat_cap();

COMMIT;

DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION seat_usage(subscription_tier) TO panditconnect_app;
  END IF;
END $g$;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  v RECORD;
  over INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_seat_cap') THEN
    RAISE EXCEPTION 'Migration 19 incomplete — trg_enforce_seat_cap missing';
  END IF;

  -- Report, do not fix. Existing pandits over a cap have paid; this migration
  -- must never move anyone off a plan they hold.
  FOR v IN SELECT * FROM plan_market_entitlements e WHERE e.is_active AND e.seat_cap IS NOT NULL LOOP
    DECLARE u RECORD;
    BEGIN
      SELECT * INTO u FROM seat_usage(v.tier);
      IF u.held > u.seat_cap THEN
        over := over + 1;
        RAISE WARNING '% is oversold: % pandits hold a %-seat plan. All of them keep being served — the cap only stops NEW sales.',
          v.tier, u.held, u.seat_cap;
      END IF;
    END;
  END LOOP;

  IF over = 0 THEN
    RAISE NOTICE 'Migration 19 applied: seat caps are enforced on sale. No tier is currently oversold.';
  ELSE
    RAISE NOTICE 'Migration 19 applied: seat caps are enforced on NEW sales. % tier(s) already over cap were left untouched.', over;
  END IF;
END
$verify$;
