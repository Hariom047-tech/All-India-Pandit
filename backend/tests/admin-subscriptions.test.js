process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const adminSubsRepo = require('../src/repositories/admin/subscriptions.repository');
const paymentsRepo = require('../src/repositories/payments.repository');
const { addBillingPeriod } = require('../src/utils/billingPeriod');
const { withUserContext, withSetting } = require('../src/config/db');
const { makePandit, uniq, superQuery, withAdminContext } = require('./helpers');

test('admin grantSubscription actually promotes current_tier', async (t) => {
  await t.test('regression: the RLS bug that silently no-op\'d this is fixed', async () => {
    const p = await makePandit();
    const result = await withAdminContext((q) => adminSubsRepo.grantSubscription(q, p.pandit.id, 'gold', 15));
    assert.ok(result.expires_at);

    const { rows } = await superQuery('SELECT current_tier, subscription_expires_at FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(rows[0].current_tier, 'gold');
    assert.ok(rows[0].subscription_expires_at);
  });

  await t.test('a second grant deactivates the first — no two simultaneous active subscriptions', async () => {
    const p = await makePandit();
    await withAdminContext((q) => adminSubsRepo.grantSubscription(q, p.pandit.id, 'silver', 10));
    await withAdminContext((q) => adminSubsRepo.grantSubscription(q, p.pandit.id, 'gold', 20));

    const { rows } = await superQuery(
      'SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE pandit_id = $1 AND is_active = TRUE', [p.pandit.id],
    );
    assert.equal(rows[0].c, 1);

    const { rows: panditRows } = await superQuery('SELECT current_tier FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(panditRows[0].current_tier, 'gold');
  });
});

test('admin refund (repository layer, no gateway configured)', async (t) => {
  await t.test('DB-only fallback flips status to refunded and records the amount', async () => {
    const p = await makePandit();
    const plan = (await superQuery("SELECT * FROM subscription_plans WHERE tier = 'silver'")).rows[0];
    const now = new Date();
    const { subscriptionId, paymentId } = await withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
      panditId: p.pandit.id, plan, billingCycle: 'monthly', gatewayOrderId: `order_${uniq()}`,
      amount: plan.price_monthly, invoiceNumber: `INV-${uniq()}`, startsAt: now, expiresAt: addBillingPeriod(now, 'monthly'),
    }, q));
    await withSetting('app.webhook_verified', 'true', (q) => paymentsRepo.activateSubscription({
      paymentId, subscriptionId, panditId: p.pandit.id, tier: 'silver',
      gatewayPaymentId: `pay_${uniq()}`, gatewaySignature: 'test',
    }, q));

    const refunded = await withAdminContext((q) => adminSubsRepo.refund(q, paymentId, plan.price_monthly, 'devotee requested', null));
    assert.equal(refunded.status, 'refunded');
    assert.equal(Number(refunded.refund_amount), Number(plan.price_monthly));
    assert.equal(refunded.gateway_refund_id, null, 'no gateway id when no real refund call was made');
  });

  await t.test('refunding a pending (never-completed) payment is refused', async () => {
    const p = await makePandit();
    const plan = (await superQuery("SELECT * FROM subscription_plans WHERE tier = 'gold'")).rows[0];
    const now = new Date();
    const { paymentId } = await withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
      panditId: p.pandit.id, plan, billingCycle: 'monthly', gatewayOrderId: `order_${uniq()}`,
      amount: plan.price_monthly, invoiceNumber: `INV-${uniq()}`, startsAt: now, expiresAt: addBillingPeriod(now, 'monthly'),
    }, q));

    const result = await withAdminContext((q) => adminSubsRepo.refund(q, paymentId, plan.price_monthly, 'x', null));
    assert.equal(result, null);
  });
});

/** purchase() mirrors payments.test.js's own helper — a full
 *  create-then-activate purchase, real enough to exercise the renewal
 *  report's actual SQL rather than hand-inserted fixture rows. */
