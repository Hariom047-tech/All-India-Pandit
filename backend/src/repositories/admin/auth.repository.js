const { query, withSetting, withUserContext } = require('../../config/db');

/** Reuses auth_find_user_by_email (01-schema.sql) — the same SECURITY
 *  DEFINER lookup the regular login flow uses, since the same
 *  chicken-and-egg problem applies (checking a password means reading
 *  `users` before any identity/context exists). Role is checked in JS. */
async function findAdminByEmail(email) {
  const { rows } = await query('SELECT * FROM auth_find_user_by_email($1)', [email]);
  const user = rows[0];
  if (!user || !['admin', 'super_admin'].includes(user.role)) return null;
  return user;
}

async function createChallenge({ userId, tokenHash, pendingTotpSecretEncrypted, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO admin_mfa_challenges (user_id, challenge_token_hash, pending_totp_secret_encrypted, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, tokenHash, pendingTotpSecretEncrypted || null, expiresAt],
  );
  return rows[0].id;
}

async function findActiveChallenge(tokenHash) {
  const { rows } = await query('SELECT * FROM admin_find_challenge_with_user($1)', [tokenHash]);
  return rows[0] || null;
}

async function consumeChallenge(id) {
  await query('UPDATE admin_mfa_challenges SET consumed_at = NOW() WHERE id = $1', [id]);
}

/** Persists a freshly-confirmed TOTP secret (first-time setup only) — needs
 *  RLS context (users_update_self), since it's the admin updating their own
 *  row. Call via withUserContext(userId, ...). */
async function enableTotp(userId, encryptedSecret, q = query) {
  await q('UPDATE users SET totp_secret_encrypted = $1, totp_enabled = TRUE WHERE id = $2', [encryptedSecret, userId]);
}

async function createSession({ userId, tokenHash, expiresAt, ip, userAgent }) {
  const { rows } = await query(
    `INSERT INTO admin_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, tokenHash, expiresAt, ip || null, userAgent || null],
  );
  return rows[0].id;
}

/** Same chicken-and-egg as the regular session lookup (see
 *  users_select_by_admin_bearer_session, 01-schema.sql), gated by a
 *  separate setting name so it can never be confused with a regular user
 *  session's token hash. */
async function findActiveSessionByTokenHash(tokenHash) {
  return withSetting('app.admin_session_token_hash', tokenHash, async (q) => {
    const { rows } = await q(
      `SELECT s.id AS session_id, s.ip_address AS session_ip, u.id AS user_id, u.email, u.role, u.full_name, u.status
       FROM admin_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.deleted_at IS NULL`,
      [tokenHash],
    );
    return rows[0] || null;
  });
}

async function touchSession(sessionId) {
  await query('UPDATE admin_sessions SET last_activity_at = NOW() WHERE id = $1', [sessionId]);
}

async function revokeSession(tokenHash) {
  await query('UPDATE admin_sessions SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
}

async function revokeAllSessions(userId) {
  await query('UPDATE admin_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// Joins `users` for display names — needs RLS context (users_select_admin),
// same as listAdmins. Call via withUserContext/req.db.
async function listActiveSessions(q = query) {
  const { rows } = await q(
    `SELECT s.id, u.full_name, u.email, s.ip_address, s.user_agent, s.last_activity_at, s.expires_at, s.created_at
     FROM admin_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > NOW() ORDER BY s.last_activity_at DESC`,
  );
  return rows;
}

async function touchLogin(userId, q = query) {
  await q('UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1', [userId]);
}

// Needs RLS context (users_select_admin) — call via withUserContext(callerAdminId, ...).
async function listAdmins(q = query) {
  const { rows } = await q(
    `SELECT id, email, full_name, role, status, totp_enabled, last_login_at, created_at
     FROM users WHERE role IN ('admin', 'super_admin') AND deleted_at IS NULL ORDER BY created_at`,
  );
  return rows;
}

// RETURNING needs a SELECT policy match on the new (role='admin') row —
// users_select_admin covers it, but only once RLS context is set to an
// existing admin. Call via withUserContext(callerAdminId, (q) => ...).
async function createAdmin({ email, passwordHash, fullName, role }, q = query) {
  const { rows } = await q(
    `INSERT INTO users (email, password_hash, full_name, role, status)
     VALUES ($1, $2, $3, $4, 'active') RETURNING id, email, full_name, role`,
    [email, passwordHash, fullName, role],
  );
  return rows[0];
}

module.exports = {
  findAdminByEmail, createChallenge, findActiveChallenge, consumeChallenge, enableTotp,
  createSession, findActiveSessionByTokenHash, touchSession, revokeSession, revokeAllSessions,
  listActiveSessions, touchLogin, listAdmins, createAdmin, withUserContext,
};
