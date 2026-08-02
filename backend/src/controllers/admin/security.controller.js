const bcrypt = require('bcryptjs');
const repo = require('../../repositories/admin/security.repository');
const adminAuthRepo = require('../../repositories/admin/auth.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');
const { query } = require('../../config/db');

const BCRYPT_ROUNDS = 10;

async function auditLog(req, res) {
  const paging = readPaging(req.query, 50, 200);
  const { eventType, severity, userId, dateFrom, dateTo } = req.query;
  const { data, total } = await repo.listAuditLog({ eventType, severity, userId, dateFrom, dateTo, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function adminActivityLog(req, res) {
  const paging = readPaging(req.query, 50, 200);
  const { adminUserId, action } = req.query;
  const { data, total } = await repo.listAdminActivityLog(req.db, { adminUserId, action, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function honeypotLogs(req, res) {
  const paging = readPaging(req.query, 50, 200);
  const { data, total } = await repo.listHoneypotLogs({ page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

const bannedIps = async (req, res) => res.json(await repo.listBannedIps());

async function banIp(req, res) {
  const { ip, reason, durationHours } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  const id = await repo.banIp({ ip, reason, durationHours, bannedBy: req.adminUser.id });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'IP_BANNED', details: { ip, reason, durationHours }, ip: req.ip });
  res.status(201).json({ ok: true, id });
}

async function unbanIp(req, res) {
  const ok = await repo.unbanIp(req.params.ip, req.adminUser.id);
  if (!ok) return res.status(404).json({ error: 'IP is not currently banned' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'IP_UNBANNED', details: { ip: req.params.ip }, ip: req.ip });
  res.json({ ok: true });
}

async function activeSessions(req, res) {
  res.json(await adminAuthRepo.listActiveSessions(req.db));
}

async function forceLogoutAll(req, res) {
  await query('UPDATE admin_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL');
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'EMERGENCY_LOGOUT_ALL', ip: req.ip });
  res.json({ ok: true });
}

async function listAdminUsers(req, res) {
  res.json(await adminAuthRepo.listAdmins(req.db));
}

async function createAdminUser(req, res) {
  const { email, password, fullName, role } = req.body || {};
  if (!email || !password || !fullName || !['admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'email, password, fullName and role (admin|super_admin) are required' });
  }
  if (password.length < 12) return res.status(400).json({ error: 'admin passwords must be at least 12 characters' });
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const admin = await adminAuthRepo.createAdmin({ email, passwordHash, fullName, role }, req.db);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'ADMIN_USER_CREATED', targetType: 'user', targetId: admin.id, details: { email, role }, ip: req.ip });
  res.status(201).json(admin);
}

const overview = async (req, res) => res.json(await repo.securityOverview());

module.exports = {
  auditLog, adminActivityLog, honeypotLogs, bannedIps, banIp, unbanIp,
  activeSessions, forceLogoutAll, listAdminUsers, createAdminUser, overview,
};
