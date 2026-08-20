const repo = require('../repositories/reviews.repository');
const { removePhoto } = require('../middleware/upload');

const TARGET_TYPES = ['pandit', 'temple', 'platform'];

/**
 * GET /api/reviews
 *   ?targetType=pandit&targetSlug=…   one pandit's reviews
 *   ?targetType=platform              reviews of PanditSuggest itself
 *   (omit both)                       the homepage testimonial feed
 */
async function list(req, res) {
  const { targetType, targetSlug } = req.query;
  if (targetType && !TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: `targetType must be one of: ${TARGET_TYPES.join(', ')}` });
  }
  res.json(await repo.list({ targetType, targetSlug }));
}

/**
 * POST /api/reviews — multipart, up to 5 photos.
 *
 * Gated the same way a qualified lead is: the reviewer must be logged in,
 * active and mobile-verified. An unverified account posting reviews is the
 * cheapest possible way to manufacture reputation, and the whole product
 * rests on those star ratings meaning something.
 */
async function create(req, res) {
  const photoUrls = (req.files || []).map((f) => f.mediaUrl);
  // Any rejection below must not leave uploaded files orphaned (disk or S3).
  const fail = (status, error) => {
    photoUrls.forEach(removePhoto);
    return res.status(status).json({ error });
  };

  const { targetType, targetSlug, rating, title, body, service } = req.body || {};

  if (!TARGET_TYPES.includes(targetType)) {
    return fail(400, `targetType must be one of: ${TARGET_TYPES.join(', ')}`);
  }
  if (targetType !== 'platform' && !targetSlug) {
    return fail(400, 'targetSlug is required for a pandit or temple review');
  }

  const ratingNum = parseInt(rating, 10);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return fail(400, 'rating must be an integer from 1 to 5');
  }
  if (body && String(body).length > 4000) return fail(400, 'Review is too long.');

  // Verification gate — mirrors the qualified-lead rule.
  if (req.user.status && req.user.status !== 'active') {
    return fail(403, 'Yeh account abhi active nahi hai.');
  }
  // Google sign-in users have email_verified=true (Google authenticates the email).
  // Phone OTP users have phone_verified=true. Either is sufficient.
  const isVerified = req.user.phone_verified || req.user.email_verified;
  if (!isVerified) {
    photoUrls.forEach(removePhoto);
    return res.status(403).json({
      error: 'Review likhne ke liye pehle apna mobile verify karein.',
      code: 'phone_not_verified',   // the UI routes to OTP verification on this
    });
  }

  const targetId = await repo.resolveTargetId(targetType, targetSlug);
  if (targetType !== 'platform' && !targetId) return fail(404, `${targetType} not found`);

  // A pandit rating their own profile is not a review.
  if (targetType === 'pandit' && await repo.ownsPandit(req.user.id, targetId)) {
    return fail(400, 'Aap apni hi profile ko review nahi kar sakte.');
  }

  if (await repo.alreadyReviewed(req.user.id, targetType, targetId)) {
    return fail(409, 'Aap pehle hi review de chuke hain.');
  }

  const id = await repo.create({
    userId: req.user.id, targetType, targetId,
    rating: ratingNum, title, body, serviceSlug: service, photoUrls,
  });
  res.status(201).json({ ok: true, id });
}

module.exports = { list, create };
