// Fake Razorpay credentials for THIS test file's process only — Node's test
// runner isolates each tests/*.test.js file into its own process (see
// package.json's `test` script), so this never leaks into other test files
// and never touches a real Razorpay account. Must be set before app.js (and
// therefore config/env.js) is first required.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
process.env.RAZORPAY_KEY_SECRET = 'fake_key_secret_for_tests_only';
process.env.RAZORPAY_WEBHOOK_SECRET = 'fake_webhook_secret_for_tests_only';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../src/app');
const { withUserContext, withSetting } = require('../src/config/db');
const paymentsRepo = require('../src/repositories/payments.repository');
const { addBillingPeriod } = require('../src/utils/billingPeriod');
const { resolveNewPeriod } = require('../src/services/billing/subscriptionPeriod');
const { computeTax } = require('../src/services/billing/tax');
const { request, auth, makePandit, uniq, superQuery } = require('./helpers');

/** createPendingSubscriptionAndPayment's payment_transactions INSERT...
 *  RETURNING needs RLS context (payments_select_own) to pass — the pandit's
 *  OWN user id, exactly like a real /subscribe request would run under. */
function purchase(p, plan, { billingCycle = 'monthly', startsAt, expiresAt, amount } = {}) {
  const now = new Date();
  return withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
    panditId: p.pandit.id,
    plan,
    billingCycle,
    gatewayOrderId: `order_${uniq()}`,
    amount: amount ?? plan[{ monthly: 'price_monthly', quarterly: 'price_quarterly', yearly: 'price_yearly' }[billingCycle]],
    invoiceNumber: `INV-${uniq()}`,
    startsAt: startsAt || now,
    expiresAt: expiresAt || addBillingPeriod(now, billingCycle),
  }, q));
}

async function planByTier(tier) {
  const { rows } = await superQuery('SELECT * FROM subscription_plans WHERE tier = $1', [tier]);
  return rows[0];
}

/** activateSubscription's payment_transactions UPDATE needs the same RLS
 *  gate the real webhook opens (app.webhook_verified) — see the doc comment
 *  on activateSubscription itself. */
function activate(args) {
  return withSetting('app.webhook_verified', 'true', (q) => paymentsRepo.activateSubscription(args, q));
}

// ---------------------------------------------------------------- pure math

test('billingPeriod: calendar-aware duration math', async (t) => {
  await t.test('monthly clamps 31 Jan to 28/29 Feb, never rolls into March', () => {
    assert.equal(addBillingPeriod(new Date('2026-01-31T10:00:00.000Z'), 'monthly').toISOString(), '2026-02-28T10:00:00.000Z');
    assert.equal(addBillingPeriod(new Date('2024-01-31T10:00:00.000Z'), 'monthly').toISOString(), '2024-02-29T10:00:00.000Z');
  });
  await t.test('quarterly adds 3 calendar months with the same clamping', () => {
    assert.equal(addBillingPeriod(new Date('2026-01-31T10:00:00.000Z'), 'quarterly').toISOString(), '2026-04-30T10:00:00.000Z');
  });
  await t.test('yearly clamps 29 Feb to 28 Feb in a non-leap target year', () => {
    assert.equal(addBillingPeriod(new Date('2024-02-29T10:00:00.000Z'), 'yearly').toISOString(), '2025-02-28T10:00:00.000Z');
  });
  await t.test('unknown cycle throws rather than silently defaulting', () => {
    assert.throws(() => addBillingPeriod(new Date(), 'weekly'));
  });
});

