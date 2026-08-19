const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const repo = require('../repositories/auth.repository');
const { hashToken } = require('../middleware/auth');
const { withUserContext } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { sessionTtlHours, nodeEnv } = require('../config/env');
const { logActivityEvent, deviceTypeFromUserAgent } = require('../utils/activityLog');
const { browsingMarketFor } = require('../services/distribution/market');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

/**
 * Allow-list, not a deny-list.
 *
 * This used to strip a couple of known-sensitive columns and return the rest,
 * which meant every future column on `users` was published by default — and
 * `date_of_birth` (the second factor in pandit password reset) was exactly
 * such a column. Enumerating what MAY leave the server fails closed instead.
 */
const PUBLIC_USER_FIELDS = [
  'id', 'email', 'phone', 'full_name', 'display_name', 'avatar_url',
  'role', 'status', 'city', 'state', 'pincode',
  'preferred_language', 'theme_preference',
  'email_verified', 'phone_verified', 'last_login_at', 'created_at',
];

function sanitize(user) {
  if (!user) return null;
  const out = {};
  for (const key of PUBLIC_USER_FIELDS) {
    if (key in user) out[key] = user[key];
  }
  return out;
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

  const browsing = browsingMarketFor(req);
  void logActivityEvent({
    userId: user.id,
    eventType: 'LOGIN',
    country: browsing.countryCode,
    market: browsing.market === 'UNKNOWN' ? null : browsing.market,
    locationSource: browsing.source,
    deviceType: deviceTypeFromUserAgent(req.headers['user-agent']),
  });

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
  if (req.user?.id) void logActivityEvent({ userId: req.user.id, eventType: 'LOGOUT' });
  res.json({ ok: true });
}

/** GET /api/auth/me */
async function me(req, res) {
  const user = await withUserContext(req.user.id, (q) => repo.findById(req.user.id, q));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitize(user));
}

/** PATCH /api/auth/me — allow-listed profile update (name, phone only).
 *  The client never touches role, status, or any verified flag. */
async function updateMe(req, res) {
  const { full_name, phone } = req.body || {};
  const updates = {};
  if (full_name !== undefined) updates.full_name = String(full_name).trim().slice(0, 120);
  if (phone !== undefined) updates.phone = phone ? String(phone).trim().slice(0, 20) : null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  await withUserContext(req.user.id, (q) => q(
    `UPDATE users SET ${ Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ') } WHERE id = $1`,
    [req.user.id, ...Object.values(updates)],
  ));
  const updated = await withUserContext(req.user.id, (q) => repo.findById(req.user.id, q));
  res.json(sanitize(updated));
}

/** Set only for local/test environments (docker-compose.override.yml) —
 *  never in docker-compose.yml's production `backend` service, and never on
 *  any real deployment. When set, this exact code is accepted as correct for
 *  ANY pending OTP, in addition to the real generated one. This is a
 *  deliberately blunt bypass (not gated on NODE_ENV, unlike
 *  ALLOW_DEV_GEO_HEADER) because this codebase's own local Docker rig runs
 *  with NODE_ENV=production, which would otherwise make it impossible to
 *  turn on — see docs/PROJECT_STATUS.md. The env var itself being unset is
 *  the only gate, so it must never be set anywhere real accounts are created. */
function otpMatches(candidate, record) {
  const bypass = process.env.OTP_TEST_BYPASS_CODE;
  if (bypass && candidate === bypass) return true;
  const candidateHash = crypto.createHash('sha256').update(candidate).digest('hex');
  return candidateHash === record.otp_hash;
}

/** POST /api/auth/otp/request — no real SMS/email provider is wired up (see
 *  README "Known placeholders"); in non-production the OTP is returned in
 *  the response body so the flow is testable end-to-end without one. 4
 *  digits to match the OTP entry UI (Login.tsx's 4-box input). */
async function requestOtp(req, res) {
  const { target, targetType } = req.body || {};
  if (!target || !['phone', 'email'].includes(targetType)) {
    return res.status(400).json({ error: 'target and targetType ("phone" or "email") are required' });
  }
  const otp = String(crypto.randomInt(1000, 10000));
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await repo.createOtp({ target, targetType, otpHash, expiresAt });

  // Dev-only: log OTP to console so local testing works without SMS/email.
  // NEVER include in staging — use nodeEnv === 'development', NOT !== 'production'.
  if (nodeEnv === 'development') {
    console.log(`[auth] OTP for ${targetType}:${target} = ${otp} (dev-only log)`);
  }
  res.status(201).json({ ok: true, expiresAt, ...(nodeEnv === 'development' ? { devOtp: otp } : {}) });
}

