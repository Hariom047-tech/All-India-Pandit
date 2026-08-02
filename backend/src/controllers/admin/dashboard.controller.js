const repo = require('../../repositories/admin/dashboard.repository');

const stats = async (req, res) => res.json(await repo.stats(req.db));
const recentActivity = async (req, res) => res.json(await repo.recentActivity(req.db));

module.exports = { stats, recentActivity };
