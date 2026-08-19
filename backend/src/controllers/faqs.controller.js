const repo = require('../repositories/faqs.repository');

/** GET /api/faqs?entityType=GLOBAL&entityId=... — defaults to GLOBAL so the
 *  existing Contact-page call (no query params) keeps working unchanged. */
async function list(req, res) {
  const { entityType, entityId } = req.query;
  res.json(await repo.listPublic({ entityType, entityId }));
}

module.exports = { list };