test('resolveNewPeriod: renewal vs plan-change semantics', async (t) => {
  await t.test('same-plan renewal while still active starts from the CURRENT expiry, not now', () => {
    const currentExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const { startsAt, expiresAt, isRenewal } = resolveNewPeriod({
      currentTier: 'gold', currentExpiresAt, targetTier: 'gold', billingCycle: 'monthly',
    });
    assert.equal(isRenewal, true);
    assert.equal(startsAt.getTime(), currentExpiresAt.getTime());
    assert.equal(expiresAt.getTime(), addBillingPeriod(currentExpiresAt, 'monthly').getTime());
  });

  await t.test('plan CHANGE (different tier) starts now even if an active period remains — the disclosed non-proration policy', () => {
    const currentExpiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const before = Date.now();
    const { startsAt, isRenewal } = resolveNewPeriod({
      currentTier: 'silver', currentExpiresAt, targetTier: 'gold', billingCycle: 'monthly',
    });
    assert.equal(isRenewal, false);
    assert.ok(startsAt.getTime() >= before);
  });

  await t.test('an EXPIRED same-plan "renewal" starts now, not from the stale past expiry', () => {
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const before = Date.now();
    const { startsAt, isRenewal } = resolveNewPeriod({
      currentTier: 'gold', currentExpiresAt: pastExpiry, targetTier: 'gold', billingCycle: 'yearly',
    });
    assert.equal(isRenewal, false);
    assert.ok(startsAt.getTime() >= before);
  });

  await t.test('no prior subscription (free -> paid) starts now', () => {
    const { startsAt, isRenewal } = resolveNewPeriod({
      currentTier: 'free', currentExpiresAt: null, targetTier: 'silver', billingCycle: 'monthly',
    });
    assert.equal(isRenewal, false);
    assert.ok(Date.now() - startsAt.getTime() < 5000);
  });
});

test('computeTax: off by default, correct math both ways when on', async (t) => {
  await t.test('disabled never invents a GST amount', () => {
    assert.deepEqual(computeTax(599, { enabled: false }), { payableAmount: 599, gstAmount: 0 });
  });
  await t.test('exclusive: tax added on top', () => {
    const r = computeTax(599, { enabled: true, percentage: 18, inclusive: false });
    assert.equal(r.gstAmount, 107.82);
    assert.equal(r.payableAmount, 706.82);
  });
  await t.test('inclusive: sticker price unchanged, tax extracted from within it', () => {
    const r = computeTax(599, { enabled: true, percentage: 18, inclusive: true });
    assert.equal(r.payableAmount, 599);
    assert.equal(r.gstAmount, 91.37);
  });
  await t.test('zero percentage behaves like disabled', () => {
    assert.deepEqual(computeTax(599, { enabled: true, percentage: 0 }), { payableAmount: 599, gstAmount: 0 });
  });
});

// -------------------------------------------------------- repository layer

test('payments.repository: activateSubscription leaves exactly one active row', async (t) => {
  await t.test('a second activation deactivates the first, so a pandit never has two simultaneous active subscriptions', async () => {
    const p = await makePandit();
    const plan = await planByTier('gold');

    async function purchaseAndActivate(startsAt, expiresAt) {
      const { subscriptionId, paymentId } = await purchase(p, plan, { startsAt, expiresAt });
      await activate({
        paymentId, subscriptionId, panditId: p.pandit.id, tier: 'gold',
        gatewayPaymentId: `pay_${uniq()}`, gatewaySignature: 'test',
      });
    }

    const now = new Date();
    await purchaseAndActivate(now, addBillingPeriod(now, 'monthly'));
    const secondStart = addBillingPeriod(now, 'monthly');
    await purchaseAndActivate(secondStart, addBillingPeriod(secondStart, 'monthly'));

    const { rows } = await superQuery(
      'SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE pandit_id = $1 AND is_active = TRUE',
      [p.pandit.id],
    );
    assert.equal(rows[0].c, 1, 'exactly one active subscription row must remain');
  });
});

// -------------------------------------------------------------- HTTP layer

function signPayload(payload) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  return { raw, signature };
}

