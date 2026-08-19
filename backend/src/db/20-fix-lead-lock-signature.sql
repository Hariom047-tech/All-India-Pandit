-- ============================================================================
-- Module 28: Fix record_qualified_lead()'s advisory lock call
-- ============================================================================
-- record_qualified_lead() (migration 03, redefined by migration 16) has taken
-- this advisory lock since the very first version:
--
--     PERFORM pg_advisory_xact_lock(
--         hashtextextended(p_pandit_id::text, 42),
--         hashtextextended(p_user_id::text, 42)
--     );
--
-- pg_advisory_xact_lock has exactly two overloads: (bigint) and
-- (integer, integer). hashtextextended returns bigint, so this call passes
-- two bigints to a function that has never had a two-bigint overload —
-- Postgres error 42883, "function ... does not exist". There was no
-- database version this ever worked on.
--
-- Consequence: every call that reaches this PERFORM raises, and
-- qualifiedLeads.repository.js's recordContact() lets that propagate as a
-- 503 (see the migration_pending branch there). Any devotee who is
-- phone-verified, active, and contacting someone other than themselves — the
-- exact case this whole function exists to record — hits the error. Only
-- requests that get rejected by an earlier gate (guest, unverified,
-- self-contact, wrong method) ever return normally, which is why this went
-- unnoticed: those are also the cases the test suite happens to check first.
--
-- Fix: hash both ids together into ONE bigint and lock on that, instead of
-- hashing them separately into two. Still one lock per (pandit, user) pair —
-- concatenating both ids before hashing preserves that a different pair maps
-- to a different key with the same negligible collision odds
-- hashtextextended already carries — it just does it through the overload
-- that exists.
--
-- Nothing else in the function changes. Idempotent (CREATE OR REPLACE).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION record_qualified_lead(
    p_pandit_id UUID, p_user_id UUID, p_method contact_method, p_dedup_hours INTEGER,
    p_source VARCHAR DEFAULT NULL, p_temple_id UUID DEFAULT NULL, p_service_id UUID DEFAULT NULL
) RETURNS TABLE(lead_id UUID, was_created BOOLEAN, reason TEXT) AS $$
DECLARE
    v_user      RECORD;
    v_pandit    RECORD;
    v_existing  RECORD;
    v_new_id    UUID;
    v_country   TEXT;
    v_market    lead_market;
    v_msource   market_source;
BEGIN
    -- ── unchanged qualification rules ───────────────────────────────────────
    -- Every gate below is byte-for-byte what migrations 03 and 16 enforced.
    IF p_method NOT IN ('phone_call', 'whatsapp') THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'method_not_qualifying'; RETURN;
    END IF;

    SELECT id, full_name, phone, status, phone_verified, deleted_at
      INTO v_user FROM users WHERE id = p_user_id;
    IF NOT FOUND OR v_user.deleted_at IS NOT NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'user_not_found'; RETURN;
    END IF;
    IF v_user.status <> 'active' THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'user_not_active'; RETURN;
    END IF;
    IF NOT COALESCE(v_user.phone_verified, FALSE) THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'user_not_verified'; RETURN;
    END IF;

    SELECT id, user_id, is_available, deleted_at
      INTO v_pandit FROM pandits WHERE id = p_pandit_id;
    IF NOT FOUND OR v_pandit.deleted_at IS NOT NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'pandit_not_found'; RETURN;
    END IF;
    IF v_pandit.user_id = p_user_id THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'self_contact'; RETURN;
    END IF;

    -- FIXED: one bigint key (both ids hashed together), not two bigint
    -- arguments to an overload that does not exist.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_pandit_id::text || ':' || p_user_id::text, 42)
    );

    SELECT id INTO v_existing
      FROM qualified_leads
     WHERE pandit_id = p_pandit_id
       AND user_id = p_user_id
       AND dedup_window_ends_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
        UPDATE qualified_leads
           SET interaction_count   = interaction_count + 1,
               last_interaction_at = NOW(),
               last_contact_method = p_method
         WHERE id = v_existing.id;
        RETURN QUERY SELECT v_existing.id, FALSE, 'duplicate_window'; RETURN;
    END IF;

    -- ── market attribution ──────────────────────────────────────────────────
    v_country := country_from_phone(v_user.phone);

    IF v_country IS NOT NULL THEN
        v_market  := CASE WHEN v_country = 'IN' THEN 'INDIA' ELSE 'INTERNATIONAL' END;
        v_msource := 'VERIFIED_PHONE';
    ELSE
        v_market  := 'INDIA';
        v_msource := 'ADMIN_OVERRIDE';
    END IF;

    INSERT INTO qualified_leads (
        pandit_id, user_id, first_contact_method, last_contact_method,
        contact_name_snapshot, contact_phone_snapshot,
        dedup_window_ends_at, source,
        market, market_source, temple_id, service_id
    ) VALUES (
        p_pandit_id, p_user_id, p_method, p_method,
        v_user.full_name, v_user.phone,
        NOW() + (p_dedup_hours || ' hours')::interval, p_source,
        v_market, v_msource, p_temple_id, p_service_id
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, TRUE, 'created';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR, UUID, UUID) FROM PUBLIC;
DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR, UUID, UUID) TO panditconnect_app;
  END IF;
END $g$;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  v_key BIGINT;
BEGIN
  -- The actual bug: this must not raise 42883.
  SELECT hashtextextended('11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', 42) INTO v_key;
  PERFORM pg_advisory_lock(v_key);
  PERFORM pg_advisory_unlock(v_key);

  IF (SELECT pronargs FROM pg_proc WHERE proname = 'record_qualified_lead') IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'Migration 20 incomplete — record_qualified_lead arity is not 7';
  END IF;

  RAISE NOTICE 'Migration 20 applied: record_qualified_lead()''s advisory lock now uses a valid pg_advisory_xact_lock(bigint) call.';
END
$verify$;
