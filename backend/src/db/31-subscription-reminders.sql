-- ============================================================================
-- Module 31: Subscription expiry reminders (Phase 3 of the subscription/
-- billing project)
-- ============================================================================
-- Dedup log so a reminder for a given (subscription, offset) pair is only
-- ever sent once, no matter how many times the scheduler tick runs — the
-- scheduler is deliberately coarse (hourly) and idempotent-by-construction
-- is simpler and safer than trying to make the tick itself exactly-once.
--
-- Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_reminder_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES pandit_subscriptions(id) ON DELETE CASCADE,
    offset_days     INTEGER NOT NULL, -- >=0: N days BEFORE expiry. <0: N days AFTER expiry.
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT subscription_reminder_log_unique UNIQUE (subscription_id, offset_days)
);

CREATE INDEX IF NOT EXISTS idx_subscription_reminder_log_sub ON subscription_reminder_log(subscription_id);

COMMENT ON TABLE subscription_reminder_log IS
  'One row per (subscription, offset) reminder actually sent — the dedup guard '
  'for services/billing/reminderScheduler.js. No RLS: only ever touched by that '
  'scheduler and never exposed on any pandit- or admin-facing read endpoint today.';

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT ON subscription_reminder_log TO panditconnect_app;
  END IF;
END
$grants$;

COMMIT;

DO $verify$
BEGIN
  IF to_regclass('public.subscription_reminder_log') IS NULL THEN
    RAISE EXCEPTION 'Migration 31 incomplete — subscription_reminder_log missing';
  END IF;
  RAISE NOTICE 'Migration 31 applied: subscription reminder dedup log created.';
END
$verify$;
