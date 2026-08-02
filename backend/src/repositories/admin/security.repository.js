const { query } = require('../../config/db');

async function listAuditLog({ eventType, severity, userId, dateFrom, dateTo, page, perPage }) {
  const where = [];
  const params = [];
  if (eventType) { params.push(eventType); where.push(`event_type = $${params.length}`); }
  if (severity) { params.push(severity); where.push(`severity = $${params.length}`); }
  if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); where.push(`created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); where.push(`created_at <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(perPage, (page - 1) * perPage);
  const { rows } = await query(
    `SELECT * FROM security_audit_log ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM security_audit_log ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

// Joins `users` for the admin's display name — needs RLS context
// (users_select_admin). Call via req.db.
async function listAdminActivityLog(q, { adminUserId, action, page, perPage }) {
  const where = [];
  const params = [];
  if (adminUserId) { params.push(adminUserId); where.push(`al.admin_user_id = $${params.length}`); }
  if (action) { params.push(action); where.push(`al.action = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT al.*, u.full_name AS admin_name FROM admin_activity_log al JOIN users u ON u.id = al.admin_user_id
     ${whereSql} ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM admin_activity_log al ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function listHoneypotLogs({ page, perPage }) {
  const { rows } = await query(
    'SELECT * FROM honeypot_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [perPage, (page - 1) * perPage],
  );
  const { rows: countRows } = await query('SELECT COUNT(*)::int AS total FROM honeypot_logs');
  return { data: rows, total: countRows[0].total };
}

async function listBannedIps() {
  const { rows } = await query(
    `SELECT id, ip_address, reason, banned_at, expires_at, is_active FROM banned_ips
     WHERE is_active = TRUE ORDER BY banned_at DESC`,
  );
  return rows;
}

async function isIpBanned(ip) {
  const { rows } = await query(
    `SELECT 1 FROM banned_ips WHERE ip_address = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
    [ip],
  );
  return rows.length > 0;
}

async function banIp({ ip, reason, durationHours, bannedBy }) {
  const { rows } = await query(
    `INSERT INTO banned_ips (ip_address, reason, banned_by, expires_at)
     VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4 || ' hours')::interval END)
     RETURNING id`,
    [ip, reason || null, bannedBy, durationHours || null],
  );
  return rows[0].id;
}

async function unbanIp(ip, adminId) {
  const { rowCount } = await query(
    `UPDATE banned_ips SET is_active = FALSE, unbanned_at = NOW(), unbanned_by = $2 WHERE ip_address = $1 AND is_active = TRUE`,
    [ip, adminId],
  );
  return rowCount > 0;
}

async function securityOverview() {
  const [failedLogins, honeypot, banned, activeSessions] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM security_audit_log WHERE event_type = 'LOGIN_FAILED' AND created_at > NOW() - INTERVAL '24 hours'`),
    query(`SELECT COUNT(*)::int AS c FROM honeypot_logs WHERE created_at > NOW() - INTERVAL '24 hours'`),
    query(`SELECT COUNT(*)::int AS c FROM banned_ips WHERE is_active = TRUE`),
    query(`SELECT COUNT(*)::int AS c FROM admin_sessions WHERE revoked_at IS NULL AND expires_at > NOW()`),
  ]);
  return {
    failedLogins24h: failedLogins.rows[0].c,
    honeypotTriggers24h: honeypot.rows[0].c,
    bannedIps: banned.rows[0].c,
    activeAdminSessions: activeSessions.rows[0].c,
  };
}

module.exports = {
  listAuditLog, listAdminActivityLog, listHoneypotLogs, listBannedIps, isIpBanned,
  banIp, unbanIp, securityOverview,
};
