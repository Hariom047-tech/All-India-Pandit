-- ============================================================================
-- Module 28: Subscription billing hardening (Phase 1 of the subscription/
-- Razorpay/admin-revenue project)
-- ============================================================================
-- Everything needed for the subscribe→pay→webhook flow to be safe under
-- duplicate/replayed webhooks, and for a payment row to carry enough of its
-- own history that a later admin price change can never alter what a pandit
-- was actually charged.
--
-- Nothing here changes existing behaviour by itself — the Node-side changes
-- (payments.controller.js / payments.repository.js) are what start using
-- these columns/table. Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. payment_transactions: failure detail + a self-contained plan snapshot
-- ------------------------------------------------------------
-- amount/currency/gst_amount already snapshot what was actually charged
-- (subscription_plans can change price tomorrow without touching this row) —
-- plan_name_snapshot completes that so an invoice never has to re-join
-- subscription_plans to render a plan NAME either.
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS failure_code        VARCHAR(100);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS failure_description TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS plan_name_snapshot  VARCHAR(100);

COMMENT ON COLUMN payment_transactions.failure_code IS
  'Razorpay error code from a payment.failed webhook event. NULL for anything that never failed.';
COMMENT ON COLUMN payment_transactions.plan_name_snapshot IS
  'subscription_plans.name at the moment this purchase was created — an invoice reads this, '
  'never a live join, so a later admin rename does not rewrite history.';

-- ------------------------------------------------------------
-- 2. webhook_events — idempotency + audit trail for every inbound Razorpay
--    webhook call, verified or not (an invalid-signature attempt is still
--    worth a row, for the security log to point at)
-- ------------------------------------------------------------
-- dedupe_key is deterministic (event_type + Razorpay entity id), not reliant
-- on an optional delivery-id header — Razorpay resends the exact same
-- payload on retry, and delivering "payment.captured" for the same payment
-- id twice must never re-run activateSubscription() twice.
CREATE TABLE IF NOT EXISTS webhook_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider           VARCHAR(30) NOT NULL DEFAULT 'razorpay',
    event_type         VARCHAR(60) NOT NULL,
    dedupe_key         VARCHAR(200) NOT NULL,
    payload            JSONB,
    received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at       TIMESTAMPTZ,
    processing_status  VARCHAR(20) NOT NULL DEFAULT 'received', -- received | processed | failed | ignored
    attempt_count      INTEGER NOT NULL DEFAULT 1,
    error_message      TEXT,

    CONSTRAINT webhook_events_provider_dedupe_key UNIQUE (provider, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status   ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at DESC);

COMMENT ON TABLE webhook_events IS
  'Every inbound Razorpay webhook call, keyed by a deterministic (event_type, entity id) '
  'dedupe key. Only ever touched server-side by the webhook handler — no RLS, no pandit- '
  'or admin-facing endpoint reads this today.';

-- ------------------------------------------------------------
-- 3. Grants — guarded exactly like every prior migration (a hand-created DB
--    may not have panditconnect_app yet).
-- ------------------------------------------------------------
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE ON webhook_events TO panditconnect_app;
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'payment_transactions' AND column_name = 'plan_name_snapshot'
  ) THEN
    RAISE EXCEPTION 'Migration 28 incomplete — payment_transactions.plan_name_snapshot missing';
  END IF;
  IF to_regclass('public.webhook_events') IS NULL THEN
    RAISE EXCEPTION 'Migration 28 incomplete — webhook_events table missing';
  END IF;
  RAISE NOTICE 'Migration 28 applied: payment_transactions hardened, webhook_events idempotency table created.';
END
$verify$;
