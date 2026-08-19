-- ============================================================================
-- Module 24: Lead market attribution
-- ============================================================================
-- Migration 15 added qualified_leads.market, market_source, temple_id and
-- service_id — but nothing populates them. record_qualified_lead() still
-- inserts the same columns it always did.
--
-- That is not a cosmetic gap. The fairness engine counts leads with:
--
--     WHERE ql.market = $2::lead_market
--       AND ($3::uuid IS NULL OR ql.temple_id = $3::uuid)
--
-- A NULL market matches neither 'INDIA' nor 'INTERNATIONAL', so EVERY lead
-- recorded after migration 15 would be invisible to the engine. Every pandit
-- would show a lead deficit of exactly their full fair share, forever, and the
-- lead half of the two-counter design would quietly stop working — with no
-- error anywhere.
--
-- This migration fixes the write path.
--
-- DESIGN: the market is derived INSIDE the function, from the devotee's own
-- verified phone number. It is deliberately NOT a parameter. The application
-- already knows a browsing market from CDN headers, and it would have been
-- easier to pass that in — but browsing market is IP-derived, and billing a
-- pandit's plan on the strength of a geolocation lookup is exactly what the
-- design forbids. A VPN, a corporate proxy or a roaming SIM would misattribute
-- revenue, and the pandit charged has no way to dispute it.
--
-- record_qualified_lead() already refuses to create a lead unless
-- users.phone_verified is TRUE, so by the time we reach the INSERT the phone is
-- verified evidence. That is the strongest signal available and it is free.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── phone → country ─────────────────────────────────────────────────────────
-- Mirrors countryFromPhone() in services/distribution/market.js. Longest dial
-- code first, or +91 would shadow +971 and every UAE devotee would be billed as
-- an India lead.
CREATE OR REPLACE FUNCTION country_from_phone(p_phone TEXT)
RETURNS TEXT AS $$
DECLARE
    digits TEXT;
BEGIN
    IF p_phone IS NULL THEN RETURN NULL; END IF;

    digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF digits = '' THEN RETURN NULL; END IF;

    -- Bare national-format Indian mobile: 10 digits starting 6-9. This is the
    -- format most of the existing user base is stored in, and on an India-first
    -- platform it is genuine evidence, not a guess.
    IF length(digits) = 10 AND substring(digits, 1, 1) ~ '[6-9]' THEN
        RETURN 'IN';
    END IF;

    -- Strip a leading 00 international prefix.
    IF left(digits, 2) = '00' THEN digits := substring(digits, 3); END IF;

    -- Longest codes first.
    IF left(digits, 3) = '971' THEN RETURN 'AE'; END IF;
    IF left(digits, 3) = '977' THEN RETURN 'NP'; END IF;
    IF left(digits, 3) = '880' THEN RETURN 'BD'; END IF;
    IF left(digits, 2) = '91'  THEN RETURN 'IN'; END IF;
    IF left(digits, 2) = '94'  THEN RETURN 'LK'; END IF;
    IF left(digits, 2) = '44'  THEN RETURN 'GB'; END IF;
    IF left(digits, 2) = '61'  THEN RETURN 'AU'; END IF;
    IF left(digits, 2) = '65'  THEN RETURN 'SG'; END IF;
    IF left(digits, 2) = '60'  THEN RETURN 'MY'; END IF;
    IF left(digits, 2) = '64'  THEN RETURN 'NZ'; END IF;
    IF left(digits, 2) = '27'  THEN RETURN 'ZA'; END IF;
    -- +1 is North America. Tested last because it is a single digit and would
    -- otherwise swallow nothing else here, but the ordering is load-bearing if
    -- codes are added later.
    IF left(digits, 1) = '1' AND length(digits) = 11 THEN RETURN 'US'; END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION country_from_phone(TEXT) IS
  'ISO country from a phone number. Used for lead market attribution — must stay in sync with countryFromPhone() in services/distribution/market.js.';

-- ── record_qualified_lead, now market-aware ─────────────────────────────────
-- The old 5-argument version must be dropped rather than left alongside a
-- version with defaulted extra parameters: a 5-argument call would then match
-- both and Postgres would raise "function is not unique". Dropping and
-- recreating in one transaction means no window where the function is missing.
DROP FUNCTION IF EXISTS record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR);

