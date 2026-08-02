const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const repo = require('../repositories/auth.repository');
const { hashToken } = require('../middleware/auth');
const { withUserContext } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { sessionTtlHours, nodeEnv } = require('../config/env');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

function sanitize(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user; // eslint-disable-line no-unused-vars
  return rest;
}

async function issueSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000);
  await repo.createSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    ip: req.ip,
    deviceInfo: { userAgent: req.headers['user-agent'] || null },
  });
  await withUserContext(user.id, (q) => repo.touchLogin(user.id, q));
  res.status(201).json({ token, expiresAt, user: sanitize(user) });
}

/** POST /api/auth/register — plain devotee/temple_admin accounts. Pandits
 *  register via POST /api/auth/register-pandit (needs a linked pandits row). */
async function register(req, res) {
  const { email, password, fullName, phone, role } = req.body || {};
  if (!email || !password || !fullName) return res.status(400).json({ error: 'email, password and fullName are required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email is not valid' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (role && !['devotee', 'temple_admin'].includes(role)) return res.status(400).json({ error: 'role must be devotee or temple_admin' });

  if (await repo.findByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await repo.create({ email, phone, passwordHash, fullName, role });
  await issueSession(res, user, req);
}

/** POST /api/auth/register-pandit — creates the users row AND the pandits
 *  profile row it must have, in one transaction. `slug` becomes the public
 *  profile URL (/api/pandits/:slug) so it must be unique and url-safe. */
async function registerPandit(req, res) {
  const { email, password, fullName, phone, slug } = req.body || {};
  if (!email || !password || !fullName || !slug) {
    return res.status(400).json({ error: 'email, password, fullName and slug are required' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email is not valid' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });

  if (await repo.findByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { user } = await repo.createPandit({ email, phone, passwordHash, fullName, slug });
    await issueSession(res, user, req);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That profile slug is already taken' });
    throw err;
  }
}

/** POST /api/auth/login */
async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = await repo.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    // Awaited deliberately, unlike the rate-limit handler in
    // middleware/security.js: a failed login is low-frequency and already
    // slow (bcrypt), so the audit trail being complete before responding is
    // worth more here than shaving a few ms off an already-401 response.
    await logSecurityEvent('LOGIN_FAILED', req, { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'suspended' || user.status === 'banned' || user.status === 'deactivated') {
    return res.status(403).json({ error: `Account is ${user.status}` });
  }
  await issueSession(res, user, req);
}

/** POST /api/auth/logout */
async function logout(req, res) {
  const [, token] = (req.headers.authorization || '').split(' ');
  if (token) await repo.revokeSession(hashToken(token));
  res.json({ ok: true });
}

/** GET /api/auth/me */
async function me(req, res) {
  const user = await withUserContext(req.user.id, (q) => repo.findById(req.user.id, q));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitize(user));
}

/** POST /api/auth/otp/request — no real SMS/email provider is wired up (see
 *  README "Known placeholders"); in non-production the OTP is returned in
 *  the response body so the flow is testable end-to-end without one. */
async function requestOtp(req, res) {
  const { target, targetType } = req.body || {};
  if (!target || !['phone', 'email'].includes(targetType)) {
    return res.status(400).json({ error: 'target and targetType ("phone" or "email") are required' });
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await repo.createOtp({ target, targetType, otpHash, expiresAt });

  console.log(`[auth] OTP for ${targetType}:${target} = ${otp} (dev-only log — no SMS/email provider configured)`);
  res.status(201).json({ ok: true, expiresAt, ...(nodeEnv !== 'production' ? { devOtp: otp } : {}) });
}

/** POST /api/auth/otp/verify */
async function verifyOtp(req, res) {
  const { target, targetType, otp } = req.body || {};
  if (!target || !targetType || !otp) return res.status(400).json({ error: 'target, targetType and otp are required' });

  const record = await repo.findLatestOtp(target, targetType);
  if (!record || record.verified) return res.status(400).json({ error: 'No pending OTP for this target' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP has expired' });
  if (record.attempts >= record.max_attempts) return res.status(429).json({ error: 'Too many attempts — request a new OTP' });

  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  if (otpHash !== record.otp_hash) {
    await repo.incrementOtpAttempts(record.id);
    return res.status(400).json({ error: 'Incorrect OTP' });
  }

  await repo.markOtpVerified(record.id);
  if (req.user) await withUserContext(req.user.id, (q) => repo.markTargetVerified(req.user.id, targetType, q));
  res.json({ ok: true, verified: true });
}

module.exports = { register, registerPandit, login, logout, me, requestOtp, verifyOtp };
