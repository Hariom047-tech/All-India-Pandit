const { viewerLocationSnapshot } = require('../../services/distribution/market');

/**
 * GET <secret>/geo/viewer-location — verifies CloudFront geo headers are
 * actually reaching this server, for the CloudFront-App-Prod rollout
 * (docs/S3_CLOUDFRONT_MIGRATION.md's sibling geo work).
 *
 * Reads the SAME headers/logic the real eligibility path uses
 * (services/distribution/market.js) — this is a window onto that
 * resolution, not a second implementation of it. Only country/region/city/
 * timezone/device are exposed; deliberately no lat/long, no raw viewer
 * address, no IP — see market.js's viewerLocationSnapshot comment.
 */
function viewerLocation(req, res) {
  res.json(viewerLocationSnapshot(req.headers));
}

module.exports = { viewerLocation };