CREATE OR REPLACE FUNCTION record_qualified_lead(
    p_pandit_id   UUID,
    p_user_id     UUID,
    p_method      contact_method,
    p_dedup_hours INTEGER,
    p_source      VARCHAR DEFAULT NULL,
    -- Pool context. Optional, and NOT trusted for anything but reporting — it
    -- decides which fairness pool the lead is counted in, never whether the
    -- lead is valid.
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
    -- ── unchanged qualification rules ───────────────────────────────────────
    -- Every gate below is byte-for-byte what migration 03 enforced. A lead is
    -- still only created for a verified, active, non-self contact by phone or
    -- WhatsApp. Adding market attribution must not loosen this.
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

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_pandit_id::text, 42),
        hashtextextended(p_user_id::text, 42)
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
    -- We only get here for a phone-verified user, so the number is evidence.
    v_country := country_from_phone(v_user.phone);

    IF v_country IS NOT NULL THEN
        v_market  := CASE WHEN v_country = 'IN' THEN 'INDIA' ELSE 'INTERNATIONAL' END;
        v_msource := 'VERIFIED_PHONE';
    ELSE
        -- Unrecognised dial code. Defaulting to INDIA is the least-harm choice
        -- on an India-first platform, but it is a DECISION, not evidence — so
        -- it is recorded as ADMIN_OVERRIDE and stays visible to anyone auditing
        -- a disputed attribution. It is never recorded as VERIFIED_PHONE.
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

-- Same lockdown as migration 03. SECURITY DEFINER with a public EXECUTE grant
-- would let any role forge leads.
REVOKE ALL ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR, UUID, UUID) FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
        GRANT EXECUTE ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR, UUID, UUID) TO panditconnect_app;
    END IF;
END $$;

-- Any lead that slipped in between migration 15 and this one.
UPDATE qualified_leads ql
   SET market = CASE WHEN country_from_phone(u.phone) = 'IN' OR country_from_phone(u.phone) IS NULL
                     THEN 'INDIA'::lead_market ELSE 'INTERNATIONAL'::lead_market END,
       market_source = COALESCE(ql.market_source, 'ADMIN_OVERRIDE'::market_source)
  FROM users u
 WHERE u.id = ql.user_id
   AND ql.market IS NULL;

-- Belt and braces: nothing may be left without a market, or it becomes
-- invisible to the fairness engine.
UPDATE qualified_leads
   SET market = 'INDIA', market_source = 'ADMIN_OVERRIDE'
 WHERE market IS NULL;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
    n INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'country_from_phone') THEN
        RAISE EXCEPTION 'Migration 16 incomplete — country_from_phone() missing';
    END IF;

    -- Exactly one record_qualified_lead, with the new arity. Two would make
    -- every 5-argument call ambiguous and break contact tracking outright.
    SELECT COUNT(*) INTO n FROM pg_proc WHERE proname = 'record_qualified_lead';
    IF n <> 1 THEN
        RAISE EXCEPTION 'Migration 16 incomplete — expected 1 record_qualified_lead(), found %', n;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'record_qualified_lead' AND pronargs = 7
    ) THEN
        RAISE EXCEPTION 'Migration 16 incomplete — record_qualified_lead() did not gain the pool-context arguments';
    END IF;

    SELECT COUNT(*) INTO n FROM qualified_leads WHERE market IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'Migration 16 incomplete — % qualified lead(s) still have no market', n;
    END IF;

    -- The derivation itself, on the formats that actually occur.
    IF country_from_phone('9876543210')    <> 'IN' THEN RAISE EXCEPTION 'country_from_phone: bare Indian mobile misread'; END IF;
    IF country_from_phone('+919876543210') <> 'IN' THEN RAISE EXCEPTION 'country_from_phone: +91 misread'; END IF;
    IF country_from_phone('+971501234567') <> 'AE' THEN RAISE EXCEPTION 'country_from_phone: +971 shadowed by +91'; END IF;
    IF country_from_phone('+447700900123') <> 'GB' THEN RAISE EXCEPTION 'country_from_phone: +44 misread'; END IF;
    IF country_from_phone('+12025550123')  <> 'US' THEN RAISE EXCEPTION 'country_from_phone: +1 misread'; END IF;
    IF country_from_phone(NULL) IS NOT NULL         THEN RAISE EXCEPTION 'country_from_phone: NULL must stay NULL'; END IF;

    RAISE NOTICE 'Migration 16 applied: qualified leads now carry market, market_source and pool context.';
END
$verify$;
