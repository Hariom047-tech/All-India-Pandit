-- ============================================================================
-- Module 27: City/state snapshot on qualified leads
-- ============================================================================
-- BUG THIS FIXES: qualifiedLeads.repository.js (listForPandit, geoForPandit)
-- joins `users u ON u.id = ql.user_id` and reads u.city/u.state directly. That
-- looks identical to how contact_name/contact_phone are read — except
-- contact_name/contact_phone have a COALESCE fallback to
-- contact_name_snapshot/contact_phone_snapshot, and city/state did not.
--
-- Row-Level Security on `users` (01-schema.sql) has no policy letting a
-- pandit's session SELECT an arbitrary devotee's row — only their own row,
-- rows with role IN ('pandit','temple_admin'), or rows tied to public
-- content (reviews/posts). A devotee who only ever contacted a pandit
-- privately matches none of those. So under a real pandit session (not the
-- superuser connection used to inspect the schema), `u.*` for that JOIN is
-- always NULL for a devotee-only account — u.city/u.state came back NULL for
-- every lead, silently, no error. u.full_name/u.phone happened to LOOK like
-- they worked only because the COALESCE fallback quietly took over every
-- time; the "joined for freshness" comment above listForPandit has
-- (apparently always) been dead code in production.
--
-- THE FIX: extend the SAME snapshot mechanism that already exists for
-- name/phone to city/state, rather than opening an RLS policy that would let
-- a pandit SELECT * on a devotee's full row (email, password_hash, etc.) —
-- keeping the exposure surface exactly what migration 03 already documented:
-- "nothing beyond name + the verified phone is copied." City/state are the
-- same kind of low-sensitivity profile fact the devotee already effectively
-- disclosed by contacting this specific pandit, captured at the same moment
-- and by the same SECURITY DEFINER path as the name/phone snapshot.
--
-- Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS contact_city_snapshot  VARCHAR(100);
ALTER TABLE qualified_leads ADD COLUMN IF NOT EXISTS contact_state_snapshot VARCHAR(100);
COMMENT ON COLUMN qualified_leads.contact_city_snapshot IS
  'Snapshot of users.city at lead-creation time. Needed because RLS on users '
  'does not grant a pandit session SELECT on an arbitrary devotee row — see '
  'migration 27 for why the live JOIN alone silently returns NULL.';
COMMENT ON COLUMN qualified_leads.contact_state_snapshot IS
  'Snapshot of users.state at lead-creation time. Same reason as contact_city_snapshot.';

-- record_qualified_lead() keeps its 7-arg signature — only the body changes,
-- so CREATE OR REPLACE is enough; no DROP/arity dance needed this time.
--
-- IMPORTANT: this body is based on migration 20's version (the advisory-lock
-- fix), not migration 16's — migration 16's original two-bigint
-- pg_advisory_xact_lock(bigint, bigint) call matches no real overload and
-- raises 42883 on every call (see 20-fix-lead-lock-signature.sql for the
-- full story). Re-basing on 16 here would silently UNDO that fix.
CREATE OR REPLACE FUNCTION record_qualified_lead(
    p_pandit_id   UUID,
    p_user_id     UUID,
    p_method      contact_method,
    p_dedup_hours INTEGER,
    p_source      VARCHAR DEFAULT NULL,
    p_temple_id   UUID DEFAULT NULL,
    p_service_id  UUID DEFAULT NULL
)
RETURNS TABLE(lead_id UUID, was_created BOOLEAN, reason TEXT) AS $$
DECLARE
    v_user      RECORD;
    v_pandit    RECORD;
    v_existing  RECORD;
    v_new_id    UUID;
    v_country   TEXT;
    v_market    lead_market;
    v_msource   market_source;
BEGIN
    IF p_method NOT IN ('phone_call', 'whatsapp') THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'method_not_qualifying'; RETURN;
    END IF;

    SELECT id, full_name, phone, status, phone_verified, deleted_at, city, state
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

    -- One bigint key (both ids hashed together) — matches the
    -- pg_advisory_xact_lock(bigint) overload that actually exists (fixed by
    -- migration 20; see the note above CREATE OR REPLACE).
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
        contact_city_snapshot, contact_state_snapshot,
        dedup_window_ends_at, source,
        market, market_source, temple_id, service_id
    ) VALUES (
        p_pandit_id, p_user_id, p_method, p_method,
        v_user.full_name, v_user.phone,
        v_user.city, v_user.state,
        NOW() + (p_dedup_hours || ' hours')::interval, p_source,
        v_market, v_msource, p_temple_id, p_service_id
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, TRUE, 'created';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: existing leads (including any inserted before this migration)
-- get a best-effort snapshot from the devotee's CURRENT city/state. Run as
-- the schema owner, so — unlike the app's pandit-scoped connection — this
-- UPDATE is not subject to the RLS gap this migration exists to work around.
UPDATE qualified_leads ql
   SET contact_city_snapshot  = u.city,
       contact_state_snapshot = u.state
  FROM users u
 WHERE u.id = ql.user_id
   AND ql.contact_city_snapshot IS NULL
   AND (u.city IS NOT NULL OR u.state IS NOT NULL);

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE v_key BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'qualified_leads' AND column_name = 'contact_city_snapshot'
  ) THEN
    RAISE EXCEPTION 'Migration 27 incomplete — contact_city_snapshot missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'record_qualified_lead' AND pronargs = 7
  ) THEN
    RAISE EXCEPTION 'Migration 27 incomplete — record_qualified_lead() lost its 7-arg signature';
  END IF;

  -- Guards against exactly the regression this migration almost shipped:
  -- redefining record_qualified_lead() from an older migration's text and
  -- silently reintroducing the pre-20 two-bigint advisory lock call.
  SELECT hashtextextended('11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', 42) INTO v_key;
  PERFORM pg_advisory_lock(v_key);
  PERFORM pg_advisory_unlock(v_key);

  RAISE NOTICE 'Migration 27 applied: qualified_leads now snapshots devotee city/state at lead time.';
END
$verify$;
