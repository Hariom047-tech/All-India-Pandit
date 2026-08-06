const { query } = require('../config/db');
const { asyncHandler } = require('./asyncHandler');
const { adminSecretPath } = require('../config/env');

const ADMIN_PREFIX = `/api/${adminSecretPath}/`;

/** Applied globally (see app.js) — checked on every request, ahead of
 *  rate limiting, so a banned IP doesn't even burn rate-limit quota.
 *  Banning is a manual admin action (see routes/admin/security.routes.js),
 *  not automatic — see docs/ADMIN.md for why the proposal's auto-ban-on-
 *  honeypot-hit was toned down.
 *
 *  The admin panel itself is exempt: it's already behind requireAdmin
 *  (password + TOTP), a much stronger gate than an IP check, and this is
 *  exactly the recovery path a mistaken ban needs — this was found by
 *  actually banning a test IP and discovering it locked that IP out of the
 *  unban endpoint too, with no way back short of a direct database edit.
 *  Same "no unrecoverable lockouts" principle as the deliberately-not-
 *  enforced admin session IP-pinning (see middleware/admin.js). */
const checkIpBan = asyncHandler(async (req, res, next) => {
  if (!req.ip || req.originalUrl.startsWith(ADMIN_PREFIX)) return next();
  try {
    const { rows } = await query(
      `SELECT 1 FROM banned_ips WHERE ip_address = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [req.ip],
    );
    if (rows.length) return res.status(403).json({ error: 'Forbidden' });
  } catch {
    // DB unavailable — skip ban check, allow request through
  }
  next();
});

module.exports = { checkIpBan };
