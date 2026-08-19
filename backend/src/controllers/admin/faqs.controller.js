const repo = require('../../repositories/admin/faqs.repository');
const { logAdminAction } = require('../../utils/adminLog');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');

const ENTITY_TYPES = ['GLOBAL', 'HOME', 'TEMPLE', 'SERVICE', 'PANDIT'];
const STATUSES = ['draft', 'published', 'archived'];

async function list(req, res) {
  const paging = readPaging(req.query, 20, 100);
  const { data, total } = await repo.list(req.db, {
    entityType: req.query.entityType,
    status: req.query.status,
    search: req.query.search,
    ...paging,
  });
  res.json(paginationEnvelope(data, paging, total));
}

async function getById(req, res) {
  const faq = await repo.getById(req.db, req.params.id);
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  res.json(faq);
}

async function create(req, res) {
  const { entityType, entityId, question, answer, slug, status } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: 'question is required' });
  if (!answer || !answer.trim()) return res.status(400).json({ error: 'answer is required' });
  if (!ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: `entityType must be one of ${ENTITY_TYPES.join(', ')}` });
  if (['TEMPLE', 'SERVICE', 'PANDIT'].includes(entityType) && !entityId) {
    return res.status(400).json({ error: `entityId is required when entityType is ${entityType}` });
  }
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });

  const faq = await repo.create(req.db, {
    entityType, entityId, question: question.trim(), answer: answer.trim(), slug, status,
    adminUserId: req.adminUser.id,
  });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'FAQ_CREATED',
    targetType: 'universal_faq', targetId: faq.id, ip: req.ip,
    details: { entityType, entityId },
  });
  res.status(201).json(faq);
}

async function update(req, res) {
  const { question, answer, slug, sortOrder } = req.body || {};
  const faq = await repo.update(req.db, req.params.id, {
    question: question?.trim(), answer: answer?.trim(), slug, sortOrder, adminUserId: req.adminUser.id,
  });
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'FAQ_UPDATED',
    targetType: 'universal_faq', targetId: faq.id, ip: req.ip,
  });
  res.json(faq);
}

async function setStatus(req, res) {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  const faq = await repo.setStatus(req.db, req.params.id, status, req.adminUser.id);
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'FAQ_STATUS_CHANGED',
    targetType: 'universal_faq', targetId: faq.id, ip: req.ip, details: { status },
  });
  res.json(faq);
}

async function reorder(req, res) {
  const { entityType, entityId, orderedIds } = req.body || {};
  if (!ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: `entityType must be one of ${ENTITY_TYPES.join(', ')}` });
  if (!Array.isArray(orderedIds) || !orderedIds.length) return res.status(400).json({ error: 'orderedIds must be a non-empty array' });

  const result = await repo.reorder(req.db, entityType, entityId, orderedIds);
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'FAQ_REORDERED',
    targetType: 'universal_faq', ip: req.ip, details: { entityType, entityId },
  });
  res.json(result);
}

async function remove(req, res) {
  const ok = await repo.remove(req.db, req.params.id);
  if (!ok) return res.status(404).json({ error: 'FAQ not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'FAQ_DELETED',
    targetType: 'universal_faq', targetId: req.params.id, ip: req.ip,
  });
  res.json({ ok: true });
}

module.exports = { list, getById, create, update, setStatus, reorder, remove };
