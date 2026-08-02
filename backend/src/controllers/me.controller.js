const social = require('../repositories/social.repository');
const dashboard = require('../repositories/dashboard.repository');
const authRepo = require('../repositories/auth.repository');
const { withUserContext } = require('../config/db');

const listSavedPandits = async (req, res) => res.json(await social.savedPandits(req.user.id));
const listSavedTemples = async (req, res) => res.json(await social.savedTemples(req.user.id));

async function addSavedPandit(req, res) {
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!(await social.savePandit(req.user.id, slug))) return res.status(404).json({ error: 'Pandit not found' });
  res.status(201).json({ ok: true });
}

async function removeSavedPandit(req, res) {
  await social.unsavePandit(req.user.id, req.params.slug);
  res.json({ ok: true });
}

async function addSavedTemple(req, res) {
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!(await social.saveTemple(req.user.id, slug))) return res.status(404).json({ error: 'Temple not found' });
  res.status(201).json({ ok: true });
}

async function removeSavedTemple(req, res) {
  await social.unsaveTemple(req.user.id, req.params.slug);
  res.json({ ok: true });
}

async function listNotifications(req, res) {
  const data = await withUserContext(req.user.id, (q) => social.notifications(req.user.id, { unreadOnly: req.query.unread === 'true' }, q));
  res.json(data);
}

async function readNotification(req, res) {
  const ok = await withUserContext(req.user.id, (q) => social.markNotificationRead(req.user.id, req.params.id, q));
  if (!ok) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
}

/** Pandit's own enquiry inbox (POST /api/temples|pandits/:id/inquiry lands here). */
async function inbox(req, res) {
  const data = await withUserContext(req.user.id, (q) => dashboard.inboxForPandit(req.user.id, q));
  res.json(data);
}

async function updateInquiry(req, res) {
  const { status } = req.body || {};
  const allowed = ['new', 'seen', 'replied', 'completed', 'expired'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  const ok = await withUserContext(req.user.id, (q) => dashboard.updateInquiryStatus(req.user.id, req.params.id, status, q));
  if (!ok) return res.status(404).json({ error: 'Inquiry not found' });
  res.json({ ok: true });
}

/** GET /api/me/dashboard — backs the frontend's dashboard.html KPIs once it's
 *  wired to the backend instead of illustrative numbers (see README). */
async function panditDashboard(req, res) {
  const data = await withUserContext(req.user.id, (q) => dashboard.forPandit(req.user.id, q));
  if (!data) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json(data);
}

/** GET /api/me/export — "right to data portability": everything this
 *  account owns, as one JSON document. */
async function exportData(req, res) {
  const data = await withUserContext(req.user.id, (q) => authRepo.exportAccountData(req.user.id, q));
  res.json(data);
}

/** DELETE /api/me — "right to erasure": soft-delete + anonymize (see
 *  authRepo.softDeleteAccount for why not a hard DELETE) and revoke every
 *  session, including the one making this request. */
async function deleteAccount(req, res) {
  await withUserContext(req.user.id, (q) => authRepo.softDeleteAccount(req.user.id, q));
  res.json({ ok: true });
}

module.exports = {
  listSavedPandits, listSavedTemples, addSavedPandit, removeSavedPandit, addSavedTemple, removeSavedTemple,
  listNotifications, readNotification, inbox, updateInquiry, panditDashboard, exportData, deleteAccount,
};
