const { query } = require('../config/db');

/** Public read: published FAQs for one entity scope, in admin-defined order.
 *  entityId is optional — GLOBAL/HOME rows have none, so it must match NULL
 *  too when the caller doesn't pass one. */
async function listPublic({ entityType, entityId }) {
  const { rows } = await query(
    `SELECT id, question AS q, answer AS a
       FROM universal_faqs
      WHERE status = 'published'
        AND entity_type = $1
        AND entity_id IS NOT DISTINCT FROM $2
      ORDER BY sort_order`,
    [entityType || 'GLOBAL', entityId || null],
  );
  return rows;
}

module.exports = { listPublic };
