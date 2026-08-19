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

const VALID_TIERS = ['free', 'silver', 'gold', 'diamond'];
const VALID_CYCLES = ['monthly', 'quarterly', 'yearly'];
const MIN_PASSWORD_LENGTH = 8;

/** Strict YYYY-MM-DD and a real calendar date — rejects 2001-02-30. */
function parseDob(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false };
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false };
  if (dt.getTime() > Date.now()) return { ok: false };
  if (y < 1900) return { ok: false };
  return { ok: true, value };
}

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 200) return 'Password is too long';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Temporary password must contain at least one letter and one number';
  }
  return null;
}

/** Normalises to E.164-ish digits so the same human number can't be stored twice. */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits.slice(0, 15);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits.slice(0, 15);
}

/**
 * POST <secret>/pandits — admin provisions a pandit account.
 *
 * The admin sets the login email, a temporary password and the date of
 * birth (which later acts as the second factor in the pandit's own password
 * reset). The plaintext password is hashed here and then goes out of scope:
 * it is never returned in the response, never written to the admin activity
 * log, and never persisted anywhere but as a bcrypt hash.
 */
async function create(req, res) {
  const {
    email, fullName, phone, slug, temporaryPassword, dateOfBirth,
    city, state, bio, shortBio, experienceYears, languages, specializations,
    publicPhone, whatsappNumber, verificationStatus,
    planTier, planBillingCycle, planExpiresAt,
  } = req.body || {};

  if (!email || !fullName || !slug) {
    return res.status(400).json({ error: 'email, fullName and slug are required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });
  }

  const dob = parseDob(dateOfBirth);
  if (!dob.ok) return res.status(400).json({ error: 'dateOfBirth must be a real date in YYYY-MM-DD format' });

  // An admin-set password is required: the previous behaviour generated a
  // random one nobody ever saw, which left the pandit with no way in until
  // a reset. If the admin omits it we still refuse rather than inventing one.
  const pwProblem = passwordProblem(temporaryPassword);
  if (pwProblem) return res.status(400).json({ error: pwProblem });

  if (planTier && !VALID_TIERS.includes(planTier)) {
    return res.status(400).json({ error: `planTier must be one of: ${VALID_TIERS.join(', ')}` });
  }
  if (planBillingCycle && !VALID_CYCLES.includes(planBillingCycle)) {
    return res.status(400).json({ error: `planBillingCycle must be one of: ${VALID_CYCLES.join(', ')}` });
  }

  const passwordHash = await bcrypt.hash(String(temporaryPassword), 10);
  const normalizedPhone = normalizePhone(phone);

  try {
    const { pandit } = await repo.createFull({
      email: normalizedEmail,
      fullName: String(fullName).trim(),
      phone: normalizedPhone,
      slug,
      passwordHash,
      dateOfBirth: dob.value,
      city, state, bio, shortBio,
      experienceYears: experienceYears ? parseInt(experienceYears, 10) : 0,
      languages: Array.isArray(languages) ? languages : undefined,
      specializations: Array.isArray(specializations) ? specializations : undefined,
      publicPhone: normalizePhone(publicPhone),
      whatsappNumber: normalizePhone(whatsappNumber),
      verificationStatus: verificationStatus || 'verified',
      planTier, planBillingCycle, planExpiresAt,
      createdByAdminId: req.adminUser.id,
    });

    // Records WHAT was provisioned, never the credential itself.
    await logAdminAction({
      adminUserId: req.adminUser.id,
      action: 'PANDIT_ACCOUNT_CREATED',
      targetType: 'pandit',
      targetId: pandit.id,
      details: { slug, email: normalizedEmail, planTier: planTier || 'free', dateOfBirthSet: Boolean(dob.value) },
      ip: req.ip,
    });

    res.status(201).json({ slug: pandit.slug, id: pandit.id });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23505') {
      if (err.constraint === 'users_email_key') return res.status(409).json({ error: 'An account with this email already exists' });
      if (err.constraint === 'users_phone_key') return res.status(409).json({ error: 'An account with this mobile number already exists' });
      return res.status(409).json({ error: 'That profile slug is already taken' });
    }
    throw err;
  }
}

/**
 * POST <secret>/pandits/:id/reset-password — admin replaces a pandit's
 * password (support path for "I cannot get in").
 *
 * Deliberately a reset, not a reveal: the stored value is a bcrypt hash, so
 * showing the old password is impossible by construction, and building any
 * mechanism that could would mean storing it reversibly.
 */
async function resetPassword(req, res) {
  const found = await repo.findIdBySlug(req.db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Pandit not found' });

  const { temporaryPassword } = req.body || {};
  const problem = passwordProblem(temporaryPassword);
  if (problem) return res.status(400).json({ error: problem });

  const passwordHash = await bcrypt.hash(String(temporaryPassword), 10);
  const ok = await repo.resetPassword(req.db, found.id, passwordHash);
  if (!ok) return res.status(404).json({ error: 'Pandit not found' });

  await logAdminAction({
    adminUserId: req.adminUser.id,
    action: 'PANDIT_PASSWORD_ADMIN_RESET',
    targetType: 'pandit',
    targetId: found.id,
    details: { slug: req.params.id, sessionsRevoked: true },   // never the password
    ip: req.ip,
  });

  res.json({ ok: true, sessionsRevoked: true });
}

/** PUT <secret>/pandits/:id/date-of-birth — maintain the reset second factor. */
async function setDateOfBirth(req, res) {
  const found = await repo.findIdBySlug(req.db, req.params.id);
  if (!found) return res.status(404).json({ error: 'Pandit not found' });

  const dob = parseDob(req.body?.dateOfBirth);
  if (!dob.ok) return res.status(400).json({ error: 'dateOfBirth must be a real date in YYYY-MM-DD format' });

  await repo.setDateOfBirth(req.db, found.id, dob.value);
  await logAdminAction({
    adminUserId: req.adminUser.id,
    action: 'PANDIT_DOB_UPDATED',
    targetType: 'pandit',
    targetId: found.id,
    details: { slug: req.params.id, cleared: dob.value === null },  // never the DOB itself
    ip: req.ip,
  });
  res.json({ ok: true });
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
    specializations, whatsappNumber, publicPhone, isAvailable, languages,
    vedicEducation, gotra, tradition, respondsWithin, acceptsOnline, services, temples,
  } = req.body || {};

  await repo.update(req.db, pandit.id, pandit.user_id, {
    name, city, state, phone, bio, shortBio, experienceYears, primarySpecialization,
    specializations, whatsappNumber, publicPhone, isAvailable, languages,
    vedicEducation, gotra, tradition, respondsWithin, acceptsOnline,
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

/**
 * GET <secret>/pandits/:id/analytics?range=7d|30d|today|yesterday|thisMonth|lastMonth|custom&from=&to=
 *
 * Every number in the response is a real query result — see
 * admin/pandits.repository.js's analytics() for exactly what each field
 * reuses vs computes fresh. No mock/static values anywhere in this path.
 */
async function analytics(req, res) {
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  const { range, from, to } = req.query;
  try {
    res.json({
      pandit: { id: pandit.id },
      ...(await repo.analytics(req.db, pandit.id, { range, from, to })),
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  }
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

const qualifiedLeadsRepo = require('../../repositories/qualifiedLeads.repository');

/**
 * GET <secret>/pandits/:id/leads — admin's view of ONE pandit's qualified
 * leads. Reuses qualifiedLeads.repository.js's listForPandit (the exact
 * same function the pandit's own dashboard calls at GET /api/me/leads) so
 * an admin looking at Pandit X sees the identical rows and pagination
 * behaviour Pandit X sees of themselves — not a second, potentially
 * inconsistent implementation. req.db carries the admin RLS context, which
 * is what makes qleads_select_admin (not qleads_select_own_pandit) the
 * policy that applies here.
 */
async function leads(req, res) {
  const pandit = await repo.findIdBySlug(req.db, req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  const paging = readPaging(req.query, 20, 100);
  const { period, status } = req.query;
  // Same call→phone_call alias me.controller.js's LEAD_METHODS applies —
  // the DB enum is phone_call, the frontend has always posted "call".
  const method = req.query.method === 'call' ? 'phone_call' : req.query.method;
  const result = await qualifiedLeadsRepo.listForPandit(
    pandit.id,
    { page: paging.page, limit: paging.perPage, period: period === 'all' ? undefined : period, method, status },
    req.db,
  );
  res.json(paginationEnvelope(result.data, paging, result.total));
}

module.exports = {
  resetPassword, setDateOfBirth, list, verificationQueue, create, getById, update, verify, toggleFeatured,
  analytics, setSubscription, leads,
};
