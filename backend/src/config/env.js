require('dotenv').config();

// Throw at startup if a required secret is absent — better to crash loudly
// than silently fall back to a committed placeholder value.
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[config] Missing required environment variable: ${name}`);
  return v;
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Null = block all cross-origin (safe default). Must be set explicitly in prod.
  corsOrigin: process.env.CORS_ORIGIN || null,
  // 7 days default (was 720h = 30 days — too long for a stolen token to remain valid).
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS, 10) || 168,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  // Razorpay issues this SEPARATELY from the API key secret, on the
  // Dashboard's Webhooks screen, when you register the webhook URL — it is
  // not the same value as RAZORPAY_KEY_SECRET. Falls back to the key secret
  // only so a dev environment that hasn't configured a webhook yet doesn't
  // need a second placeholder to get past the "gateway not configured" 501;
  // a real deployment should set this to the actual webhook secret.
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
  // Absolute origin used to build <loc> URLs in the sitemap (see
  // routes/sitemap.routes.js) — mirrors frontend/app/src/lib/siteConfig.ts's
  // same fallback, so both halves of the app agree on the canonical domain
  // even if this var is never set.
  publicSiteUrl: (process.env.PUBLIC_SITE_URL || 'https://panditsuggest.com').replace(/\/$/, ''),
  // Obscurity only, never the actual defense — see docs/ADMIN.md.
  // REQUIRED: no fallback — startup fails if not set, preventing silent exposure.
  adminSecretPath: process.env.NODE_ENV === 'test'
    ? (process.env.ADMIN_SECRET_PATH || 'test-admin-path')
    : required('ADMIN_SECRET_PATH'),
  // AES-256-GCM key for utils/crypto.js (admin TOTP secrets at rest).
  // REQUIRED: no fallback — startup fails if not set.
  encryptionKey: process.env.NODE_ENV === 'test'
    ? (process.env.ENCRYPTION_KEY || '0'.repeat(64))
    : required('ENCRYPTION_KEY'),
  // WhatsApp OTP delivery (services/notifications/hyperSender.js). Both unset
  // (the default) means requestOtp() falls back to the dev-only console
  // log/devOtp field exactly as before this existed — see README "Known
  // placeholders". Never required: an OTP is still generated and stored
  // locally either way, this only controls whether it's also sent.
  hyperSenderInstanceId: process.env.HYPERSENDER_INSTANCE_ID || '',
  hyperSenderApiKey: process.env.HYPERSENDER_API_KEY || '',
};
