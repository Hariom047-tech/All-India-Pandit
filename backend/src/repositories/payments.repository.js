const { query } = require('../config/db');

const BILLING_DAYS = { monthly: 30, quarterly: 90, yearly: 365 };

async function findPlanByTier(tier) {
  const { rows } = await query('SELECT * FROM subscription_plans WHERE tier = $1 AND is_active = TRUE', [tier]);
  return rows[0] || null;
}

async function findPanditBySlug(slug) {
  const { rows } = await query('SELECT id, user_id, current_tier FROM pandits WHERE slug = $1', [slug]);
  return rows[0] || null;
}

// payment_transactions has RLS scoped to "the owning pandit" — INSERT ...
// RETURNING needs the new row to pass a SELECT policy too, so this needs
// RLS context. Callers should wrap with withUserContext(req.user.id, (q) =>
// repo.createPendingSubscriptionAndPayment({...}, q)).
async function createPendingSubscriptionAndPayment({ panditId, plan, billingCycle, gatewayOrderId, amount, invoiceNumber }, q = query) {
  const days = BILLING_DAYS[billingCycle] || 30;
  const { rows: subRows } = await q(
    `INSERT INTO pandit_subscriptions (pandit_id, plan_id, billing_cycle, starts_at, expires_at, is_active)
     VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' days')::interval, FALSE) RETURNING id`,
    [panditId, plan.id, billingCycle, days],
  );
  const subscriptionId = subRows[0].id;

  const { rows: payRows } = await q(
    `INSERT INTO payment_transactions (pandit_id, subscription_id, plan_id, amount, status, gateway, gateway_order_id, invoice_number)
     VALUES ($1, $2, $3, $4, 'pending', 'razorpay', $5, $6) RETURNING id`,
    [panditId, subscriptionId, plan.id, amount, gatewayOrderId, invoiceNumber],
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

/** Called from the payments webhook once Razorpay confirms capture — marks
 *  the payment complete, activates the subscription, and promotes the
 *  pandit's tier + rank_score (calculate_pandit_rank, 01-schema.sql) so the
 *  upgrade actually affects search placement immediately. */
async function activateSubscription({ paymentId, subscriptionId, panditId, tier, gatewayPaymentId, gatewaySignature }) {
  await query(
    `UPDATE payment_transactions SET status = 'completed', paid_at = NOW(), gateway_payment_id = $2, gateway_signature = $3 WHERE id = $1`,
    [paymentId, gatewayPaymentId, gatewaySignature],
  );
  const { rows } = await query(
    `UPDATE pandit_subscriptions SET is_active = TRUE, last_payment_id = $2 WHERE id = $1 RETURNING expires_at`,
    [subscriptionId, paymentId],
  );
  await query(
    `UPDATE pandits SET current_tier = $2, subscription_expires_at = $3 WHERE id = $1`,
    [panditId, tier, rows[0].expires_at],
  );
  await query('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [panditId]);
}

module.exports = {
  findPlanByTier, findPanditBySlug, createPendingSubscriptionAndPayment,
  findPaymentByGatewayOrderId, activateSubscription,
};
