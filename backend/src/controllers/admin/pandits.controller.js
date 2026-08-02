const repo = require('../../repositories/admin/pandits.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search, verificationStatus, tier, isFeatured, city, minRating } = req.query;
  const { data, total } = await repo.list(req.db, {
    search, verificationStatus, tier, isFeatured, city,
    minRating: minRating ? parseFloat(minRating) : undefined, page: paging.page, perPage: paging.perPage,
  });
  res.json(paginationEnvelope(data, paging, total));
}

const verificationQueue = async (req, res) => res.json(await repo.verificationQueue(req.db));

async function verify(req, res) {
  const { action, rejectionReason } = req.body || {};
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });

  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });

  const status = action === 'approve' ? 'verified' : 'rejected';
  await repo.setVerification(req.db, pandit.id, { status, verifiedBy: req.adminUser.id });
  await repo.notifyUser(req.db, pandit.user_id, {
    type: 'profile_verified',
    title: action === 'approve' ? 'Profile verified' : 'Verification rejected',
    body: action === 'approve' ? 'Congratulations! Your profile has been verified.' : `Your verification was rejected. Reason: ${rejectionReason || 'not specified'}`,
  });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'PANDIT_VERIFICATION', targetType: 'pandit', targetId: pandit.id, details: { action, rejectionReason }, ip: req.ip });
  res.json({ ok: true });
}

async function toggleFeatured(req, res) {
  const { featured, featuredUntil } = req.body || {};
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  await repo.toggleFeatured(req.db, pandit.id, !!featured, featuredUntil);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'PANDIT_FEATURED_TOGGLE', targetType: 'pandit', targetId: pandit.id, details: { featured }, ip: req.ip });
  res.json({ ok: true });
}

async function analytics(req, res) {
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  res.json(await repo.analytics(req.db, pandit.id, parseInt(req.query.days, 10) || 30));
}

async function setSubscription(req, res) {
  const { tier, expiresAt, reason } = req.body || {};
  if (!['free', 'silver', 'gold', 'diamond'].includes(tier)) return res.status(400).json({ error: 'invalid tier' });
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  await repo.setTier(req.db, pandit.id, tier, expiresAt);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'PANDIT_SUBSCRIPTION_CHANGED', targetType: 'pandit', targetId: pandit.id, details: { tier, reason }, ip: req.ip });
  res.json({ ok: true });
}

module.exports = { list, verificationQueue, verify, toggleFeatured, analytics, setSubscription };
