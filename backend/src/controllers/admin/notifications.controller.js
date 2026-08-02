const repo = require('../../repositories/admin/notifications.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function send(req, res) {
  const { userId, title, body, type, actionUrl } = req.body || {};
  if (!userId || !title || !type) return res.status(400).json({ error: 'userId, title and type are required' });
  const id = await repo.send(req.db, userId, { type, title, body, actionUrl });
  res.status(201).json({ ok: true, id });
}

async function broadcast(req, res) {
  const { title, body, type, targetRole, targetCity, targetState } = req.body || {};
  if (!title || !type) return res.status(400).json({ error: 'title and type are required' });
  const count = await repo.broadcast(req.db, { type, title, body, targetRole, targetCity, targetState });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'NOTIFICATION_BROADCAST', details: { title, count, targetRole }, ip: req.ip });
  res.json({ sent: count });
}

async function history(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { data, total } = await repo.history(req.db, { page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

module.exports = { send, broadcast, history };
