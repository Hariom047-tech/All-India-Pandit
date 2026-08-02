const repo = require('../../repositories/admin/content.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function listPosts(req, res) {
  const paging = readPaging(req.query, 20, 100);
  const { data, total } = await repo.listPosts(req.db, { status: req.query.status, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function create(req, res) {
  const { title, slug, body } = req.body || {};
  if (!title || !slug || !body) return res.status(400).json({ error: 'title, slug and body are required' });
  const post = await repo.create(req.db, req.adminUser.id, req.body);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'BLOG_POST_CREATED', targetType: 'blog_post', targetId: post.id, details: { title }, ip: req.ip });
  res.status(201).json(post);
}

async function update(req, res) {
  const updated = await repo.update(req.db, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Post not found' });
  res.json(updated);
}

async function remove(req, res) {
  const ok = await repo.softDelete(req.db, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Post not found' });
  res.json({ ok: true });
}

async function publish(req, res) {
  const ok = await repo.setPublished(req.db, req.params.id, true);
  if (!ok) return res.status(404).json({ error: 'Post not found' });
  // targetId is a UUID column — :id here is the post's slug, not its id, so
  // it goes in `details` instead (same fix as temples.controller.js#deactivate).
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'BLOG_POST_PUBLISHED', targetType: 'blog_post', details: { slug: req.params.id }, ip: req.ip });
  res.json({ ok: true });
}

async function unpublish(req, res) {
  const ok = await repo.setPublished(req.db, req.params.id, false);
  if (!ok) return res.status(404).json({ error: 'Post not found' });
  res.json({ ok: true });
}

module.exports = { listPosts, create, update, remove, publish, unpublish };
