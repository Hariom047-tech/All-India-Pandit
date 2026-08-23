process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatchReminders, targetDateString } = require('../src/services/billing/reminderScheduler');
const { withSetting, withUserContext } = require('../src/config/db');
const paymentsRepo = require('../src/repositories/payments.repository');
const { makePandit, uniq, superQuery } = require('./helpers');

/** Grants an active subscription expiring exactly `offsetDays` from now
 *  (IST calendar day), the same way activateSubscription would leave one —
 *  going through it directly so the reminder query's real WHERE clause
 *  (matching on subscription_reminder_log + expires_at date) is exercised
 *  end to end, not mocked. */
async function grantExpiringIn(p, offsetDays, tier = 'gold') {
  const plan = (await superQuery('SELECT * FROM subscription_plans WHERE tier = $1', [tier])).rows[0];
  const expiresAt = new Date(`${targetDateString(offsetDays)}T12:00:00+05:30`);
  const { subscriptionId, paymentId } = await withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
    panditId: p.pandit.id, plan, billingCycle: 'monthly', gatewayOrderId: `order_${uniq()}`,
    amount: plan.price_monthly, invoiceNumber: `INV-${uniq()}`, startsAt: new Date(), expiresAt,
  }, q));
  await withSetting('app.webhook_verified', 'true', (q) => paymentsRepo.activateSubscription({
    paymentId, subscriptionId, panditId: p.pandit.id, tier, gatewayPaymentId: `pay_${uniq()}`, gatewaySignature: 'test',
  }, q));
  return subscriptionId;
}

test('dispatchReminders', async (t) => {
  await t.test('a subscription expiring in exactly 5 days gets a reminder (5 is a default offset)', async () => {
    const p = await makePandit();
    await grantExpiringIn(p, 5);

    const sent = await dispatchReminders();
    assert.ok(sent >= 1);

    const { rows } = await superQuery(
      `SELECT title, body, type FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [p.user.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'subscription_expiring');
    assert.match(rows[0].title, /5 din/);
  });

  await t.test('running dispatch again does not send a duplicate for the same offset', async () => {
    const p = await makePandit();
    await grantExpiringIn(p, 3);

    await dispatchReminders();
    const firstCount = (await superQuery('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1', [p.user.id])).rows[0].c;

    await dispatchReminders();
    const secondCount = (await superQuery('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1', [p.user.id])).rows[0].c;

    assert.equal(firstCount, 1);
    assert.equal(secondCount, 1, 'a second dispatch tick must not re-send the same offset reminder');
  });

  await t.test('a subscription expiring in 6 days (not a default offset) gets no reminder yet', async () => {
    const p = await makePandit();
    await grantExpiringIn(p, 6);

    await dispatchReminders();
    const count = (await superQuery('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1', [p.user.id])).rows[0].c;
    assert.equal(count, 0);
  });

  await t.test('an expired-3-days-ago subscription gets the -3 post-expiry reminder', async () => {
    const p = await makePandit();
    await grantExpiringIn(p, -3);

    await dispatchReminders();
    const { rows } = await superQuery(
      `SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [p.user.id],
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].title, /expired/i);
  });

  await t.test('an inactive (never-paid) subscription never gets a reminder', async () => {
    const p = await makePandit();
    const plan = (await superQuery("SELECT * FROM subscription_plans WHERE tier = 'silver'")).rows[0];
    const expiresAt = new Date(`${targetDateString(1)}T12:00:00+05:30`);
    await withUserContext(p.user.id, (q) => paymentsRepo.createPendingSubscriptionAndPayment({
      panditId: p.pandit.id, plan, billingCycle: 'monthly', gatewayOrderId: `order_${uniq()}`,
      amount: plan.price_monthly, invoiceNumber: `INV-${uniq()}`, startsAt: new Date(), expiresAt,
    }, q)); // never activated — stays is_active = FALSE

    await dispatchReminders();
    const count = (await superQuery('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1', [p.user.id])).rows[0].c;
    assert.equal(count, 0);
  });
});