test('POST /api/payments/webhook', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('invalid signature is rejected and never activates anything', async () => {
    const p = await makePandit();
    const plan = await planByTier('silver');
    const { paymentId } = await purchase(p, plan);
    const orderId = (await superQuery('SELECT gateway_order_id FROM payment_transactions WHERE id = $1', [paymentId])).rows[0].gateway_order_id;

    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: `pay_${uniq()}`, order_id: orderId } } } };
    const res = await request(server, 'POST', '/api/payments/webhook', payload, { 'x-razorpay-signature': 'not-a-real-signature' });
    assert.equal(res.status, 400);

    const { rows } = await superQuery('SELECT status FROM payment_transactions WHERE id = $1', [paymentId]);
    assert.equal(rows[0].status, 'pending', 'an invalid signature must never move a payment out of pending');
  });

  await t.test('payment.captured activates the subscription and promotes current_tier', async () => {
    const p = await makePandit();
    const plan = await planByTier('diamond');
    // yearly: only price_monthly is seeded for any plan today (see
    // subscription_plans) — monthly here, calendar math for other cycles is
    // already covered by the pure billingPeriod tests above.
    const { paymentId } = await purchase(p, plan, { billingCycle: 'monthly' });
    const orderId = (await superQuery('SELECT gateway_order_id FROM payment_transactions WHERE id = $1', [paymentId])).rows[0].gateway_order_id;

    const event = { event: 'payment.captured', payload: { payment: { entity: { id: `pay_${uniq()}`, order_id: orderId } } } };
    const { signature } = signPayload(event);
    const res = await request(server, 'POST', '/api/payments/webhook', event, { 'x-razorpay-signature': signature });
    assert.equal(res.status, 200);

    const { rows } = await superQuery('SELECT current_tier FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(rows[0].current_tier, 'diamond');

    const { rows: payRows } = await superQuery('SELECT status FROM payment_transactions WHERE id = $1', [paymentId]);
    assert.equal(payRows[0].status, 'completed');
  });

  await t.test('a duplicate delivery of the SAME event is deduped, not double-activated', async () => {
    const p = await makePandit();
    const plan = await planByTier('silver');
    const { paymentId } = await purchase(p, plan);
    const orderId = (await superQuery('SELECT gateway_order_id FROM payment_transactions WHERE id = $1', [paymentId])).rows[0].gateway_order_id;

    const event = { event: 'payment.captured', payload: { payment: { entity: { id: `pay_${uniq()}`, order_id: orderId } } } };
    const { signature } = signPayload(event);

    const first = await request(server, 'POST', '/api/payments/webhook', event, { 'x-razorpay-signature': signature });
    assert.equal(first.status, 200);
    assert.equal(first.body.deduped, undefined);

    const second = await request(server, 'POST', '/api/payments/webhook', event, { 'x-razorpay-signature': signature });
    assert.equal(second.status, 200);
    assert.equal(second.body.deduped, true, 'a replayed webhook must be recognised as a duplicate');

    const { rows } = await superQuery(
      'SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE pandit_id = $1 AND is_active = TRUE',
      [p.pandit.id],
    );
    assert.equal(rows[0].c, 1, 'the duplicate delivery must not create a second active subscription');
  });

  await t.test('payment.failed marks the payment failed without activating anything', async () => {
    const p = await makePandit();
    const plan = await planByTier('gold');
    const { paymentId } = await purchase(p, plan);
    const orderId = (await superQuery('SELECT gateway_order_id FROM payment_transactions WHERE id = $1', [paymentId])).rows[0].gateway_order_id;

    const event = {
      event: 'payment.failed',
      payload: { payment: { entity: { id: `pay_${uniq()}`, order_id: orderId, error_code: 'BAD_REQUEST_ERROR', error_description: 'card declined' } } },
    };
    const { signature } = signPayload(event);
    const res = await request(server, 'POST', '/api/payments/webhook', event, { 'x-razorpay-signature': signature });
    assert.equal(res.status, 200);

    const { rows } = await superQuery('SELECT status, failure_code FROM payment_transactions WHERE id = $1', [paymentId]);
    assert.equal(rows[0].status, 'failed');
    assert.equal(rows[0].failure_code, 'BAD_REQUEST_ERROR');

    const { rows: panditRows } = await superQuery('SELECT current_tier FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(panditRows[0].current_tier, 'free', 'a failed payment must never promote the tier');
  });
});

// ------------------------------------------------------------- /me/payments

test('GET /api/me/payments', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  async function loginPandit(p) {
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    return res.body.token;
  }

  await t.test('shows the pandit their own completed purchase, snapshotted plan name and all', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const plan = await planByTier('gold');
    const { subscriptionId, paymentId } = await purchase(p, plan);
    await activate({
      paymentId, subscriptionId, panditId: p.pandit.id, tier: 'gold',
      gatewayPaymentId: `pay_${uniq()}`, gatewaySignature: 'test',
    });

    const res = await request(server, 'GET', '/api/me/payments', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].plan_name_snapshot, plan.name);
    assert.equal(res.body.data[0].status, 'completed');
    assert.equal(res.body.meta.total, 1);
  });

  await t.test('Pandit A never sees Pandit B payments', async () => {
    const a = await makePandit();
    const b = await makePandit();
    const tokenA = await loginPandit(a);
    const plan = await planByTier('silver');
    await purchase(b, plan);

    const res = await request(server, 'GET', '/api/me/payments', null, auth(tokenA));
    assert.equal(res.body.meta.total, 0);
  });

  await t.test('requires authentication', async () => {
    assert.equal((await request(server, 'GET', '/api/me/payments')).status, 401);
  });
});
