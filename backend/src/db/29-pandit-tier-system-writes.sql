-- ============================================================================
-- Module 29: SECURITY DEFINER helpers for system-driven pandit.current_tier
-- writes (Razorpay webhook activation, expiry reconciliation)
-- ============================================================================
-- BUG THIS FIXES: `pandits` has exactly two UPDATE policies —
-- pandits_update_self (user_id = current_app_user_id()) and
-- pandits_update_admin (current_app_user_is_admin()). A webhook has NEITHER:
-- it isn't the pandit's own session and it isn't an admin session, so
-- `UPDATE pandits SET current_tier = ...` from the payment webhook (and from
-- the expiry-reconciliation scheduler, services/billing/expiryScheduler.js)
-- silently matches ZERO rows under RLS — no error, rowCount 0 — even though
-- the SAME statement succeeds fine for an admin-driven grant/extend (that
-- code runs under withUserContext(adminUserId, ...), so
-- current_app_user_is_admin() is true there).
--
-- Confirmed via tests/payments.test.js: a captured payment already
-- correctly activates pandit_subscriptions (that table has no RLS) but the
-- pandit's own current_tier/subscription_expires_at never actually changed
-- — the exact same "looks like it worked, quietly didn't" shape as the
-- payment_transactions.status bug fixed earlier in this same migration
-- sequence. No real Razorpay account has ever been configured on this
-- project (see README "Known placeholders"), which is exactly why this has
-- never been caught before now.
--
-- THE FIX: the same SECURITY DEFINER pattern already used for
-- record_qualified_lead() (03-qualified-leads.sql) and
-- increment_pandit_stats() (01-schema.sql) — a narrowly-scoped function that
-- does exactly one thing, is not callable by the public role, and is
-- explicitly granted to panditconnect_app. This is deliberately NOT a
-- blanket permissive RLS policy on `pandits` (unlike payment_transactions'
-- payments_update_system) — `pandits` is a much wider-blast-radius table
-- than payment_transactions, and a "any app-role UPDATE always passes"
-- policy there would silently reopen every other column a pandit or admin
-- currently cannot self-serve (verification_status, is_featured, rank_score,
-- slug — see dashboard.repository.js's PANDIT_EDITABLE comment). These
-- functions can only ever do what their fixed SQL body does.
--
-- Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Promote a pandit's tier after a verified, captured payment.
-- ------------------------------------------------------------
-- A captured Razorpay payment must never fail to grant its entitlement —
-- money has already changed hands by the time this runs. trg_enforce_seat_cap
-- (migration 19) would otherwise reject this UPDATE if the tier's seat cap
-- filled in the narrow window between order creation and payment capture,
-- leaving a pandit charged but not upgraded. app.allow_seat_overflow is
-- exactly the trigger's own documented escape hatch for "a genuine reason to
-- oversell" — a completed payment is the clearest possible case of that.
-- (subscribe(), in payments.controller.js, checks seat availability BEFORE
-- creating the order — this override only matters for that narrow race, not
-- as a way to skip the check up front.)
CREATE OR REPLACE FUNCTION activate_pandit_subscription(
    p_pandit_id  UUID,
    p_tier       subscription_tier,
    p_expires_at TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.allow_seat_overflow', 'on', true);

    UPDATE pandits
       SET current_tier = p_tier,
           subscription_expires_at = p_expires_at
     WHERE id = p_pandit_id;

    UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = p_pandit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION activate_pandit_subscription(UUID, subscription_tier, TIMESTAMPTZ) FROM PUBLIC;

-- ------------------------------------------------------------
-- 2. Bulk-revert expired pandits to the free tier (expiryScheduler.js).
-- ------------------------------------------------------------
-- Same "only what the fixed body does" scoping — the WHERE clause is baked
-- in, not caller-supplied, so this can only ever revert pandits that are
-- ACTUALLY expired with no unexpired active subscription row backing them.
CREATE OR REPLACE FUNCTION revert_expired_pandit_tiers()
RETURNS INTEGER AS $$
DECLARE
    v_ids UUID[];
    v_id  UUID;
BEGIN
    -- A writable CTE is the Postgres way to collect every id an UPDATE
    -- touched (a bare `RETURNING id INTO` only ever captures one row) —
    -- needed here to recompute rank_score for exactly the rows this call
    -- actually reverted, nothing else.
    WITH reverted AS (
        UPDATE pandits
           SET current_tier = 'free',
               subscription_expires_at = NULL
         WHERE current_tier <> 'free'
           AND subscription_expires_at IS NOT NULL
           AND subscription_expires_at <= NOW()
           AND NOT EXISTS (
             SELECT 1 FROM pandit_subscriptions ps
              WHERE ps.pandit_id = pandits.id AND ps.is_active = TRUE AND ps.expires_at > NOW()
           )
        RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM reverted;

    IF v_ids IS NOT NULL THEN
        FOREACH v_id IN ARRAY v_ids LOOP
            UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = v_id;
        END LOOP;
    END IF;

    RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION revert_expired_pandit_tiers() FROM PUBLIC;

-- ------------------------------------------------------------
-- 3. Grants — guarded exactly like every prior migration.
-- ------------------------------------------------------------
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION activate_pandit_subscription(UUID, subscription_tier, TIMESTAMPTZ) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION revert_expired_pandit_tiers() TO panditconnect_app;
  ELSE
    RAISE NOTICE 'Role panditconnect_app not found — skipping grants. Fine if the app connects as the schema owner.';
  END IF;
END
$grants$;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'activate_pandit_subscription') THEN
    RAISE EXCEPTION 'Migration 29 incomplete — activate_pandit_subscription() missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revert_expired_pandit_tiers') THEN
    RAISE EXCEPTION 'Migration 29 incomplete — revert_expired_pandit_tiers() missing';
  END IF;
  RAISE NOTICE 'Migration 29 applied: pandit tier writes from webhook/scheduler contexts now go through SECURITY DEFINER functions.';
END
$verify$;
