const repo = require('../repositories/temples.repository');
const panditsRepo = require('../repositories/pandits.repository');
const { readPaging, paginationEnvelope } = require('../utils/paginate');
const { browsingMarketFor } = require('../services/distribution/market');

/** GET /api/temples — filterable, sortable, paginated list.
 *  maxPerPage raised so pages that fetch one batch for client-side
 *  filtering (Search, TempleDetail, TempleMap) can get every temple —
 *  see the matching comment on pandits.controller.js:list. */
async function list(req, res) {
  const paging = readPaging(req.query, 9, 500);
  const { city, state, service, minRating, sort, q } = req.query;
  const { data, total } = await repo.list({
    q,
    city: city && [].concat(city),
    state: state && [].concat(state),
    service: service && [].concat(service),
    minRating: minRating ? parseFloat(minRating) : undefined,
    sort,
    page: paging.page,
    perPage: paging.perPage,
  });
  res.json(paginationEnvelope(data, paging, total));
}

/** GET /api/temples/:id — :id is the temple's slug */
async function getById(req, res) {
  const { market } = browsingMarketFor(req, typeof req.query.country === 'string' ? req.query.country : null);
  const temple = await repo.getBySlug(req.params.id, market);
  if (!temple) return res.status(404).json({ error: 'Temple not found' });
  res.json(temple);
}

/** POST /api/temples/:id/inquiry — recorded, then it is on the devotee and
 *  pandit ji to take it from here. We never insert ourselves as a booking step. */
async function inquire(req, res) {
  const templeId = await repo.findIdBySlug(req.params.id);
  if (!templeId) return res.status(404).json({ error: 'Temple not found' });

  const { name, phone, service, date, message } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const { market } = browsingMarketFor(req, typeof req.query.country === 'string' ? req.query.country : null);
  const panditId = await panditsRepo.pickForTemple(templeId, service, market);
  if (!panditId) return res.status(422).json({ error: 'This temple has no associated pandit to route the inquiry to' });

  const id = await repo.addInquiry({ templeId, panditId, serviceSlug: service, name, phone, date, message });
  res.status(201).json({ ok: true, id });
}

module.exports = { list, getById, inquire };
