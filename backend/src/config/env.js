require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS, 10) || 720,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  // Obscurity only, never the actual defense — see docs/ADMIN.md. Real
  // access control is requireAdmin/requireSuperAdmin + TOTP + RLS.
  adminSecretPath: process.env.ADMIN_SECRET_PATH || 'ambitious-person',
  // Dev-only placeholder (same posture as DATABASE_URL's default above and
  // POSTGRES_PASSWORD in docker-compose.yml) so `npm test`/`npm run dev`
  // work with zero setup — see backend/.env.example for how to generate a
  // real one. AES-256-GCM key for utils/crypto.js (admin TOTP secrets at rest).
  encryptionKey: process.env.ENCRYPTION_KEY || '1001480ac2400463a4eadd40a3f49b4f68534e13470a319e0f2a071f0327405a',
};
