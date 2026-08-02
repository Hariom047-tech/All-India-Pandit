const repo = require('../../repositories/admin/inquiries.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { status, panditSlug } = req.query;
  const { data, total } = await repo.list(req.db, { status, panditSlug, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function getById(req, res) {
  const inquiry = await repo.getById(req.db, req.params.id);
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
  res.json(inquiry);
}

async function setStatus(req, res) {
  const { status } = req.body || {};
  const allowed = ['new', 'seen', 'replied', 'completed', 'expired'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  const ok = await repo.setStatus(req.db, req.params.id, status);
  if (!ok) return res.status(404).json({ error: 'Inquiry not found' });
  res.json({ ok: true });
}

module.exports = { list, getById, setStatus };
