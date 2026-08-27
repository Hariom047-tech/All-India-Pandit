/**
 * Thin wrapper over Hypersender's WhatsApp REST API — same pattern as
 * services/billing/razorpayClient.js (direct `fetch`, no SDK dependency).
 *
 * Used only as a delivery channel: the app's own OTP generation, hashing,
 * expiry and attempt-limiting (auth.controller.js / repositories/auth.repository.js)
 * stays exactly as it was. This never becomes the source of truth for whether
 * a code is correct — it only puts the already-generated code in front of the
 * user over WhatsApp instead of (in dev) a console log.
 *
 * API reference: https://docs.hypersender.com/v2/api-reference/whatsapp/send-messages/send-text
 */
const { hyperSenderInstanceId, hyperSenderApiKey } = require('../../config/env');

function isConfigured() {
  return Boolean(hyperSenderInstanceId && hyperSenderApiKey);
}

/**
 * WhatsApp identifies chats by a JID, not a bare phone number — Hypersender
 * expects "<countrycode><number>@c.us" with no "+", spaces or leading zero.
 * Mirrors the +91 default used elsewhere for a bare 10-digit Indian mobile
 * number (see admin/pandits.controller.js's normalizePhone) since that is
 * this app's only real market today.
 */
function toChatId(phone) {
  let digits = String(phone || '').replace(/[^\d]/g, '');
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (!digits) return null;
  return `${digits}@c.us`;
}

/**
 * Sends a plain WhatsApp text. Returns { ok: true } on success and
 * { ok: false, error } on failure — never throws, so a Hypersender outage
 * can't take down OTP request/registration; the caller decides what to do
 * with a delivery failure (the OTP record already exists either way).
 */
async function sendWhatsAppText(phone, text) {
  const chatId = toChatId(phone);
  if (!chatId) return { ok: false, error: 'invalid phone number' };

  try {
    const res = await fetch(`https://app.hypersender.com/api/whatsapp/v2/${hyperSenderInstanceId}/send-text`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hyperSenderApiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chatId, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `Hypersender ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** OTP-specific convenience wrapper — keeps the message copy in one place. */
function sendWhatsAppOtp(phone, otp, expiresMinutes) {
  return sendWhatsAppText(
    phone,
    `Your PanditSuggest verification code is *${otp}*. It expires in ${expiresMinutes} minutes. Do not share this code with anyone.`,
  );
}

module.exports = { isConfigured, sendWhatsAppText, sendWhatsAppOtp };
