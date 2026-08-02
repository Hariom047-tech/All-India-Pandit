const repo = require('../repositories/community.repository');
const { readPaging, paginationEnvelope } = require('../utils/paginate');

async function list(req, res) {
  const paging = readPaging(req.query, 10);
  const { data, total } = await repo.list({ category: req.query.category, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function create(req, res) {
  const { title, body, category } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  const id = await repo.create({ userId: req.user.id, title, body, category });
  res.status(201).json({ ok: true, id });
}

async function getById(req, res) {
  const post = await repo.getById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
}

async function addComment(req, res) {
  const { body, parentId } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body is required' });
  if (!(await repo.exists(req.params.id))) return res.status(404).json({ error: 'Post not found' });
  const id = await repo.addComment({ postId: req.params.id, userId: req.user.id, body, parentId });
  res.status(201).json({ ok: true, id });
}

module.exports = { list, create, getById, addComment };
