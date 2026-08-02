const repo = require('../../repositories/admin/analytics.repository');

const parseDays = (period) => parseInt(String(period || '30d').replace(/\D/g, ''), 10) || 30;

const overview = async (req, res) => res.json(await repo.overview(req.db, parseDays(req.query.period)));
const topPandits = async (req, res) => res.json(await repo.topPandits(req.db, parseInt(req.query.limit, 10) || 10));
const topTemples = async (req, res) => res.json(await repo.topTemples(req.db, parseInt(req.query.limit, 10) || 10));
const topServices = async (req, res) => res.json(await repo.topServices(req.db, parseInt(req.query.limit, 10) || 10));
const topCities = async (req, res) => res.json(await repo.topCities(req.db, parseInt(req.query.limit, 10) || 10));
const funnel = async (req, res) => res.json(await repo.funnel(req.db));

module.exports = { overview, topPandits, topTemples, topServices, topCities, funnel };
