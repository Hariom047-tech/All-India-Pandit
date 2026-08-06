const repo = require('../repositories/pandits.repository');
const leadDistributionRepo = require('../repositories/leadDistribution.repository');
const { readPaging, paginationEnvelope } = require('../utils/paginate');

/** GET /api/pandits — filterable, sortable, paginated list */
async function list(req, res) {
  const paging = readPaging(req.query, 12);
  const { city, service, lang, minExp, minRating, verified, sort, q } = req.query;
  const { data, total } = await repo.list({
    q,
    city: city && [].concat(city),
    service: service && [].concat(service),
    lang: lang && [].concat(lang),
    minExp: minExp ? parseInt(minExp, 10) : undefined,
    minRating: minRating ? parseFloat(minRating) : undefined,
    verified,
    sort,
    page: paging.page,
    perPage: paging.perPage,
  });
  res.json(paginationEnvelope(data, paging, total));
}

/** GET /api/pandits/ranked-order — lightweight {slug, tier, displayScore}[]
 *  for every active verified pandit, ordered by the lead-distribution
 *  fairness engine. No auth, no per-pandit private data — see
 *  leadDistribution.repository.js for the algorithm. The frontend fetches
 *  this once and uses it to order the (locally-bundled) pandit list, so
 *  "who shows at the top" actually reflects fair rotation, not just a
 *  frozen client-side sort. */
async function rankedOrder(req, res) {
  const { pandits } = await leadDistributionRepo.computeFairRanking();
  res.json({
    generatedAt: new Date().toISOString(),
    order: pandits.map((p) => ({ slug: p.slug, tier: p.tier, displayScore: p.displayScore })),
  });
}

/** GET /api/pandits/:id — :id is the pandit's slug (unchanged from the old
 *  text-id scheme; the UUID primary key is exposed separately as `id`). */
async function getById(req, res) {
  const pandit = await repo.getBySlug(req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  res.json(pandit);
}

/** POST /api/pandits/:id/enquiry — the only "action" this API performs on a
 *  profile: recording that a devotee wants to be put in touch. WhatsApp/Call
 *  happen directly, client-side, straight to the pandit's own number. */
async function inquire(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });

  const { name, phone, service, date, message } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const id = await repo.addEnquiry({ panditId, serviceSlug: service, name, phone, date, message });
  res.status(201).json({ ok: true, id });
}

async function trackClick(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });

  const { method } = req.body;
  if (method !== 'call' && method !== 'whatsapp') {
    return res.status(400).json({ error: 'Method must be call or whatsapp' });
  }

  await repo.addContactClick({ panditId, method });
  res.json({ ok: true });
}

async function trackView(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });
  await repo.addView(panditId);
  res.json({ ok: true });
}

module.exports = { list, getById, inquire, rankedOrder, trackClick, trackView };
