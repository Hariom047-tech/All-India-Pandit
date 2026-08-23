const { query } = require('../config/db');

async function findPlanByTier(tier) {
  const { rows } = await query('SELECT * FROM subscription_plans WHERE tier = $1 AND is_active = TRUE', [tier]);
  return rows[0] || null;
}

/** seat_usage() (migration 19) — read-only, no RLS on subscription_plans/
 *  plan_market_entitlements, safe on the bare pool. Checked BEFORE a Razorpay
 *  order is created so a devotee is never charged for a sold-out plan; the
 *  narrow race after that (seat fills between order and capture) is handled
 *  by activate_pandit_subscription()'s deliberate seat-cap override —
 *  a captured payment must never be refused its entitlement. */
async function seatAvailability(tier) {
  const { rows } = await query('SELECT * FROM seat_usage($1::subscription_tier)', [tier]);
  return rows[0]; // { tier, seat_cap, held, available } — seat_cap NULL means uncapped
}

/** subscription_expires_at is read here too — the controller needs it to
 *  decide whether this purchase is a same-plan renewal (preserves unused
 *  time) or a plan change (starts now) — see services/billing/subscriptionPeriod.js. */
async function findPanditBySlug(slug) {
  const { rows } = await query(
    'SELECT id, user_id, current_tier, subscription_expires_at FROM pandits WHERE slug = $1', [slug],
  );
  return rows[0] || null;
}

// payment_transactions has RLS scoped to "the owning pandit" — INSERT ...
// RETURNING needs the new row to pass a SELECT policy too, so this needs
// RLS context. Callers should wrap with withUserContext(req.user.id, (q) =>
// repo.createPendingSubscriptionAndPayment({...}, q)).
//
// startsAt/expiresAt are computed by the CALLER (subscriptionPeriod.js), not
// here — this function is a plain persistence step, not where the
// same-plan-renewal-preserves-remaining-time decision gets made.
async function createPendingSubscriptionAndPayment(
  { panditId, plan, billingCycle, gatewayOrderId, amount, gstAmount, invoiceNumber, startsAt, expiresAt },
  q = query,
) {
  const { rows: subRows } = await q(
    `INSERT INTO pandit_subscriptions (pandit_id, plan_id, billing_cycle, starts_at, expires_at, is_active)
     VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING id`,
    [panditId, plan.id, billingCycle, startsAt, expiresAt],
  );
  const subscriptionId = subRows[0].id;

  const { rows: payRows } = await q(
    `INSERT INTO payment_transactions
       (pandit_id, subscription_id, plan_id, amount, gst_amount, status, gateway, gateway_order_id, invoice_number, plan_name_snapshot)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'razorpay', $6, $7, $8) RETURNING id`,
    [panditId, subscriptionId, plan.id, amount, gstAmount || null, gatewayOrderId, invoiceNumber, plan.name],
  );
  return { subscriptionId, paymentId: payRows[0].id };
}

// Needs app.webhook_verified set (see payments_select_verified_webhook in
// 01-schema.sql) — callers should wrap with
// withSetting('app.webhook_verified', 'true', (q) => ...).
async function findPaymentByGatewayOrderId(gatewayOrderId, q = query) {
  const { rows } = await q('SELECT * FROM payment_transactions WHERE gateway_order_id = $1', [gatewayOrderId]);
  return rows[0] || null;
}

/**
 * Called from the payments webhook once Razorpay confirms capture — marks
 * the payment complete, activates the subscription, and promotes the
 * pandit's tier + rank_score (calculate_pandit_rank, 01-schema.sql) so the
 * upgrade actually affects search placement immediately.
 *
 * Also deactivates any OTHER still-active subscription row for the same
 * pandit — without this, a renewal or plan change would leave two rows
 * with is_active = TRUE, which is exactly the "conflicting simultaneous
 * entitlement" state a single pandit must never be in.
 *
 * MUST run with RLS opened (q bound via withSetting('app.webhook_verified',
 * 'true', ...) — see payments_update_system / payments_select_own in
 * 01-schema.sql). payment_transactions has RLS enabled, and the UPDATE's
 * matching rows are governed by that RLS the same way a SELECT would be —
 * calling this with the plain unscoped `query` silently matches ZERO rows
 * (no error, rowCount 0) rather than throwing, so the payment would stay
 * "pending" forever even though pandit_subscriptions did activate (that
 * table carries no RLS). Caught by tests/payments.test.js.
 *
 * The pandits.current_tier promotion goes through the SECURITY DEFINER
 * activate_pandit_subscription() (migration 29), NOT a plain UPDATE — a
 * webhook has neither a pandit's own session identity nor an admin one, so
 * it satisfies NEITHER pandits_update_self NOR pandits_update_admin, and a
 * bare UPDATE here would silently match zero rows exactly like the
 * payment_transactions issue above. See migration 29's comment for the full
 * story — this was a real, always-broken bug (no Razorpay account has ever
 * been configured on this project to exercise the path).
 */