/** POST /api/auth/otp/verify — marks an already-known target verified. If
 *  the caller is logged in (req.user set), also flags their own
 *  email_verified/phone_verified. Does NOT create a session — for a
 *  passwordless phone login/signup that issues one, see phoneLogin below. */
async function verifyOtp(req, res) {
  const { target, targetType, otp } = req.body || {};
  if (!target || !targetType || !otp) return res.status(400).json({ error: 'target, targetType and otp are required' });

  const record = await repo.findLatestOtp(target, targetType);
  if (!record || record.verified) return res.status(400).json({ error: 'No pending OTP for this target' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP has expired' });
  if (record.attempts >= record.max_attempts) return res.status(429).json({ error: 'Too many attempts — request a new OTP' });

  if (!otpMatches(otp, record)) {
    await repo.incrementOtpAttempts(record.id);
    return res.status(400).json({ error: 'Incorrect OTP' });
  }

  await repo.markOtpVerified(record.id);
  if (req.user) await withUserContext(req.user.id, (q) => repo.markTargetVerified(req.user.id, targetType, q));
  res.json({ ok: true, verified: true });
}

/** POST /api/auth/otp/login — passwordless phone login/signup: verifies the
 *  OTP for `phone`, then finds-or-creates a devotee account for that number
 *  and issues a real session. `users.email` is NOT NULL + UNIQUE, so a
 *  brand-new phone-only account gets a synthetic placeholder email derived
 *  from the (already-UNIQUE) phone number — never shown to the user, never
 *  used to log in. */
async function phoneLogin(req, res) {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp are required' });

  const record = await repo.findLatestOtp(phone, 'phone');
  if (!record || record.verified) return res.status(400).json({ error: 'No pending OTP for this number — request a new one' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP has expired' });
  if (record.attempts >= record.max_attempts) return res.status(429).json({ error: 'Too many attempts — request a new OTP' });

  if (!otpMatches(otp, record)) {
    await repo.incrementOtpAttempts(record.id);
    return res.status(400).json({ error: 'Incorrect OTP' });
  }
  await repo.markOtpVerified(record.id);

  let user = await repo.findByPhone(phone);
  if (user) {
    if (!user.phone_verified) {
      await withUserContext(user.id, (q) => repo.markTargetVerified(user.id, 'phone', q));
      user.phone_verified = true;
    }
  } else {
    const placeholderEmail = `phone-${phone.replace(/[^a-zA-Z0-9]/g, '')}@otp.panditsuggest.local`;
    try {
      user = await repo.create({ email: placeholderEmail, phone, fullName: 'Devotee', role: 'devotee' });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'An account with this number already exists — please try again' });
      throw err;
    }
    await withUserContext(user.id, (q) => repo.markTargetVerified(user.id, 'phone', q));
    user.phone_verified = true;
  }

  if (user.status === 'suspended' || user.status === 'banned' || user.status === 'deactivated') {
    return res.status(403).json({ error: `Account is ${user.status}` });
  }
  await issueSession(res, user, req);
}

/** POST /api/auth/google */
async function googleAuth(req, res) {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Google credential is required' });

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }

    const { sub: googleId, email, name: fullName } = payload;
    let user = await repo.findByEmail(email);

    if (user) {
      // If user exists but doesn't have google_id linked, link it.
      if (!user.google_id) {
        await withUserContext(user.id, (q) => repo.linkGoogleId(user.id, googleId, q));
        user.google_id = googleId;
      }
      // Always ensure email_verified=true for Google users (Google verifies emails).
      // Covers existing accounts created before this fix.
      if (!user.email_verified) {
        await withUserContext(user.id, (q) => q(
          'UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]
        ));
        user.email_verified = true;
      }
    } else {
      // User doesn't exist, create a new one (no password).
      user = await repo.create({ email, fullName, role: 'devotee', googleId });
    }

    if (user.status === 'suspended' || user.status === 'banned' || user.status === 'deactivated') {
      return res.status(403).json({ error: `Account is ${user.status}` });
    }

    await issueSession(res, user, req);
  } catch (error) {
    console.error('Google Auth Error:', error);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
}

module.exports = { register, registerPandit, login, logout, me, updateMe, requestOtp, verifyOtp, phoneLogin, googleAuth };
