const crypto = require('crypto');

/**
 * Origin trust gate — defense in depth alongside the AWS-side network lock.
 *
 * The whole reason `req.geo` (services/distribution/market.js) can trust
 * CloudFront-Viewer-Country is the assumption that this server is
 * unreachable except through CloudFront. That assumption has to be enforced
 * at the network layer (security group / ALB listener rule restricting
 * inbound to CloudFront's managed prefix list, com.amazonaws.global.cloudfront.origin-facing)
 * — no header proves a request's network path, so that AWS-side lock is not
 * optional and this middleware does not replace it.
 *
 * ORIGIN_SHARED_SECRET is a second, independent check on top of it:
 * CloudFront is configured to attach a custom origin header carrying a value
 * only CloudFront and this server know (Origin Custom Header, on the
 * distribution's origin config). A request missing it, or carrying the
 * wrong value, could not have come through a correctly configured
 * CloudFront — so it is rejected here, before country/market resolution
 * (or anything else) ever runs, rather than silently trusting a forged
 * CloudFront-Viewer-Country from someone hitting this server directly.
 *
 * Opt-in and off by default, exactly like TRUST_CDN_GEO: unset, this is a
 * no-op, so local dev and any deployment that has not yet configured
 * CloudFront's custom header keeps working exactly as before.
 */
function verifyOrigin(req, res, next) {
  const secret = process.env.ORIGIN_SHARED_SECRET;
  if (!secret) return next();

  const provided = req.headers['x-origin-verify'];
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(secret);
  // Length must match before timingSafeEqual — it throws on mismatched
  // lengths rather than returning false.
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (matches) return next();

  res.status(403).json({ error: 'Forbidden' });
}

module.exports = { verifyOrigin };
