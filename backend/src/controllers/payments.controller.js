const crypto = require('crypto');
const repo = require('../repositories/payments.repository');
const { withUserContext, withSetting } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret } = require('../config/env');
const { resolveNewPeriod } = require('../services/billing/subscriptionPeriod');
const { VALID_CYCLES } = require('../utils/billingPeriod');
const razorpay = require('../services/billing/razorpayClient');
const { getTaxSettings, computeTax } = require('../services/billing/tax');

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

  // Checked BEFORE any Razorpay order is created — a devotee/pandit must
  // never be charged for a plan that's already sold out. A renewal of the
  // SAME tier the pandit already holds doesn't need a free seat (they're not
  // taking a NEW one), so it's exempt from this check.
  if (pandit.current_tier !== tier) {
    const seats = await repo.seatAvailability(tier);
    if (seats.seat_cap !== null && seats.available <= 0) {
      return res.status(409).json({ error: `${tier} plan is currently full. Please try a different plan or check back later.` });
    }
  }

  const priceField = { monthly: 'price_monthly', quarterly: 'price_quarterly', yearly: 'price_yearly' }[billingCycle];
  const basePrice = plan[priceField];
  if (!basePrice) return res.status(400).json({ error: `${tier} has no ${billingCycle} price` });

  // GST/tax is OFF by default (see services/billing/tax.js) — an admin who
  // hasn't configured a real rate never has one invented for them. When
  // enabled, this is what actually gets charged via Razorpay, not just a
  // display-only number.
  const taxSetting = await getTaxSettings();
  const { payableAmount: amount, gstAmount } = computeTax(basePrice, taxSetting);

  // Same-plan renewal preserves unused time (starts from the current expiry,
  // not now); a plan CHANGE starts immediately, at full price, forfeiting
  // whatever time remained — the disclosed Phase-1 upgrade policy. See
  // services/billing/subscriptionPeriod.js.
  const { startsAt, expiresAt, isRenewal } = resolveNewPeriod({
    currentTier: pandit.current_tier,
    currentExpiresAt: pandit.subscription_expires_at,
    targetTier: tier,
    billingCycle,
  });

  const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const order = await razorpay.createOrder({ amountPaise: Math.round(amount * 100), receipt: invoiceNumber });

  const { paymentId } = await withUserContext(req.user.id, (q) => repo.createPendingSubscriptionAndPayment({
    panditId: pandit.id, plan, billingCycle, gatewayOrderId: order.id, amount, gstAmount, invoiceNumber, startsAt, expiresAt,
  }, q));

  res.status(201).json({
    paymentId, orderId: order.id, amount, gstAmount, currency: 'INR', keyId: razorpayKeyId,
    isRenewal, expiresAt: expiresAt.toISOString(),
  });
}

/**
 * POST /api/payments/webhook — mounted with a raw-body parser (see app.js)
 * because HMAC verification must run over the exact bytes Razorpay sent,
 * not a re-serialized JSON.parse of them.
 *
 * Idempotent by design: every event is first recorded in webhook_events
 * keyed by a deterministic (event_type, Razorpay entity id) dedupe key —
 * Razorpay retries deliveries and can send the same event more than once,
 * and this must never activate/fail a subscription twice.
 */
async function webhook(req, res) {
  if (!razorpayWebhookSecret) return res.status(501).json({ error: 'Payment gateway not configured' });

  const signature = req.headers['x-razorpay-signature'] || '';
  const expected = crypto.createHmac('sha256', razorpayWebhookSecret).update(req.body).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    await logSecurityEvent('WEBHOOK_SIGNATURE_INVALID', req, {});
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(req.body.toString('utf8'));
  const HANDLED = new Set(['payment.captured', 'payment.failed', 'refund.processed']);
  if (!HANDLED.has(event.event)) return res.json({ ok: true, ignored: event.event });

  // refund.processed fires for a refund issued directly on Razorpay's
  // dashboard/API, outside this app's own admin refund flow (which already
  // records gateway_refund_id synchronously from its own API response) — a
  // defensive reconciliation path, not the primary one.
  if (event.event === 'refund.processed') {
    const refundEntity = event.payload.refund.entity;
    const dedupeKey = `refund.processed:${refundEntity.id}`;
    const webhookEvent = await repo.recordWebhookEvent({ eventType: event.event, dedupeKey, payload: event });
    if (webhookEvent.alreadyProcessed) return res.json({ ok: true, deduped: true });
    try {
      await withSetting('app.webhook_verified', 'true', (q) => repo.reconcileRefundFromWebhook({
        gatewayPaymentId: refundEntity.payment_id,
        gatewayRefundId: refundEntity.id,
        amount: refundEntity.amount / 100,
      }, q));
      await repo.markWebhookEventStatus(webhookEvent.id, 'processed');
      return res.json({ ok: true });
    } catch (err) {
      await repo.markWebhookEventStatus(webhookEvent.id, 'failed', err.message).catch(() => {});
      throw err;
    }
  }

  const payment = event.payload.payment.entity;
  // Deterministic, not reliant on an optional delivery-id header — the same
  // (event type, Razorpay payment id) pair can only mean "the same delivery,
  // possibly resent".
  const dedupeKey = `${event.event}:${payment.id}`;
  const webhookEvent = await repo.recordWebhookEvent({ eventType: event.event, dedupeKey, payload: event });
  if (webhookEvent.alreadyProcessed) {
    return res.json({ ok: true, deduped: true });
  }

  try {
    // Everything payment_transactions-related — the lookup AND the
    // activation/failure UPDATE — runs on ONE client inside ONE transaction
    // under app.webhook_verified. That table's RLS governs UPDATE the same
    // way it governs SELECT (see payments.repository.js's activateSubscription
    // doc comment) — splitting the lookup and the mutation across different
    // connections/contexts is exactly the bug that used to leave a captured
    // payment stuck at status='pending' forever despite the subscription
    // itself activating correctly.
    const found = await withSetting('app.webhook_verified', 'true', async (q) => {
      const record = await repo.findPaymentByGatewayOrderId(payment.order_id, q);
      if (!record) return null;

      if (event.event === 'payment.captured') {
        const { rows } = await q('SELECT tier FROM subscription_plans WHERE id = $1', [record.plan_id]);
        await repo.activateSubscription({
          paymentId: record.id, subscriptionId: record.subscription_id, panditId: record.pandit_id,
          tier: rows[0].tier, gatewayPaymentId: payment.id, gatewaySignature: signature,
        }, q);
      } else {
        // payment.failed — the pending subscription row is simply never
        // activated; only the payment row records why, for the pandit/admin.
        await repo.markPaymentFailed({
          paymentId: record.id,
          failureCode: payment.error_code || null,
          failureDescription: payment.error_description || null,
        }, q);
      }
      return record;
    });

    if (!found) {
      await repo.markWebhookEventStatus(webhookEvent.id, 'failed', 'No matching payment_transactions row for this order');
      return res.status(404).json({ error: 'No matching payment_transactions row for this order' });
    }

    await repo.markWebhookEventStatus(webhookEvent.id, 'processed');
    res.json({ ok: true });
  } catch (err) {
    await repo.markWebhookEventStatus(webhookEvent.id, 'failed', err.message).catch(() => {});
    throw err;
  }
}

module.exports = { subscribe, webhook };
