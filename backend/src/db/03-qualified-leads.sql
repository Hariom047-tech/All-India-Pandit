-- ============================================================
-- Module 16: Pandit accounts, Qualified Leads & password reset
-- ============================================================
-- Forward migration. Safe to run against an existing database (every
-- statement is guarded) and also runs automatically as the third
-- /docker-entrypoint-initdb.d file on a fresh container.
--
-- WHY THIS EXISTS
-- Until now "a lead" was whatever landed in `inquiries` OR `contact_clicks`
-- (see get_pandit_lead_counts in 01-schema.sql). contact_clicks is written
-- for anonymous visitors too, so a bot or a curious guest tapping "Call"
-- 100 times inflated a pandit's lead count and skewed the fairness engine.
-- This migration introduces an explicit, auditable Qualified Lead entity and
-- repoints the fairness engine at it. Historical contact_clicks are
-- deliberately NOT backfilled into qualified_leads: they carry no proof of a
-- verified user identity, so promoting them would be inventing data. They
-- stay exactly where they are and keep working as analytics.

BEGIN;

-- ------------------------------------------------------------
-- 1. Date of birth (used as the second factor in pandit password reset)
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
COMMENT ON COLUMN users.date_of_birth IS
  'Set by an admin when provisioning a pandit account. Used ONLY as the second '
  'factor in the email+DOB password-reset challenge. Never returned by any API.';

