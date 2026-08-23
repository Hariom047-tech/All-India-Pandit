-- ============================================================================
-- Module 30: Real refund tracking (Phase 2 of the subscription/billing project)
-- ============================================================================
-- Until now POST /admin/payments/:id/refund only flipped payment_transactions
-- .status to 'refunded' in the database — no Razorpay refund API call ever
-- happened, so "refunding" here never actually returned the devotee's money.
-- This migration adds the one column needed to record that a REAL gateway
-- refund happened: the Razorpay refund id. The Node-side change (a real
-- POST /v1/payments/:id/refund call — see services/billing/razorpayClient.js)
-- is what actually issues the refund; this is just where the proof of it lives.
--
-- Deliberately NOT adding a 'partially_refunded' value to the payment_status
-- enum — refund_amount < amount already tells partial from full apart
-- (checkable at read time), and altering an existing enum type carries more
-- migration risk than this needs for what it buys. Documented simplification,
-- not an oversight.
--
-- Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_refund_id VARCHAR(255);
COMMENT ON COLUMN payment_transactions.gateway_refund_id IS
  'Razorpay refund id from a real POST /v1/payments/:id/refund call. NULL means '
  'either never refunded, or refunded before a Razorpay account existed to call '
  '(a DB-only status flip — see admin/subscriptions.controller.js refund()).';

COMMIT;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'payment_transactions' AND column_name = 'gateway_refund_id'
  ) THEN
    RAISE EXCEPTION 'Migration 30 incomplete — gateway_refund_id missing';
  END IF;
  RAISE NOTICE 'Migration 30 applied: payment_transactions can now record a real Razorpay refund id.';
END
$verify$;
