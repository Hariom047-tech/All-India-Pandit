const repo = require('../../repositories/admin/settings.repository');
const { logAdminAction } = require('../../utils/adminLog');

const getAll = async (req, res) => res.json(await repo.getAll(req.db));

async function upsert(req, res) {
  const { value, description } = req.body || {};
  if (value === undefined) return res.status(400).json({ error: 'value is required' });
  const setting = await repo.upsert(req.db, req.params.key, value, description, req.adminUser.id);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SETTINGS_UPDATED', targetType: 'platform_setting', details: { key: req.params.key, value }, ip: req.ip });
  res.json(setting);
}

module.exports = { getAll, upsert };
