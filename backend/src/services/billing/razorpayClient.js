/**
 * Thin wrapper over Razorpay's REST API — no official SDK is installed
 * (see package.json), matching how the rest of this codebase prefers a
 * direct `fetch` over adding a dependency for a handful of calls. Shared
 * between the pandit-facing checkout (payments.controller.js) and the admin
 * refund flow (admin/subscriptions.controller.js) so both go through the
 * same auth header construction and error shape.
 */
const { razorpayKeyId, razorpayKeySecret } = require('../../config/env');

function authHeader() {
  return `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`;
}

function isConfigured() {
  return Boolean(razorpayKeyId && razorpayKeySecret);
}

async function createOrder({ amountPaise, receipt }) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
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

/**
 * POST /v1/payments/:id/refund — amountPaise omitted issues a full refund;
 * a partial amount issues that much. `speed: 'normal'` is Razorpay's default
 * (no extra fee); left explicit so a future change here is a deliberate one.
 */
async function refundPayment(gatewayPaymentId, { amountPaise, notes } = {}) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${gatewayPaymentId}/refund`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(amountPaise ? { amount: amountPaise } : {}),
      speed: 'normal',
      ...(notes ? { notes } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Razorpay refund failed: ${detail}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

module.exports = { isConfigured, createOrder, refundPayment };
