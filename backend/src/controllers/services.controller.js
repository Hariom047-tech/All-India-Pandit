const repo = require('../repositories/services.repository');
const panditsRepo = require('../repositories/pandits.repository');
const templesRepo = require('../repositories/temples.repository');

/** GET /api/services?cat=&q= — no pagination; ~50 rows is small enough to send whole */
async function list(req, res) {
  const items = await repo.list({ q: req.query.q, cat: req.query.cat });
  res.json({ data: items, meta: { total: items.length } });
}

/** GET /api/services/:id — :id is the service's slug; includes the pandits
 *  and temples that offer it */
async function getById(req, res) {
  const service = await repo.getBySlug(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const [pandits, temples] = await Promise.all([
    panditsRepo.forService(service.slug),
    templesRepo.forService(service.slug),
  ]);
  res.json({ ...service, pandits, temples });
}

module.exports = { list, getById };
