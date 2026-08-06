const crypto = require('crypto');
const { query, withSetting, withUserContext } = require('../config/db');

/** Login and registration both need to find a user by email before any
 *  session/identity exists to satisfy the `users` RLS policies with — so
 *  this goes through auth_find_user_by_email(), a SECURITY DEFINER function
 *  (01-schema.sql) that runs as the schema owner and bypasses RLS, scoped to
 *  exactly this one lookup shape. */
async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM auth_find_user_by_email($1)', [email]);
  return rows[0] || null;
}

/** Reads a user's own row. Requires RLS context — call via
 *  withUserContext(userId, (q) => repo.findById(userId, q)). */
async function findById(id, q = query) {
  const { rows } = await q('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  return rows[0] || null;
}

// A plain INSERT ... RETURNING * needs the new row to pass a SELECT policy,
// not just the INSERT one — Postgres checks RETURNING output against SELECT
// policies too. A fresh 'devotee' row matches neither users_select_public
// (pandit/temple_admin only) nor users_select_via_public_content (nothing
// published yet), so without this, RETURNING itself throws "new row
// violates row-level security policy" even though the INSERT's own WITH
// CHECK (true) passed. Pre-generating the id and setting it as
// app.current_user_id before the INSERT makes it visible to itself via
// users_select_self, since a user can always read their own row.
async function create({ email, phone, passwordHash, fullName, role, googleId }) {
  const id = crypto.randomUUID();
  const { rows } = await withUserContext(id, (q) => q(
    `INSERT INTO users (id, email, phone, password_hash, full_name, role, status, google_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [id, email, phone || null, passwordHash || null, fullName, role || 'devotee', googleId ? 'active' : 'pending_verification', googleId || null],
  ));
  return rows[0];
}

async function linkGoogleId(userId, googleId, q = query) {
  await q('UPDATE users SET google_id = $1, email_verified = TRUE WHERE id = $2', [googleId, userId]);
}

/** Creates the pandit row + user row a fresh pandit registration needs, in
 *  one transaction — a pandit is never just a `users` row (schema requires
 *  a 1:1 `pandits` row referencing it). The `pandits` INSERT needs RLS
 *  context (pandits_insert_self checks user_id = current_app_user_id()),
 *  but that id doesn't exist until the first INSERT returns it — so this
 *  manages its own transaction instead of using withUserContext, setting
 *  app.current_user_id partway through once the new user's id is known. */
async function createPandit({ email, phone, passwordHash, fullName, slug }) {
  const { pool } = require('../config/db');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, status)
       VALUES ($1, $2, $3, $4, 'pandit', 'pending_verification') RETURNING *`,
      [email, phone || null, passwordHash, fullName],
    );
    const user = userRows[0];
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', user.id]);
    const { rows: panditRows } = await client.query(
      `INSERT INTO pandits (user_id, public_phone, whatsapp_number, slug) VALUES ($1, $2, $2, $3) RETURNING *`,
      [user.id, phone || null, slug],
    );
    await client.query('COMMIT');
    return { user, pandit: panditRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createSession({ userId, tokenHash, expiresAt, deviceInfo, ip }) {
  const { rows } = await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, device_info, ip_address)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, tokenHash, expiresAt, deviceInfo ? JSON.stringify(deviceInfo) : null, ip || null],
  );
  return rows[0].id;
}

async function findActiveSessionByTokenHash(tokenHash) {
  // See 01-schema.sql's users_select_by_bearer_session policy: reading the
  // `users` row of an unknown caller requires proving the bearer token maps
  // to that user's own active session first, via this setting.
  return withSetting('app.session_token_hash', tokenHash, async (q) => {
    const { rows } = await q(
      `SELECT s.id AS session_id, u.id AS user_id, u.email, u.role, u.full_name, u.status
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.deleted_at IS NULL`,
      [tokenHash],
    );
    return rows[0] || null;
  });
}

async function revokeSession(tokenHash) {
  await query('UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
}

/** Updates the just-authenticated user's own login stats — needs RLS
 *  context, so callers should already be inside withUserContext(userId, ...). */
async function touchLogin(userId, q = query) {
  await q('UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1', [userId]);
}

async function revokeAllSessions(userId) {
  await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

/** "Right to erasure" — soft delete + anonymize, not a hard DELETE: reviews,
 *  temple/pandit associations and analytics reference this row, and this
 *  app has no cascading-anonymization job to untangle that (see
 *  docs/SECURITY.md). Needs RLS context — call via withUserContext. */
async function softDeleteAccount(userId, q = query) {
  await q(
    `UPDATE users SET deleted_at = NOW(), email = 'deleted-' || id || '@panditconnect.invalid',
            phone = NULL, full_name = 'Deleted User', avatar_url = NULL, google_id = NULL, facebook_id = NULL
     WHERE id = $1`,
    [userId],
  );
  await q(`UPDATE pandits SET deleted_at = NOW(), is_available = FALSE WHERE user_id = $1`, [userId]);
  await revokeAllSessions(userId);
}

/** "Right to data portability" — everything this account owns, minus
 *  password_hash/session tokens. Needs RLS context — call via
 *  withUserContext. */
async function exportAccountData(userId, q = query) {
  // Sequential, not Promise.all: `q` here is usually the single client bound
  // by withUserContext (see me.controller.js), and one pg connection can't
  // run overlapping queries — Promise.all silently serialized them anyway
  // (with a deprecation warning that says this won't be silent forever).
  const { rows: profile } = await q('SELECT id, email, phone, full_name, role, city, state, created_at FROM users WHERE id = $1', [userId]);
  const { rows: reviews } = await q('SELECT id, reviewable_type, reviewable_id, rating, title, body, created_at FROM reviews WHERE user_id = $1', [userId]);
  const { rows: inquiries } = await q('SELECT id, pandit_id, temple_id, full_name, phone, message, status, created_at FROM inquiries WHERE user_id = $1', [userId]);
  const { rows: savedPandits } = await q('SELECT pandit_id, created_at FROM saved_pandits WHERE user_id = $1', [userId]);
  const { rows: savedTemples } = await q('SELECT temple_id, created_at FROM saved_temples WHERE user_id = $1', [userId]);
  const { rows: posts } = await q('SELECT id, title, body, created_at FROM community_posts WHERE user_id = $1', [userId]);
  const { rows: comments } = await q('SELECT id, post_id, body, created_at FROM community_comments WHERE user_id = $1', [userId]);
  return {
    profile: profile[0], reviews, inquiries, savedPandits, savedTemples,
    communityPosts: posts, communityComments: comments,
  };
}

async function createOtp({ target, targetType, otpHash, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO otp_verifications (target, target_type, otp_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING id`,
    [target, targetType, otpHash, expiresAt],
  );
  return rows[0].id;
}

async function findLatestOtp(target, targetType) {
  const { rows } = await query(
    `SELECT * FROM otp_verifications WHERE target = $1 AND target_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [target, targetType],
  );
  return rows[0] || null;
}

async function markOtpVerified(id) {
  await query('UPDATE otp_verifications SET verified = TRUE WHERE id = $1', [id]);
}

async function incrementOtpAttempts(id) {
  await query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [id]);
}

/** Needs RLS context (users_update_self) — call via withUserContext. */
async function markTargetVerified(userId, targetType, q = query) {
  const column = targetType === 'email' ? 'email_verified' : 'phone_verified';
  await q(`UPDATE users SET ${column} = TRUE WHERE id = $1`, [userId]);
}

module.exports = {
  findByEmail, findById, create, createPandit, createSession, findActiveSessionByTokenHash,
  revokeSession, revokeAllSessions, touchLogin, createOtp, findLatestOtp, markOtpVerified,
  incrementOtpAttempts, markTargetVerified, softDeleteAccount, exportAccountData, linkGoogleId,
};
