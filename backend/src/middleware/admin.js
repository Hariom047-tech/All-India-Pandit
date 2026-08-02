const adminAuthRepo = require('../repositories/admin/auth.repository');
const { extractToken, hashToken } = require('./auth');
const { withUserContext } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLog');
const { asyncHandler } = require('./asyncHandler');

/** Validates the admin bearer token, attaches req.adminUser, logs (but does
 *  NOT enforce — see docs/ADMIN.md) an IP change since the session started. */
const requireAdmin = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });

  const session = await adminAuthRepo.findActiveSessionByTokenHash(hashToken(token));
  if (!session) return res.status(401).json({ error: 'Admin authentication required' });

  if (session.session_ip && req.ip && session.session_ip !== req.ip) {
    logSecurityEvent('ADMIN_SESSION_IP_CHANGE', req, {
      userId: session.user_id, sessionStartIp: session.session_ip, currentIp: req.ip,
    });
  }
  adminAuthRepo.touchSession(session.session_id); // fire-and-forget, not on the critical path

  req.adminUser = { id: session.user_id, email: session.email, role: session.role, fullName: session.full_name };
  next();
});

/** Assumes requireAdmin already ran (req.adminUser is set) — use this bare
 *  form for routes nested under a router that already did `router.use(requireAdmin)`.
 *  `requireSuperAdminStandalone` below is for anywhere that isn't. */
function requireSuperAdmin(req, res, next) {
  if (req.adminUser.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  next();
}

const requireSuperAdminStandalone = [requireAdmin, requireSuperAdmin];

/** Wraps an admin controller so its whole body runs inside one
 *  withUserContext(adminId, ...) transaction — req.db is the context-bound
 *  query function, which is what makes the *_admin RLS policies (users,
 *  pandits, inquiries, notifications, pandit_analytics, payment_transactions
 *  — see 01-schema.sql) actually open up for this request. Requires
 *  requireAdmin to have already run (needs req.adminUser). Use req.db(...)
 *  instead of importing `query` directly anywhere an admin route touches
 *  one of those six tables — plain `query()` still works for everything
 *  else (temples, services, reviews, blog_posts, ... — no RLS on those). */
function adminHandler(fn) {
  return asyncHandler(async (req, res, next) => {
    await withUserContext(req.adminUser.id, async (q) => {
      req.db = q;
      await fn(req, res, next);
    });
  });
}

module.exports = { requireAdmin, requireSuperAdmin, requireSuperAdminStandalone, adminHandler };
