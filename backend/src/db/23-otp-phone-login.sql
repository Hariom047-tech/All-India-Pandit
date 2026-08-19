-- ============================================================================
-- Module 29: Phone-number lookup for passwordless OTP login
-- ============================================================================
-- POST /api/auth/otp/login (auth.controller.js's phoneLogin) needs to find a
-- user by phone before any session/identity exists — same chicken-and-egg as
-- auth_find_user_by_email (01-schema.sql), same fix: a SECURITY DEFINER
-- function scoped to exactly this one lookup shape, nothing broader.
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION auth_find_user_by_phone(p_phone TEXT)
RETURNS SETOF users AS $$
    SELECT * FROM users WHERE phone = p_phone AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION auth_find_user_by_phone(TEXT) FROM PUBLIC;
DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION auth_find_user_by_phone(TEXT) TO panditconnect_app;
  END IF;
END $g$;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE proname = 'auth_find_user_by_phone') IS NOT TRUE THEN
    RAISE EXCEPTION 'Migration 23 incomplete — auth_find_user_by_phone is not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'Migration 23 applied: auth_find_user_by_phone() ready for phone-OTP login.';
END
$verify$;
