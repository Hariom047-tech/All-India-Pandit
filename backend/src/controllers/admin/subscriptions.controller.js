const repo = require('../../repositories/admin/subscriptions.repository');
const pandits = require('../../repositories/admin/pandits.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');
const razorpay = require('../../services/billing/razorpayClient');
const reconciliationRepo = require('../../repositories/admin/billingReconciliation.repository');

const listPlans = async (req, res) => res.json(await repo.listPlans(req.db));

const VALID_TIERS = ['free', 'silver', 'gold', 'diamond'];

async function createPlan(req, res) {
  const { name, tier, priceMonthly } = req.body || {};
  if (!name || !tier || priceMonthly === undefined) return res.status(400).json({ error: 'name, tier and priceMonthly are required' });
  if (!VALID_TIERS.includes(tier)) return res.status(400).json({ error: `tier must be one of: ${VALID_TIERS.join(', ')}` });
  if (Number(priceMonthly) < 0) return res.status(400).json({ error: 'priceMonthly cannot be negative' });
  if (req.body.features !== undefined && !Array.isArray(req.body.features)) {
    return res.status(400).json({ error: 'features must be an array of inclusion strings' });
  }
  const plan = await repo.createPlan(req.db, req.body);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SUBSCRIPTION_PLAN_CREATED', targetType: 'subscription_plan', targetId: plan.id, ip: req.ip });
  res.status(201).json(plan);
}

async function updatePlan(req, res) {
  if (req.body?.features !== undefined && !Array.isArray(req.body.features)) {
    return res.status(400).json({ error: 'features must be an array of inclusion strings' });
  }
  if (req.body?.priceMonthly !== undefined && Number(req.body.priceMonthly) < 0) {
    return res.status(400).json({ error: 'priceMonthly cannot be negative' });
  }
  const plan = await repo.updatePlan(req.db, req.params.id, req.body || {});
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'SUBSCRIPTION_PLAN_UPDATED',
    targetType: 'subscription_plan', targetId: plan.id, ip: req.ip,
  });
  res.json(plan);
}

async function listSubscriptions(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { tier, activeOnly } = req.query;
  const { data, total } = await repo.listSubscriptions(req.db, { tier, activeOnly, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function grant(req, res) {
  const { panditSlug, tier, durationDays, reason } = req.body || {};
  if (!panditSlug || !['free', 'silver', 'gold', 'diamond'].includes(tier)) {
    return res.status(400).json({ error: 'panditSlug and a valid tier are required' });
  }
  const pandit = await pandits.findIdBySlug(req.db, panditSlug);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  const result = await repo.grantSubscription(req.db, pandit.id, tier, durationDays);
  if (!result) return res.status(404).json({ error: `No plan found for tier "${tier}"` });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SUBSCRIPTION_GRANTED', targetType: 'pandit', targetId: pandit.id, details: { tier, durationDays, reason }, ip: req.ip });
  res.json({ ok: true, expiresAt: result.expires_at });
}

async function listPayments(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { status, gateway } = req.query;
  const { data, total } = await repo.listPayments(req.db, { status, gateway, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function getPayment(req, res) {
  const payment = await repo.getPayment(req.db, req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
}

/**
 * Issues a REAL Razorpay refund (super_admin only — see the route) when a
 * gateway account is configured and the payment has a real
 * gateway_payment_id; otherwise falls back to the DB-only status flip this
 * always did, so test/dev environments without Razorpay keys keep working.
 * Never marks refunded in the database before the gateway call itself
 * succeeds — an admin must never believe money moved when it didn't.
 */
async function refund(req, res) {
  const { amount, reason } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  const existing = await repo.getPayment(req.db, req.params.id);
  if (!existing || existing.status !== 'completed') {
    return res.status(404).json({ error: 'Payment not found or not refundable (must be completed)' });
  }
  if (Number(amount) > Number(existing.amount) - Number(existing.refund_amount || 0)) {
    return res.status(400).json({ error: 'Refund amount exceeds what remains refundable on this payment' });
  }

  let gatewayRefundId = null;
  if (razorpay.isConfigured() && existing.gateway_payment_id) {
    try {
      const rzRefund = await razorpay.refundPayment(existing.gateway_payment_id, {
        amountPaise: Math.round(Number(amount) * 100),
        notes: reason ? { reason } : undefined,
      });
      gatewayRefundId = rzRefund.id;
    } catch (err) {
      return res.status(502).json({ error: `Razorpay refund failed — no changes made: ${err.message}` });
    }
  }

  const payment = await repo.refund(req.db, req.params.id, amount, reason, gatewayRefundId);
  if (!payment) return res.status(404).json({ error: 'Payment not found or not refundable (must be completed)' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'PAYMENT_REFUNDED', targetType: 'payment_transaction',
    targetId: req.params.id, details: { amount, reason, gatewayRefundId, viaGateway: Boolean(gatewayRefundId) }, ip: req.ip,
  });
  res.json(payment);
}

const revenueOverview = async (req, res) => res.json(await repo.revenueOverview(req.db));

/** Read-only — flags mismatches for a human to review, never auto-repairs
 *  anything. See billingReconciliation.repository.js for what each section means. */
const reconciliation = async (req, res) => res.json(await reconciliationRepo.report(req.db));

const RENEWAL_STATUSES = ['renewed', 'one_time_active', 'churned'];

/**
 * Renewal/retention report — "did this pandit come back and buy again"
 * (same tier or a different one both count) vs "bought once and never
 * returned". See subscriptions.repository.js's renewals() doc comment.
 *
 * Deliberately NOT run through paginationEnvelope — that wraps the list as
 * { data, meta }, and adminApi.ts's client auto-flattens ANY { data, meta }
 * shaped response into { data, ...meta }, which would silently drop
 * `summary` (a sibling of data/meta, not inside either). Flat top-level
 * fields here instead.
 */
async function renewalReport(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { status } = req.query;
  if (status && !RENEWAL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${RENEWAL_STATUSES.join(', ')}` });
  }
  const [summary, { data, total }] = await Promise.all([
    repo.renewalSummary(req.db),
    repo.renewals(req.db, { status, page: paging.page, perPage: paging.perPage }),
  ]);
  res.json({
    summary, data, total,
    page: paging.page, perPage: paging.perPage, totalPages: Math.max(1, Math.ceil(total / paging.perPage)),
  });
}

module.exports = {
  listPlans, createPlan, updatePlan, listSubscriptions, grant, listPayments, getPayment, refund,
  revenueOverview, reconciliation, renewalReport,
};
