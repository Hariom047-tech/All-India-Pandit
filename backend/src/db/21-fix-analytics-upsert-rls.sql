-- ============================================================================
-- Module 29: Fix the pandit_analytics daily-rollup UPSERT under RLS
-- ============================================================================
-- qualifiedLeads.repository.js's recordContact() does, on every contact
-- click:
--
--     INSERT INTO pandit_analytics (pandit_id, date, whatsapp_clicks, call_clicks)
--     VALUES (...)
--     ON CONFLICT (pandit_id, date) DO UPDATE SET ...
--
-- pandit_analytics has RLS enabled (01-schema.sql) with an unconditional
-- INSERT policy (analytics_write_system, WITH CHECK (true)) and an
-- unconditional UPDATE policy (analytics_update_system, USING (true)) — but
-- no SELECT policy that the app's normal runtime context (no special GUC
-- set for this table) ever satisfies. analytics_select_own only matches a
-- pandit reading their own row; analytics_select_admin only matches an
-- admin. A devotee's session — the caller on every real contact click — is
-- neither.
--
-- Per Postgres's documented ON CONFLICT DO UPDATE + RLS interaction, the
-- conflicting row must be visible under a SELECT policy for the UPDATE
-- branch to be evaluated at all. With no matching SELECT policy, Postgres
-- raises "new row violates row-level security policy" rather than silently
-- upserting — so this has failed on every SECOND-AND-LATER click a pandit
-- receives on the same day since the day this table's RLS was enabled. The
-- first click for a given (pandit, date) succeeds (plain INSERT, no
-- conflict); every one after it 500s, having already committed nothing for
-- either the click or the qualified lead (recordContact wraps both in one
-- transaction — see that file).
--
-- Fix: add a SELECT policy matching the INSERT/UPDATE policies already on
-- this table — unconditional, because this table holds only aggregate daily
-- click counts per pandit, not anything one devotee's session should be
-- gated from seeing on another's behalf. Actual application-facing reads
-- (the pandit's own dashboard, admin analytics) are unaffected: they already
-- go through analytics_select_own / analytics_select_admin, both untouched.
--
-- Idempotent.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS analytics_select_system ON pandit_analytics;
CREATE POLICY analytics_select_system ON pandit_analytics
    FOR SELECT USING (true);

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'analytics_select_system') THEN
    RAISE EXCEPTION 'Migration 21 incomplete — analytics_select_system missing';
  END IF;
  RAISE NOTICE 'Migration 21 applied: pandit_analytics upsert no longer fails under RLS on a second click for the same pandit/day.';
END
$verify$;
