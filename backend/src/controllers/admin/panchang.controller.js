const repo = require('../../repositories/admin/panchang.repository');
const { logAdminAction } = require('../../utils/adminLog');

async function list(req, res) {
  res.json(await repo.list(req.db, { dateFrom: req.query.dateFrom, dateTo: req.query.dateTo }));
}

async function create(req, res) {
  const { date, tithiName } = req.body || {};
  if (!date || !tithiName) return res.status(400).json({ error: 'date and tithiName are required' });
  res.status(201).json(await repo.create(req.db, req.body));
}

async function update(req, res) {
  const entry = await repo.update(req.db, req.params.id, req.body || {});
  if (!entry) return res.status(404).json({ error: 'Panchang entry not found' });
  res.json(entry);
}

const listFestivals = async (req, res) => res.json(await repo.listFestivals(req.db));

async function createFestival(req, res) {
  const { name, slug, date } = req.body || {};
  if (!name || !slug || !date) return res.status(400).json({ error: 'name, slug and date are required' });
  const festival = await repo.createFestival(req.db, req.body);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'FESTIVAL_CREATED', targetType: 'festival', targetId: festival.id, ip: req.ip });
  res.status(201).json(festival);
}

async function updateFestival(req, res) {
  const festival = await repo.updateFestival(req.db, req.params.id, req.body || {});
  if (!festival) return res.status(404).json({ error: 'Festival not found' });
  res.json(festival);
}

async function deleteFestival(req, res) {
  const ok = await repo.deleteFestival(req.db, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Festival not found' });
  res.json({ ok: true });
}

module.exports = { list, create, update, listFestivals, createFestival, updateFestival, deleteFestival };
