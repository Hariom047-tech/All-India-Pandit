const repo = require('../repositories/services.repository');
const panditsRepo = require('../repositories/pandits.repository');
const templesRepo = require('../repositories/temples.repository');
const { browsingMarketFor } = require('../services/distribution/market');

/** GET /api/services?cat=&q= — no pagination; ~50 rows is small enough to send whole */
async function list(req, res) {
  const items = await repo.list({ q: req.query.q, cat: req.query.cat, online: req.query.online });
  res.json({ data: items, meta: { total: items.length } });
}

/** GET /api/services/:id — :id is the service's slug; includes the pandits
 *  and temples that offer it */
async function getById(req, res) {
  const service = await repo.getBySlug(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const { market } = browsingMarketFor(req, typeof req.query.country === 'string' ? req.query.country : null);
  const [pandits, temples, onlinePandits] = await Promise.all([
    panditsRepo.forService(service.slug, market),
    templesRepo.forService(service.slug),
    // Only the pandits an admin has explicitly allocated to perform THIS
    // service online — not everyone mapped to it.
    panditsRepo.forServiceOnline(service.slug, market),
  ]);
  res.json({ ...service, pandits, temples, onlinePandits });
}

/** GET /api/services/categories — the admin-curated "Most booked" strip. */
async function homeCategories(req, res) {
  res.json(await repo.homeCategories());
}

module.exports = {
  homeCategories, list, getById };
