const { Router } = require('express');
const { query } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');

// Only the paths a scanner would actually try against THIS backend — real
// attacker traffic to a bare "/admin" never reaches Express at all (nginx
// serves the static frontend for everything outside /api/, see
// docker/nginx/default.conf), so these are registered under /api (see
// routes/index.js), not as top-level routes like the original proposal shows.
const HONEYPOT_PATHS = [
  '/admin', '/administrator', '/admin-panel', '/dashboard', '/wp-admin',
  '/control-panel', '/backend', '/manage', '/cms', '/panel',
  '/admin.php', '/administrator.php', '/wp-login.php', '/login/admin', '/admin/login',
];

/** Logs the attempt (honeypot_logs + security_audit_log) and 404s — never
 *  reveals that this path is special. Does NOT auto-ban (see middleware/ipBan.js
 *  and docs/ADMIN.md): a single hit is exactly as likely to be a bored
 *  visitor typing "/admin" out of habit as an actual scanner, and this app
 *  has no appeals process for a wrongly-banned shared/dynamic IP. Review
 *  honeypot_logs and ban deliberately via POST <secret>/security/ban-ip
 *  if a pattern actually looks malicious. */
function honeypotRouter() {
  const router = Router();
  HONEYPOT_PATHS.forEach((honeypotPath) => {
    router.all(honeypotPath, async (req, res) => {
      await query(
        `INSERT INTO honeypot_logs (ip_address, attempted_path, method, user_agent) VALUES ($1, $2, $3, $4)`,
        [req.ip, req.path, req.method, req.headers['user-agent'] || null],
      );
      await logSecurityEvent('ADMIN_HONEYPOT_TRIGGERED', req, { path: req.path });
      res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
    });
  });
  return router;
}

module.exports = { honeypotRouter, HONEYPOT_PATHS };