async function purchaseAndActivate(p, tier, { startsAt, expiresAt } = {}) {
  const plan = (await superQuery('SELECT * FROM subscription_plans WHERE tier = $1', [tier])).rows[0];
  const now = new Date();
  const start = startsAt || now;
  const end = expiresAt || addBillingPeriod(start, 'monthly');
  const { subscriptionId, paymentId } = await withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
    panditId: p.pandit.id, plan, billingCycle: 'monthly', gatewayOrderId: `order_${uniq()}`,
    amount: plan.price_monthly, invoiceNumber: `INV-${uniq()}`, startsAt: start, expiresAt: end,
  }, q));
  await withSetting('app.webhook_verified', 'true', (q) => paymentsRepo.activateSubscription({
    paymentId, subscriptionId, panditId: p.pandit.id, tier, gatewayPaymentId: `pay_${uniq()}`, gatewaySignature: 'test',
  }, q));
}

test('renewal report', async (t) => {
  await t.test('a pandit who bought twice (even a different tier) shows as renewed', async () => {
    const p = await makePandit();
    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await purchaseAndActivate(p, 'silver', { startsAt: past, expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });
    await purchaseAndActivate(p, 'gold'); // renews as a plan CHANGE, not just the same tier

    const { data } = await withAdminContext((q) => adminSubsRepo.renewals(q, { status: 'renewed', page: 1, perPage: 500 }));
    const row = data.find((r) => r.slug === p.pandit.slug);
    assert.ok(row, 'the twice-purchased pandit must appear in the renewed list');
    assert.equal(row.purchase_count, 2);
    assert.equal(row.first_tier, 'silver');
    assert.equal(row.latest_tier, 'gold');
  });

  await t.test('a pandit with one EXPIRED purchase and no follow-up shows as churned', async () => {
    const p = await makePandit();
    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await purchaseAndActivate(p, 'silver', { startsAt: past, expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) });

    const { data } = await withAdminContext((q) => adminSubsRepo.renewals(q, { status: 'churned', page: 1, perPage: 500 }));
    const row = data.find((r) => r.slug === p.pandit.slug);
    assert.ok(row, 'the never-renewed, expired pandit must appear in the churned list');
    assert.equal(row.purchase_count, 1);
    assert.equal(row.has_active_now, false);
  });

  await t.test('a pandit with one still-ACTIVE purchase shows as one_time_active, not churned', async () => {
    const p = await makePandit();
    await purchaseAndActivate(p, 'diamond');

    const { data } = await withAdminContext((q) => adminSubsRepo.renewals(q, { status: 'one_time_active', page: 1, perPage: 500 }));
    const row = data.find((r) => r.slug === p.pandit.slug);
    assert.ok(row, 'a currently-active first-time subscriber must show as one_time_active');
    assert.equal(row.purchase_count, 1);
    assert.equal(row.has_active_now, true);
  });

  await t.test('renewalSummary counts add up to at least what we just created', async () => {
    const summary = await withAdminContext((q) => adminSubsRepo.renewalSummary(q));
    assert.ok(summary.renewed_count >= 1);
    assert.ok(summary.churned_count >= 1);
    assert.ok(summary.one_time_active_count >= 1);
    assert.equal(summary.total_count, summary.renewed_count + summary.one_time_active_count + summary.churned_count);
  });
});

test('revenueOverview: subscribersByTier reflects live current_tier headcount', async (t) => {
  await t.test('a freshly-granted diamond pandit is counted', async () => {
    const p = await makePandit();
    await withAdminContext((q) => adminSubsRepo.grantSubscription(q, p.pandit.id, 'diamond', 30));

    const overview = await withAdminContext((q) => adminSubsRepo.revenueOverview(q));
    const diamondRow = overview.subscribersByTier.find((r) => r.tier === 'diamond');
    assert.ok(diamondRow);
    assert.ok(diamondRow.count >= 1);
  });
});
