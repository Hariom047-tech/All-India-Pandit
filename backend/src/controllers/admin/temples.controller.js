const repo = require('../../repositories/admin/temples.repository');
const panditsRepo = require('../../repositories/admin/pandits.repository');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search, city, state, isActive } = req.query;
  const { data, total } = await repo.list(req.db, { search, city, state, isActive, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function getById(req, res) {
  const temple = await repo.getBySlug(req.db, req.params.id);
  if (!temple) return res.status(404).json({ error: 'Temple not found' });
  // The edit form needs the current catalogue links to pre-tick the picker.
  // SELECT * does not reach across to temple_services, so fetch them here.
  const serviceSlugs = await repo.linkedServiceSlugs(req.db, temple.id);
  res.json({ ...temple, serviceSlugs });
}

async function create(req, res) {
  const {
    name, slug, description, shortDescription, primaryDeity, addressLine1, city, state,
    latitude, longitude, establishedYear, history, significance, highlights,
  } = req.body || {};
  if (!name || !slug || !addressLine1 || !city || !state || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'name, slug, addressLine1, city, state, latitude and longitude are required' });
  }
  const temple = await repo.create(req.db, {
    name, slug, description, shortDescription, primaryDeity, addressLine1, city, state,
    latitude, longitude, establishedYear, history, significance, highlights,
  });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'TEMPLE_CREATED', targetType: 'temple', targetId: temple.id, details: { name }, ip: req.ip });
  res.status(201).json(temple);
}

async function update(req, res) {
  const updated = await repo.update(req.db, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Temple not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'TEMPLE_UPDATED', targetType: 'temple', targetId: updated.id, details: req.body, ip: req.ip });
  res.json(updated);
}

async function deactivate(req, res) {
  const ok = await repo.setActive(req.db, req.params.id, false);
  if (!ok) return res.status(404).json({ error: 'Temple not found' });
  // targetId is a UUID column — :id here is the temple's slug, not its id.
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'TEMPLE_DEACTIVATED', targetType: 'temple', details: { slug: req.params.id }, ip: req.ip });
  res.json({ ok: true });
}

async function setTimings(req, res) {
  const { timings } = req.body || {};
  if (!Array.isArray(timings) || !timings.length) return res.status(400).json({ error: 'timings array is required' });
  const temple = await repo.getBySlug(req.db, req.params.id);
  if (!temple) return res.status(404).json({ error: 'Temple not found' });
  await repo.setTimings(req.db, temple.id, timings);
  res.json({ ok: true });
}

async function mapPandit(req, res) {
  const { panditSlug, associationType } = req.body || {};
  if (!panditSlug) return res.status(400).json({ error: 'panditSlug is required' });
  const temple = await repo.getBySlug(req.db, req.params.id);
  if (!temple) return res.status(404).json({ error: 'Temple not found' });
  const pandit = await panditsRepo.findIdBySlug(req.db, panditSlug);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  await repo.mapPandit(req.db, temple.id, pandit.id, associationType);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'TEMPLE_PANDIT_MAPPED', targetType: 'temple', targetId: temple.id, details: { panditSlug }, ip: req.ip });
  res.json({ ok: true });
}

/**
 * Replace the temple's catalogue service links.
 *
 * Separate from update() because it writes a join table rather than columns on
 * temples, and because an empty array is a meaningful value here ("this temple
 * offers none") — update()'s "undefined means leave alone" convention cannot
 * express that.
 */
async function setServices(req, res) {
  const { serviceSlugs } = req.body || {};
  if (!Array.isArray(serviceSlugs)) {
    return res.status(400).json({ error: 'serviceSlugs must be an array of service slugs' });
  }
  const temple = await repo.getBySlug(req.db, req.params.id);
  if (!temple) return res.status(404).json({ error: 'Temple not found' });

  const { linked, unknown } = await repo.setServices(req.db, temple.id, serviceSlugs);

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'TEMPLE_SERVICES_SET',
    targetType: 'temple', targetId: temple.id,
    details: { linked, unknown }, ip: req.ip,
  });
  // 200 with `unknown` populated, not 400: the links that did match were saved,
  // and the admin needs to know which ones did not rather than lose the lot.
  res.json({ ok: true, linked, unknown });
}

module.exports = { list, getById, create, update, deactivate, setTimings, mapPandit, setServices };
