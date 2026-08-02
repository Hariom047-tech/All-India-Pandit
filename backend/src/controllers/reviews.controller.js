const repo = require('../repositories/reviews.repository');

/** GET /api/reviews?targetType=pandit&targetSlug=ramesh-sharma — omit both for
 *  the general homepage testimonial feed. */
async function list(req, res) {
  const { targetType, targetSlug } = req.query;
  if (targetType && !['pandit', 'temple'].includes(targetType)) {
    return res.status(400).json({ error: 'targetType must be "pandit" or "temple"' });
  }
  res.json(await repo.list({ targetType, targetSlug }));
}

/** POST /api/reviews — requires auth; reviews.repository.create() firing
 *  trg_review_stats recalculates the target's avg_rating/review_count. */
async function create(req, res) {
  const { targetType, targetSlug, rating, title, body, service } = req.body || {};
  if (!['pandit', 'temple'].includes(targetType) || !targetSlug) {
    return res.status(400).json({ error: 'targetType ("pandit" or "temple") and targetSlug are required' });
  }
  const ratingNum = parseInt(rating, 10);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
  }

  const targetId = await repo.resolveTargetId(targetType, targetSlug);
  if (!targetId) return res.status(404).json({ error: `${targetType} not found` });

  const id = await repo.create({
    userId: req.user.id, targetType, targetId, rating: ratingNum, title, body, serviceSlug: service,
  });
  res.status(201).json({ ok: true, id });
}

module.exports = { list, create };