async function activateSubscription({ paymentId, subscriptionId, panditId, tier, gatewayPaymentId, gatewaySignature }, q = query) {
  await q(
    `UPDATE payment_transactions SET status = 'completed', paid_at = NOW(), gateway_payment_id = $2, gateway_signature = $3 WHERE id = $1`,
    [paymentId, gatewayPaymentId, gatewaySignature],
  );
  const { rows } = await q(
    `UPDATE pandit_subscriptions SET is_active = TRUE, last_payment_id = $2 WHERE id = $1 RETURNING expires_at`,
    [subscriptionId, paymentId],
  );
  await q(
    `UPDATE pandit_subscriptions SET is_active = FALSE WHERE pandit_id = $1 AND id <> $2 AND is_active = TRUE`,
    [panditId, subscriptionId],
  );
  await q('SELECT activate_pandit_subscription($1, $2::subscription_tier, $3)', [panditId, tier, rows[0].expires_at]);
}

/**
 * Called from the webhook on a payment.failed event — the pending
 * subscription row is left exactly as it was (never activated, never
 * visible as the pandit's entitlement) so a failed payment can never grant
 * a plan; only the payment row records the failure for the pandit/admin to
 * see. Same RLS requirement as activateSubscription — pass a `q` bound via
 * withSetting('app.webhook_verified', 'true', ...).
 */
async function markPaymentFailed({ paymentId, failureCode, failureDescription }, q = query) {
  await q(
    `UPDATE payment_transactions
        SET status = 'failed', failure_code = $2, failure_description = $3
      WHERE id = $1 AND status = 'pending'`,
    [paymentId, failureCode || null, failureDescription || null],
  );
}

/**
 * Idempotency gate for the webhook. dedupeKey is deterministic (event_type +
 * Razorpay entity id) — see payments.controller.js. The `xmax = 0` trick
 * tells apart "this INSERT created the row" from "this hit the UNIQUE
 * constraint and updated the existing one", without a separate SELECT
 * first (which would itself race a concurrent duplicate delivery).
 */
async function recordWebhookEvent({ eventType, dedupeKey, payload }) {
  const { rows } = await query(
    `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload)
     VALUES ('razorpay', $1, $2, $3)
     ON CONFLICT (provider, dedupe_key) DO UPDATE
       SET attempt_count = webhook_events.attempt_count + 1
     RETURNING id, processing_status, attempt_count, (xmax = 0) AS inserted`,
    [eventType, dedupeKey, payload ? JSON.stringify(payload) : null],
  );
  const row = rows[0];
  return {
    id: row.id,
    isNew: row.inserted,
    alreadyProcessed: !row.inserted && row.processing_status === 'processed',
  };
}

async function markWebhookEventStatus(id, status, errorMessage = null) {
  await query(
    `UPDATE webhook_events SET processing_status = $2, processed_at = NOW(), error_message = $3 WHERE id = $1`,
    [id, status, errorMessage],
  );
}

/**
 * Defensive reconciliation for a refund.processed webhook (see
 * payments.controller.js) — only ever moves a row from 'completed' toward
 * 'refunded'; never touches a row the admin refund flow (or an earlier
 * delivery of this same event) already reconciled, and never invents a
 * refund the gateway didn't actually confirm.
 */
async function reconcileRefundFromWebhook({ gatewayPaymentId, gatewayRefundId, amount }, q = query) {
  await q(
    `UPDATE payment_transactions
        SET status = 'refunded', refunded_at = COALESCE(refunded_at, NOW()),
            refund_amount = COALESCE(refund_amount, $3),
            gateway_refund_id = COALESCE(gateway_refund_id, $2)
      WHERE gateway_payment_id = $1 AND status = 'completed'`,
    [gatewayPaymentId, gatewayRefundId, amount],
  );
}

/** Pandit's own payment history — paginated, own rows only (RLS + the
 *  explicit pandit_id predicate belt-and-braces, same pattern as
 *  qualifiedLeads.repository.js). */
async function listPaymentsForPandit(panditId, { page = 1, limit = 20 } = {}, q = query) {
  const offset = (page - 1) * limit;
  const { rows } = await q(
    `SELECT pt.id, pt.plan_id, pt.plan_name_snapshot, ps.billing_cycle, pt.amount, pt.gst_amount, pt.currency, pt.status,
            pt.gateway, pt.gateway_payment_id, pt.invoice_number, pt.failure_code, pt.failure_description,
            pt.paid_at, pt.created_at, pt.refund_amount, pt.refunded_at,
            ps.starts_at, ps.expires_at
       FROM payment_transactions pt
       LEFT JOIN pandit_subscriptions ps ON ps.id = pt.subscription_id
      WHERE pt.pandit_id = $1
      ORDER BY pt.created_at DESC
      LIMIT $2 OFFSET $3`,
    [panditId, limit, offset],
  );
  const { rows: countRows } = await q(
    'SELECT COUNT(*)::int AS total FROM payment_transactions WHERE pandit_id = $1', [panditId],
  );
  return { data: rows, total: countRows[0].total };
}

module.exports = {
  findPlanByTier, findPanditBySlug, createPendingSubscriptionAndPayment,
  findPaymentByGatewayOrderId, activateSubscription, markPaymentFailed,
  recordWebhookEvent, markWebhookEventStatus, listPaymentsForPandit, seatAvailability,
  reconcileRefundFromWebhook,
};
