const repo = require('../../repositories/admin/pandits.repository');
const authRepo = require('../../repositories/auth.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

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

async function create(req, res) {
  const { email, fullName, phone, slug } = req.body || {};
  if (!email || !fullName || !slug) return res.status(400).json({ error: 'email, fullName and slug are required' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });

  // Use a secure random password since the admin is creating the account
  // The pandit can reset their password later via forgot password flow
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  
  try {
    const { pandit } = await authRepo.createPandit({ email, phone, passwordHash, fullName, slug });
    
    // Auto-verify when created by admin
    await repo.setVerification(req.db, pandit.id, { status: 'verified', verifiedBy: req.adminUser.id });
    
    await logAdminAction({ adminUserId: req.adminUser.id, action: 'PANDIT_CREATED', targetType: 'pandit', targetId: pandit.id, details: { slug, email }, ip: req.ip });
    res.status(201).json({ slug: pandit.slug });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'users_email_key') return res.status(409).json({ error: 'An account with this email already exists' });
      return res.status(409).json({ error: 'That profile slug is already taken' });
    }
    throw err;
  }
}

async function getById(req, res) {
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  res.json(await repo.getFullById(req.db, pandit.id));
}

/** Full-profile edit — the one admin write path with no matching endpoint
 *  in the original 13-module proposal: everything else there only ever
 *  toggles a status (verify/feature/tier). Lets the admin actually correct
 *  a listing (name, city, bio, languages) and assign the services/temples
 *  a pandit is associated with, instead of only approving/rejecting what
 *  the pandit self-reported. */
async function update(req, res) {
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });

  const {
    name, city, state, phone, bio, shortBio, experienceYears, primarySpecialization,
    specializations, whatsappNumber, publicPhone, isAvailable, languages, services, temples,
  } = req.body || {};

  await repo.update(req.db, pandit.id, pandit.user_id, {
    name, city, state, phone, bio, shortBio, experienceYears, primarySpecialization,
    specializations, whatsappNumber, publicPhone, isAvailable, languages,
  });
  if (Array.isArray(services)) await repo.syncServices(req.db, pandit.id, services);
  if (Array.isArray(temples)) await repo.syncTemples(req.db, pandit.id, temples);

  const full = await repo.getFullById(req.db, pandit.id);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'PANDIT_UPDATED', targetType: 'pandit', targetId: pandit.id, details: req.body, ip: req.ip });
  res.json(full);
}

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

module.exports = { list, verificationQueue, create, getById, update, verify, toggleFeatured, analytics, setSubscription };
