const repo = require('../../repositories/admin/subscriptions.repository');
const pandits = require('../../repositories/admin/pandits.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

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

async function refund(req, res) {
  const { amount, reason } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'amount is required' });
  const payment = await repo.refund(req.db, req.params.id, amount, reason);
  if (!payment) return res.status(404).json({ error: 'Payment not found or not refundable (must be completed)' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'PAYMENT_REFUNDED', targetType: 'payment_transaction', targetId: req.params.id, details: { amount, reason }, ip: req.ip });
  res.json(payment);
}

const revenueOverview = async (req, res) => res.json(await repo.revenueOverview(req.db));

module.exports = { listPlans, createPlan, updatePlan, listSubscriptions, grant, listPayments, getPayment, refund, revenueOverview };
