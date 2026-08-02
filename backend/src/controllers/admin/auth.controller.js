const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const repo = require('../../repositories/admin/auth.repository');
const { hashToken } = require('../../middleware/auth');
const { withUserContext } = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');
const { generateSecret, verifyTotp, otpAuthUrl } = require('../../utils/totp');
const { logSecurityEvent } = require('../../utils/securityLog');
const { logAdminAction } = require('../../utils/adminLog');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;      // 5 minutes to complete the TOTP step
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;   // 4 hour absolute session max (admin_architecture.md)

function sanitize(user) {
  if (!user) return null;
  const { password_hash, totp_secret_encrypted, ...rest } = user; // eslint-disable-line no-unused-vars
  return rest;
}

/** POST <secret>/auth/login — step 1: email + password. Always the same
 *  generic 401 whether the email doesn't exist, isn't an admin, or the
 *  password is wrong — none of that is anyone's business but ours. */
async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = await repo.findAdminByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await logSecurityEvent('LOGIN_FAILED', req, { email, admin: true });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: `Account is ${user.status}` });
  }

  const rawChallengeToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  let setup = null;
  let pendingTotpSecretEncrypted = null;
  if (!user.totp_enabled) {
    const secret = generateSecret();
    pendingTotpSecretEncrypted = encrypt(secret);
    setup = { secret, otpauthUrl: otpAuthUrl(secret, { label: user.email }) };
  }

  await repo.createChallenge({
    userId: user.id, tokenHash: hashToken(rawChallengeToken), pendingTotpSecretEncrypted, expiresAt,
  });

  res.json({
    challengeToken: rawChallengeToken,
    expiresAt,
    totpEnabled: user.totp_enabled,
    ...(setup ? { setup } : {}),
  });
}

/** POST <secret>/auth/login/verify — step 2: TOTP code. If this is the
 *  admin's first login, the challenge carries a not-yet-confirmed secret
 *  (see login() above) that only becomes permanent once a real code from it
 *  verifies — proving the admin actually captured it in an authenticator
 *  app, not just that the server generated one. */
async function verify(req, res) {
  const { challengeToken, totpCode } = req.body || {};
  if (!challengeToken || !totpCode) return res.status(400).json({ error: 'challengeToken and totpCode are required' });

  const challenge = await repo.findActiveChallenge(hashToken(challengeToken));
  if (!challenge) return res.status(401).json({ error: 'Challenge expired or invalid — start over' });

  const isFirstTimeSetup = !!challenge.pending_totp_secret_encrypted;
  const secret = decrypt(isFirstTimeSetup ? challenge.pending_totp_secret_encrypted : challenge.totp_secret_encrypted);

  if (!verifyTotp(secret, totpCode)) {
    await logSecurityEvent('ADMIN_TOTP_FAILED', req, { userId: challenge.user_id });
    return res.status(401).json({ error: 'Invalid authenticator code' });
  }

  await repo.consumeChallenge(challenge.challenge_id);
  if (isFirstTimeSetup) {
    await withUserContext(challenge.user_id, (q) => repo.enableTotp(challenge.user_id, challenge.pending_totp_secret_encrypted, q));
  }

  const rawSessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await repo.createSession({
    userId: challenge.user_id, tokenHash: hashToken(rawSessionToken), expiresAt,
    ip: req.ip, userAgent: req.headers['user-agent'] || null,
  });
  await withUserContext(challenge.user_id, (q) => repo.touchLogin(challenge.user_id, q));

  await logSecurityEvent('ADMIN_LOGIN_SUCCESS', req, { userId: challenge.user_id });
  await logAdminAction({
    adminUserId: challenge.user_id, action: isFirstTimeSetup ? 'ADMIN_TOTP_ENABLED_AND_LOGIN' : 'ADMIN_LOGIN',
    ip: req.ip,
  });

  res.json({
    token: rawSessionToken,
    expiresAt,
    user: sanitize({ id: challenge.user_id, email: challenge.email, full_name: challenge.full_name, role: challenge.role }),
  });
}

/** POST <secret>/auth/logout */
async function logout(req, res) {
  const [, token] = (req.headers.authorization || '').split(' ');
  if (token) await repo.revokeSession(hashToken(token));
  res.json({ ok: true });
}

/** GET <secret>/auth/me */
async function me(req, res) {
  res.json(req.adminUser);
}

module.exports = { login, verify, logout, me };