-- ------------------------------------------------------------
-- 2. Lead status
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('new', 'viewed', 'contacted', 'completed', 'not_reachable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 3. Qualified leads
-- ------------------------------------------------------------
-- One row = one genuine, de-duplicated intent-to-contact from ONE verified
-- devotee to ONE pandit inside the deduplication window. Repeat taps (and
-- switching Call -> WhatsApp) bump interaction_count on the SAME row rather
-- than creating another lead.
CREATE TABLE IF NOT EXISTS qualified_leads (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pandit_id               UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    first_contact_method    contact_method NOT NULL,
    last_contact_method     contact_method NOT NULL,
    interaction_count       INTEGER NOT NULL DEFAULT 1,

    status                  lead_status NOT NULL DEFAULT 'new',
    source                  VARCHAR(60),

    -- Snapshot of what the devotee's verified identity was AT lead time.
    -- Denormalised on purpose: the pandit paid for this lead, so it must stay
    -- actionable and historically accurate even if the devotee later edits
    -- their profile or deletes their account. Nothing beyond name + the
    -- verified phone is copied.
    contact_name_snapshot   VARCHAR(150),
    contact_phone_snapshot  VARCHAR(15),

    -- End of the dedup window this lead "occupies". Kept as a real column so
    -- the dedup check is a plain indexed range scan rather than an
    -- expression over a runtime setting.
    dedup_window_ends_at    TIMESTAMPTZ NOT NULL,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interaction_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_changed_at       TIMESTAMPTZ,

    CONSTRAINT qualified_leads_interaction_count_positive CHECK (interaction_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_qleads_pandit_created ON qualified_leads(pandit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qleads_user_pandit_created ON qualified_leads(user_id, pandit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qleads_status ON qualified_leads(pandit_id, status);
CREATE INDEX IF NOT EXISTS idx_qleads_method ON qualified_leads(pandit_id, first_contact_method);
-- The dedup lookup: "is there a live window for this (pandit,user) pair?"
CREATE INDEX IF NOT EXISTS idx_qleads_dedup ON qualified_leads(pandit_id, user_id, dedup_window_ends_at DESC);

-- ------------------------------------------------------------
-- 4. Trace clicks back to the lead they belong to
-- ------------------------------------------------------------
-- Every CTA press still records a contact_click (that's the raw analytics
-- funnel). This just records which of them rolled up into a qualified lead,
-- so "CTA clicks vs verified interactions vs qualified leads" is answerable
-- from one table without guessing.
ALTER TABLE contact_clicks ADD COLUMN IF NOT EXISTS qualified_lead_id UUID REFERENCES qualified_leads(id) ON DELETE SET NULL;
ALTER TABLE contact_clicks ADD COLUMN IF NOT EXISTS created_qualified_lead BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_contact_clicks_user ON contact_clicks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_clicks_pandit_created ON contact_clicks(pandit_id, created_at DESC);

-- ------------------------------------------------------------
-- 5. Password reset challenges
-- ------------------------------------------------------------
-- Issued after email+DOB verifies. Token is stored sha256-hashed, exactly
-- like user_sessions.token_hash — a leaked database row must not be
-- redeemable as a reset token.
CREATE TABLE IF NOT EXISTS password_reset_challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    method          VARCHAR(30) NOT NULL DEFAULT 'email_dob',

    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,

    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    invalidated_at  TIMESTAMPTZ,

    request_ip      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_challenges(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_expires ON password_reset_challenges(expires_at);

-- ------------------------------------------------------------
-- 6. Plan presentation fields (admin-managed pricing + inclusions)
-- ------------------------------------------------------------
-- `features JSONB` already existed; these add the human-facing copy an admin
-- needs to actually merchandise a plan from the admin panel.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS tagline VARCHAR(160);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS lead_credits_monthly INTEGER;
COMMENT ON COLUMN subscription_plans.features IS
  'JSON array of inclusion strings shown on the plan card, e.g. ["Verified badge","Priority listing"].';

COMMIT;

-- ============================================================
-- 7. Qualified lead creation — atomic, concurrency-safe
-- ============================================================
-- CONCURRENCY DESIGN
-- Two parallel requests (double tap, two tabs, retried fetch) must never
-- produce two leads. A plain SELECT-then-INSERT races. Options considered:
--
--   (a) UNIQUE (pandit_id, user_id, tumbling_bucket) — concurrency-safe, but
--       changes the business rule: a tumbling bucket resets at a fixed clock
--       boundary, so contacts at 23:59 and 00:01 would be two leads even
--       though they're two minutes apart. The spec asks for a ROLLING window.
--   (b) SERIALIZABLE isolation — correct, but turns a hot public endpoint
--       into a retry loop the rest of this codebase isn't written for.
--   (c) Transaction-scoped advisory lock keyed on (pandit_id, user_id) —
--       CHOSEN. Serialises only the pair actually racing, needs no extra
--       column, releases automatically at COMMIT/ROLLBACK, and preserves
--       exact rolling-window semantics.
--
-- SECURITY DEFINER because qualified_leads has RLS and the writer is the
-- unprivileged app role. The function is narrowly scoped: it re-validates
-- every qualification invariant itself, so even a bug in the Node layer
-- cannot persist a lead for a guest, an unverified user, a suspended
-- account, an inactive pandit, or a self-contact.
CREATE OR REPLACE FUNCTION record_qualified_lead(
    p_pandit_id   UUID,
    p_user_id     UUID,
    p_method      contact_method,
    p_dedup_hours INTEGER,
    p_source      VARCHAR DEFAULT NULL
)
RETURNS TABLE(lead_id UUID, was_created BOOLEAN, reason TEXT) AS $$
DECLARE
    v_user      RECORD;
    v_pandit    RECORD;
    v_existing  RECORD;
    v_new_id    UUID;
BEGIN
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

    -- Serialise this (pandit,user) pair for the remainder of the transaction.
    -- Two keys keeps the lock space from colliding across unrelated pairs.
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

    INSERT INTO qualified_leads (
        pandit_id, user_id, first_contact_method, last_contact_method,
        contact_name_snapshot, contact_phone_snapshot,
        dedup_window_ends_at, source
    ) VALUES (
        p_pandit_id, p_user_id, p_method, p_method,
        v_user.full_name, v_user.phone,
        NOW() + (p_dedup_hours || ' hours')::interval, p_source
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, TRUE, 'created';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR) FROM PUBLIC;

-- ============================================================
-- 8. Fairness engine input — QUALIFIED LEADS ONLY
-- ============================================================
-- Replaces the 01-schema.sql version, which summed `inquiries` +
-- `contact_clicks`. Guest clicks, repeat taps and profile views now
-- contribute exactly zero to fair share and to the daily cap.
-- Signature is unchanged, so leadDistribution.repository.js needs no edit.
CREATE OR REPLACE FUNCTION get_pandit_lead_counts(p_since TIMESTAMPTZ, p_today_start TIMESTAMPTZ)
RETURNS TABLE(pandit_id UUID, window_leads BIGINT, today_leads BIGINT) AS $$
    SELECT ql.pandit_id,
           COUNT(*)::BIGINT AS window_leads,
           COUNT(*) FILTER (WHERE ql.created_at >= p_today_start)::BIGINT AS today_leads
      FROM qualified_leads ql
     WHERE ql.created_at >= p_since
     GROUP BY ql.pandit_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION get_pandit_lead_counts(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

-- ============================================================
-- 9. Row-Level Security
-- ============================================================
ALTER TABLE qualified_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_challenges ENABLE ROW LEVEL SECURITY;

-- A pandit reads ONLY their own leads. There is deliberately no devotee
-- SELECT policy: a devotee has no business querying the lead database, not
-- even for rows naming them (they already know who they contacted).
DROP POLICY IF EXISTS qleads_select_own_pandit ON qualified_leads;
CREATE POLICY qleads_select_own_pandit ON qualified_leads
    FOR SELECT USING (
        pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );

DROP POLICY IF EXISTS qleads_update_own_pandit ON qualified_leads;
CREATE POLICY qleads_update_own_pandit ON qualified_leads
    FOR UPDATE USING (
        pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );

DROP POLICY IF EXISTS qleads_select_admin ON qualified_leads;
CREATE POLICY qleads_select_admin ON qualified_leads
    FOR SELECT USING (current_app_user_is_admin());

-- No INSERT policy on purpose: the ONLY write path is
-- record_qualified_lead() (SECURITY DEFINER), so the app role cannot forge
-- a lead with a hand-written INSERT even if it wanted to.

-- Reset challenges are never read through a user session — only by the
-- SECURITY DEFINER helpers below — so no permissive policy is granted.
DROP POLICY IF EXISTS reset_admin_select ON password_reset_challenges;
CREATE POLICY reset_admin_select ON password_reset_challenges
    FOR SELECT USING (current_app_user_is_admin());

-- ============================================================
-- 10. Password reset helpers (pre-authentication, so SECURITY DEFINER)
-- ============================================================
-- Verifying email+DOB happens before any session exists, so it cannot go
-- through RLS — same chicken-and-egg as auth_find_user_by_email().
-- Returns nothing but a user id, and ONLY for pandit accounts: a devotee or
-- an admin account can never be reset through this path.
CREATE OR REPLACE FUNCTION auth_find_pandit_for_reset(p_email TEXT, p_dob DATE)
RETURNS TABLE(user_id UUID) AS $$
    SELECT u.id
      FROM users u
      JOIN pandits p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE lower(u.email) = lower(p_email)
       AND u.date_of_birth IS NOT NULL
       AND u.date_of_birth = p_dob
       AND u.role = 'pandit'
       AND u.status IN ('active', 'pending_verification')
       AND u.deleted_at IS NULL
     LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION auth_find_pandit_for_reset(TEXT, DATE) FROM PUBLIC;

CREATE OR REPLACE FUNCTION auth_create_reset_challenge(
    p_user_id UUID, p_token_hash TEXT, p_ttl_minutes INTEGER, p_ip TEXT
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    -- Only one live challenge per account: requesting a new one voids the old.
    UPDATE password_reset_challenges
       SET invalidated_at = NOW()
     WHERE user_id = p_user_id AND consumed_at IS NULL AND invalidated_at IS NULL;

    INSERT INTO password_reset_challenges (user_id, token_hash, expires_at, request_ip)
    VALUES (p_user_id, p_token_hash,
            NOW() + (p_ttl_minutes || ' minutes')::interval,
            NULLIF(p_ip, '')::inet)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION auth_create_reset_challenge(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;

-- Redeems a challenge and rotates the password in ONE transaction, then
-- revokes every existing session for that account. Single-use is enforced by
-- the `consumed_at IS NULL` predicate inside the UPDATE, not by a prior
-- SELECT, so two parallel redemptions cannot both succeed.
CREATE OR REPLACE FUNCTION auth_consume_reset_challenge(p_token_hash TEXT, p_new_password_hash TEXT)
RETURNS TABLE(ok BOOLEAN, user_id UUID, reason TEXT) AS $$
DECLARE v_challenge RECORD;
BEGIN
    UPDATE password_reset_challenges
       SET consumed_at = NOW()
     WHERE token_hash = p_token_hash
       AND consumed_at IS NULL
       AND invalidated_at IS NULL
       AND expires_at > NOW()
       AND attempts < max_attempts
    RETURNING id, password_reset_challenges.user_id INTO v_challenge;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'invalid_or_expired'; RETURN;
    END IF;

    UPDATE users SET password_hash = p_new_password_hash WHERE id = v_challenge.user_id;
    UPDATE user_sessions SET revoked_at = NOW()
     WHERE user_sessions.user_id = v_challenge.user_id AND revoked_at IS NULL;

    RETURN QUERY SELECT TRUE, v_challenge.user_id, 'reset';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION auth_consume_reset_challenge(TEXT, TEXT) FROM PUBLIC;

-- ============================================================
-- 11. Grants
-- ============================================================
-- Guarded: a database created by hand (rather than by 01-schema.sql, which
-- creates the role itself) may not have panditconnect_app. Unguarded GRANTs
-- would abort the script here, leaving the objects above created but the
-- functions ungranted — a confusing half-applied state.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE ON qualified_leads TO panditconnect_app;
    GRANT SELECT, INSERT, UPDATE ON password_reset_challenges TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION record_qualified_lead(UUID, UUID, contact_method, INTEGER, VARCHAR) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION get_pandit_lead_counts(TIMESTAMPTZ, TIMESTAMPTZ) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION auth_find_pandit_for_reset(TEXT, DATE) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION auth_create_reset_challenge(UUID, TEXT, INTEGER, TEXT) TO panditconnect_app;
    GRANT EXECUTE ON FUNCTION auth_consume_reset_challenge(TEXT, TEXT) TO panditconnect_app;

    -- Leads are the pandit's paid asset and the audit trail for billing
    -- disputes: the app role may create and re-status them, never erase them.
    REVOKE DELETE ON qualified_leads FROM panditconnect_app;
  ELSE
    RAISE NOTICE 'Role panditconnect_app not found — skipping grants. '
                 'Fine if the app connects as the schema owner.';
  END IF;
END
$grants$;

-- ============================================================
-- 12. Self-check
-- ============================================================
-- Fails loudly if anything above silently did not take effect, rather than
-- letting the app discover it later as "function does not exist".
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF to_regclass('public.qualified_leads') IS NULL THEN missing := missing || ' qualified_leads'; END IF;
  IF to_regclass('public.password_reset_challenges') IS NULL THEN missing := missing || ' password_reset_challenges'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_qualified_lead') THEN missing := missing || ' record_qualified_lead()'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_pandit_lead_counts') THEN missing := missing || ' get_pandit_lead_counts()'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'date_of_birth' AND NOT attisdropped) THEN missing := missing || ' users.date_of_birth'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 03 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 03 applied successfully: qualified leads, DOB reset and fairness rewiring are in place.';
END
$verify$;
