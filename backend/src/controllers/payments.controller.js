const crypto = require('crypto');
const repo = require('../repositories/payments.repository');
const { query, withUserContext, withSetting } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { razorpayKeyId, razorpayKeySecret } = require('../config/env');

const VALID_CYCLES = ['monthly', 'quarterly', 'yearly'];

/** POST /api/pandits/:id/subscribe — requires the caller to own the pandit
 *  profile they're upgrading. No real Razorpay account is wired up yet (see
 *  README "Known placeholders") — this 501s until RAZORPAY_KEY_ID/SECRET are
 *  set to real test-mode keys; the DB side (subscription_plans,
 *  pandit_subscriptions, payment_transactions, the webhook handler below)
 *  works end-to-end once they are. */
async function subscribe(req, res) {
  const { tier, billingCycle } = req.body || {};
  if (!['silver', 'gold', 'diamond'].includes(tier)) return res.status(400).json({ error: 'tier must be silver, gold or diamond' });
  if (!VALID_CYCLES.includes(billingCycle)) return res.status(400).json({ error: `billingCycle must be one of: ${VALID_CYCLES.join(', ')}` });

  const pandit = await repo.findPanditBySlug(req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  if (pandit.user_id !== req.user.id) return res.status(403).json({ error: 'You can only subscribe your own pandit profile' });

  if (!razorpayKeyId || !razorpayKeySecret) {
    return res.status(501).json({ error: 'Payment gateway not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET (see README "Known placeholders")' });
  }

  const plan = await repo.findPlanByTier(tier);
  if (!plan) return res.status(404).json({ error: `No active plan for tier "${tier}"` });

  const priceField = { monthly: 'price_monthly', quarterly: 'price_quarterly', yearly: 'price_yearly' }[billingCycle];
  const amount = plan[priceField];
  if (!amount) return res.status(400).json({ error: `${tier} has no ${billingCycle} price` });

  const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const order = await createRazorpayOrder({ amountPaise: Math.round(amount * 100), receipt: invoiceNumber });

  const { paymentId } = await withUserContext(req.user.id, (q) => repo.createPendingSubscriptionAndPayment({
    panditId: pandit.id, plan, billingCycle, gatewayOrderId: order.id, amount, invoiceNumber,
  }, q));

  res.status(201).json({
    paymentId, orderId: order.id, amount, currency: 'INR', keyId: razorpayKeyId,
  });
}

async function createRazorpayOrder({ amountPaise, receipt }) {
  const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Razorpay order creation failed: ${detail}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

/** POST /api/payments/webhook — mounted with a raw-body parser (see app.js)
 *  because HMAC verification must run over the exact bytes Razorpay sent,
 *  not a re-serialized JSON.parse of them. */
async function webhook(req, res) {
  if (!razorpayKeySecret) return res.status(501).json({ error: 'Payment gateway not configured' });

  const signature = req.headers['x-razorpay-signature'] || '';
  const expected = crypto.createHmac('sha256', razorpayKeySecret).update(req.body).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    await logSecurityEvent('WEBHOOK_SIGNATURE_INVALID', req, {});
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(req.body.toString('utf8'));
  if (event.event !== 'payment.captured') return res.json({ ok: true, ignored: event.event });

  const payment = event.payload.payment.entity;
  // See payments_select_verified_webhook (01-schema.sql): only reachable
  // here, after the signature above has already proven this is Razorpay.
  const record = await withSetting('app.webhook_verified', 'true', (q) => repo.findPaymentByGatewayOrderId(payment.order_id, q));
  if (!record) return res.status(404).json({ error: 'No matching payment_transactions row for this order' });

  const { rows } = await query('SELECT tier FROM subscription_plans WHERE id = $1', [record.plan_id]);
  await repo.activateSubscription({
    paymentId: record.id, subscriptionId: record.subscription_id, panditId: record.pandit_id,
    tier: rows[0].tier, gatewayPaymentId: payment.id, gatewaySignature: signature,
  });
  res.json({ ok: true });
}

module.exports = { subscribe, webhook };
