const repo = require('../../repositories/admin/reviews.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { reviewableType, rating, isApproved, isFlagged } = req.query;
  const { data, total } = await repo.list(req.db, {
    reviewableType, rating: rating ? parseInt(rating, 10) : undefined, isApproved, isFlagged,
    page: paging.page, perPage: paging.perPage,
  });
  res.json(paginationEnvelope(data, paging, total));
}

const flagged = async (req, res) => res.json(await repo.flagged(req.db));

const VALID_ACTIONS = ['approve', 'reject', 'delete'];

async function moderate(req, res) {
  const { action, reason } = req.body || {};
  if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
  const ok = await repo.moderate(req.db, req.params.id, action);
  if (!ok) return res.status(404).json({ error: 'Review not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'REVIEW_MODERATED', targetType: 'review', targetId: req.params.id, details: { action, reason }, ip: req.ip });
  res.json({ ok: true });
}

async function bulkModerate(req, res) {
  const { reviewIds, action } = req.body || {};
  if (!Array.isArray(reviewIds) || !reviewIds.length || !VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `reviewIds[] and action (${VALID_ACTIONS.join(', ')}) are required` });
  }
  const count = await repo.bulkModerate(req.db, reviewIds, action);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'REVIEWS_BULK_MODERATED', details: { count, action }, ip: req.ip });
  res.json({ moderated: count });
}

module.exports = { list, flagged, moderate, bulkModerate };
