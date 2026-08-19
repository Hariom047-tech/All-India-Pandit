const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authRepo = require('../repositories/auth.repository');
const resetRepo = require('../repositories/passwordReset.repository');
const { hashToken } = require('../middleware/auth');
const { withUserContext } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { sessionTtlHours } = require('../config/env');

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MINUTES = 10;
const MIN_PASSWORD_LENGTH = 8;

/**
 * One generic failure string for every login rejection and one for every
 * reset rejection. The frontend shows these verbatim.
 *
 * Anything more specific ("no such account", "wrong date of birth", "that's
 * a devotee account") hands an attacker a free oracle: which emails exist,
 * which are pandits, and — worst for a low-entropy secret like a birth date
 * — whether a guessed DOB was the right one.
 */
const GENERIC_LOGIN_ERROR = 'Login nahi ho paya. Apni details check karein.';
const GENERIC_RESET_ERROR = 'Details verify nahi ho paayi.';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict YYYY-MM-DD, and a real calendar date — "2001-02-30" must not pass. */
function parseDob(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() > Date.now()) return null;
  return value;
}

function passwordProblem(password, confirm) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password kam se kam ${MIN_PASSWORD_LENGTH} characters ka hona chahiye.`;
  }
  if (password.length > 200) return 'Password bahut lamba hai.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password mein kam se kam ek letter aur ek number hona chahiye.';
  }
  if (confirm !== undefined && password !== confirm) {
    return 'Dono passwords match nahi kar rahe.';
  }
  return null;
}

async function issueSession(user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionTtlHours * 3600 * 1000);
  await authRepo.createSession({
    userId: user.id, tokenHash: hashToken(token), expiresAt,
    deviceInfo: { userAgent: req.headers['user-agent'] || null }, ip: req.ip,
  });
  await withUserContext(user.id, (q) => authRepo.touchLogin(user.id, q));
  return { token, expiresAt };
}

/**
 * POST /api/auth/pandit/login
 *
 * Same credential store and same session table as devotee login — this is a
 * role-scoped door into one auth system, not a second auth system. The extra
 * checks are: the account must be a pandit, must be active, and must
 * actually own a pandit profile.
 */
async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: GENERIC_LOGIN_ERROR });

  const user = await authRepo.findByEmail(String(email).trim().toLowerCase());

  // Compare against a dummy hash when the account is missing so that a
  // non-existent email costs the same ~100ms of bcrypt as a real one.
  // Without this, response time alone enumerates valid accounts.
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const passwordOk = await bcrypt.compare(String(password), hash);

  if (!user || !passwordOk) {
    await logSecurityEvent('LOGIN_FAILED', req, { scope: 'pandit', email });
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }
  if (user.status === 'suspended' || user.status === 'banned' || user.status === 'deactivated') {
    await logSecurityEvent('LOGIN_BLOCKED_INACTIVE', req, { userId: user.id, status: user.status });
    return res.status(403).json({ error: 'Yeh account abhi active nahi hai. Support se sampark karein.' });
  }

  // A devotee reaching the pandit door gets a distinct, friendly message.
  // Safe to distinguish here: they have ALREADY proven the password, so this
  // reveals nothing they didn't just demonstrate they know.
  if (user.role !== 'pandit') {
    await logSecurityEvent('PANDIT_LOGIN_WRONG_ROLE', req, { userId: user.id, role: user.role });
    return res.status(403).json({
      error: 'Yeh login sirf registered Pandit Ji accounts ke liye hai.',
      code: 'not_a_pandit',
    });
  }

  const profile = await withUserContext(user.id, async (q) => {
    const { rows } = await q(
      'SELECT id, slug FROM pandits WHERE user_id = $1 AND deleted_at IS NULL',
      [user.id],
    );
    return rows[0] || null;
  });
  if (!profile) {
    await logSecurityEvent('PANDIT_LOGIN_NO_PROFILE', req, { userId: user.id });
    return res.status(403).json({
      error: 'Is account se koi Pandit profile linked nahi hai. Support se sampark karein.',
      code: 'no_pandit_profile',
    });
  }

  const { token, expiresAt } = await issueSession(user, req);
  res.json({
    token,
    expiresAt,
    user: {
      id: user.id, email: user.email, fullName: user.full_name, role: user.role,
      phoneVerified: user.phone_verified, status: user.status,
    },
    pandit: { slug: profile.slug },
  });
}

/**
 * POST /api/auth/pandit/reset-password/verify — step 1 of 2.
 *
 * email + DOB together identify the account; neither alone is sufficient and
 * neither is confirmed independently. DOB is a weak secret, which is why
 * this endpoint is aggressively rate-limited (see the route), always returns
 * the same body shape on failure, and issues only a short-lived single-use
 * token rather than resetting anything directly.
 *
 * FUTURE OTP HOOK: the response carries `nextStep`. Adding SMS/email OTP
 * later means issuing a challenge with method='email_dob_otp', returning
 * nextStep:'otp' here, and inserting one verify call before step 2 — no
 * change to the step-2 contract and no change to the frontend's token
 * handling.
 */
async function verifyResetIdentity(req, res) {
  const { email, dateOfBirth } = req.body || {};
  const dob = parseDob(dateOfBirth);

  if (!email || !dob) {
    await logSecurityEvent('PANDIT_RESET_VERIFY_FAILED', req, { reason: 'malformed' });
    return res.status(400).json({ success: false, error: GENERIC_RESET_ERROR });
  }

  const userId = await resetRepo.findPanditForReset(String(email).trim().toLowerCase(), dob);
  if (!userId) {
    // Identical status, identical body, whether the email was unknown or the
    // DOB was wrong. Logged for the security team, invisible to the caller.
    await logSecurityEvent('PANDIT_RESET_VERIFY_FAILED', req, { reason: 'no_match', email });
    return res.status(400).json({ success: false, error: GENERIC_RESET_ERROR });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  await resetRepo.createChallenge({
    userId, tokenHash: hashToken(resetToken), ttlMinutes: RESET_TTL_MINUTES, ip: req.ip,
  });

  await logSecurityEvent('PANDIT_RESET_CHALLENGE_ISSUED', req, { userId });
  res.json({
    success: true,
    resetToken,
    expiresInMinutes: RESET_TTL_MINUTES,
    nextStep: 'set_password',
  });
}

/**
 * POST /api/auth/pandit/reset-password — step 2 of 2.
 *
 * Takes the challenge token, never email+DOB again: re-accepting the weak
 * secret at the moment of the actual state change would make step 1
 * decorative. Consumption, password rotation and session revocation all
 * happen in one SECURITY DEFINER transaction.
 */
async function resetPassword(req, res) {
  const { resetToken, newPassword, confirmPassword } = req.body || {};
  if (!resetToken || typeof resetToken !== 'string') {
    return res.status(400).json({ success: false, error: GENERIC_RESET_ERROR });
  }

  const problem = passwordProblem(newPassword, confirmPassword);
  if (problem) return res.status(400).json({ success: false, error: problem });

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  const result = await resetRepo.consumeChallenge(hashToken(resetToken), passwordHash);

  if (!result?.ok) {
    await logSecurityEvent('PANDIT_RESET_FAILED', req, { reason: result?.reason || 'invalid' });
    return res.status(400).json({ success: false, error: 'Reset link expire ho gaya hai. Dobara try karein.' });
  }

  // Every session is revoked by auth_consume_reset_challenge(), including
  // any an attacker may already hold. The pandit must log in again.
  await logSecurityEvent('PANDIT_RESET_COMPLETED', req, { userId: result.user_id });
  res.json({ success: true, message: 'Password badal gaya hai. Ab naye password se login karein.' });
}

module.exports = { login, verifyResetIdentity, resetPassword, passwordProblem, parseDob };
