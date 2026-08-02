const { query } = require('../config/db');

/** Writes to admin_activity_log (01-schema.sql) — append-only, every admin
 *  action, forever. Unlike security_audit_log (system/anonymous events),
 *  every call here has a known adminUserId, since it only ever fires from
 *  inside requireAdmin-gated routes. */
async function logAdminAction({ adminUserId, action, targetType, targetId, details, ip }) {
  await query(
    `INSERT INTO admin_activity_log (admin_user_id, action, target_type, target_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminUserId, action, targetType || null, targetId || null, JSON.stringify(details || {}), ip || null],
  );
}

module.exports = { logAdminAction };
