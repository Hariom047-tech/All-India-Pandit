const repo = require('../repositories/misc.repository');
const heroRepo = require('../repositories/homeHero.repository');
const servicesRepo = require('../repositories/services.repository');

const plans = async (req, res) => res.json(await repo.plans());
const stats = async (req, res) => res.json(await repo.stats());
const taxonomy = async (req, res) => res.json(await repo.taxonomy());
/** GET /api/home-hero — the three homepage hero images, admin-chosen. */
const homeHero = async (req, res) => res.json(await heroRepo.listPublic());

async function blogList(req, res) {
  const items = await repo.blogList({ q: req.query.q, cat: req.query.cat });
  res.json({ data: items, meta: { total: items.length } });
}

async function blogById(req, res) {
  const post = await repo.blogBySlug(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
}

/** Keyword → suggested services, same table the frontend's AI Pooja Guide ships
 *  inline (assets/js/data.js: PC.recommendRules) — exposed here too so a future
 *  client (mobile app, WhatsApp bot) doesn't have to re-embed the ruleset. */
async function recommend(req, res) {
  const start = Date.now();
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const q = text.toLowerCase();
  const rules = await repo.recommendRules();
  const hits = rules.filter((r) => r.keys.some((k) => q.includes(k)));

  if (!hits.length) {
    await repo.logAiRecommendation({ userId: req.user?.id, text, why: null, serviceIds: [], responseTimeMs: Date.now() - start });
    return res.json({ matched: false, services: [], why: null });
  }

  const serviceIds = [];
  hits.forEach((h) => h.svc.forEach((s) => { if (!serviceIds.includes(s)) serviceIds.push(s); }));

  const suggestions = (await Promise.all(serviceIds.slice(0, 4).map((slug) => servicesRepo.getBySlug(slug)))).filter(Boolean);

  await repo.logAiRecommendation({
    userId: req.user?.id, text, why: hits[0].why, serviceIds: suggestions.map((s) => s.id), responseTimeMs: Date.now() - start,
  });
  res.json({ matched: true, why: hits[0].why, services: suggestions });
}

module.exports = {
  homeHero, plans, stats, taxonomy, blogList, blogById, recommend };
