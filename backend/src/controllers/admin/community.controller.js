const repo = require('../../repositories/admin/community.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

const VALID_STATUSES = ['draft', 'published', 'archived', 'flagged', 'removed'];

async function listPosts(req, res) {
  const paging = readPaging(req.query, 20, 100);
  const { data, total } = await repo.listPosts(req.db, { status: req.query.status, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function moderatePost(req, res) {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  const ok = await repo.moderatePost(req.db, req.params.id, status);
  if (!ok) return res.status(404).json({ error: 'Post not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'COMMUNITY_POST_MODERATED', targetType: 'community_post', targetId: req.params.id, details: { status }, ip: req.ip });
  res.json({ ok: true });
}

async function moderateComment(req, res) {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  const ok = await repo.moderateComment(req.db, req.params.id, status);
  if (!ok) return res.status(404).json({ error: 'Comment not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'COMMUNITY_COMMENT_MODERATED', targetType: 'community_comment', targetId: req.params.id, details: { status }, ip: req.ip });
  res.json({ ok: true });
}

module.exports = { listPosts, moderatePost, moderateComment };
