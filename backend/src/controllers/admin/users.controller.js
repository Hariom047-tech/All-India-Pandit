const repo = require('../../repositories/admin/users.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search, status, city, state } = req.query;
  const { data, total } = await repo.list(req.db, { search, status, city, state, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

/** GET /admin/admin-users — the separate screen for admin/super_admin
 *  accounts, so they no longer need to leak into the devotee list to be
 *  visible anywhere at all. */
async function listAdmins(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search } = req.query;
  const { data, total } = await repo.listAdmins(req.db, { search, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function getById(req, res) {
  const user = await repo.getById(req.db, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}

async function update(req, res) {
  const { fullName, phone, city, state, role } = req.body || {};
  if (role && req.adminUser.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super_admin can change roles' });
  }
  const updated = await repo.update(req.db, req.params.id, { fullName, phone, city, state, role });
  if (!updated) return res.status(404).json({ error: 'User not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'USER_UPDATED', targetType: 'user', targetId: req.params.id, details: req.body, ip: req.ip });
  res.json(updated);
}

async function suspend(req, res) {
  const { reason } = req.body || {};
  const ok = await repo.setStatus(req.db, req.params.id, 'suspended');
  if (!ok) return res.status(404).json({ error: 'User not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'USER_SUSPENDED', targetType: 'user', targetId: req.params.id, details: { reason }, ip: req.ip });
  res.json({ ok: true });
}

async function ban(req, res) {
  const { reason } = req.body || {};
  const ok = await repo.setStatus(req.db, req.params.id, 'banned');
  if (!ok) return res.status(404).json({ error: 'User not found' });
  await repo.revokeAllSessions(req.db, req.params.id);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'USER_BANNED', targetType: 'user', targetId: req.params.id, details: { reason }, ip: req.ip });
  res.json({ ok: true });
}

async function remove(req, res) {
  const user = await repo.getById(req.db, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await repo.softDelete(req.db, req.params.id);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'USER_DELETED', targetType: 'user', targetId: req.params.id, ip: req.ip });
  res.json({ ok: true });
}

/** GET /admin/users/:id/activity — real timeline, real summary numbers, see
 *  Section 13/55/71's exact required shape. */
async function activity(req, res) {
  const user = await repo.getById(req.db, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const paging = readPaging(req.query, 30, 100);
  const data = await repo.activity(req.db, req.params.id, { page: paging.page, perPage: paging.perPage });
  res.json({ user: { id: user.id, name: user.full_name }, ...data, page: paging.page, perPage: paging.perPage });
}

module.exports = { list, listAdmins, getById, update, suspend, ban, remove, activity };
