/** Universal FAQ CMS — admin CRUD over universal_faqs (25-universal-faqs.sql).
 *  Every function here takes req.db (the RLS-context-bound query function
 *  from adminHandler), never plain query() — universal_faqs has RLS enabled,
 *  so writes made outside that context are silently rejected by Postgres. */

async function list(q, { entityType, status, search, page, perPage }) {
  const where = [];
  const params = [];
  if (entityType) { params.push(entityType); where.push(`f.entity_type = $${params.length}`); }
  if (status) { params.push(status); where.push(`f.status = $${params.length}::content_status`); }
  if (search) { params.push(`%${search}%`); where.push(`f.question ILIKE $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // entity_id is polymorphic (temple/service/pandit id depending on
  // entity_type, NULL for GLOBAL/HOME) — resolve a display name via
  // conditional joins so the admin list never has to show a bare UUID.
  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT f.id, f.entity_type, f.entity_id, f.question, f.answer, f.slug, f.status, f.sort_order,
            f.created_at, f.updated_at,
            COALESCE(t.name, s.name, u.full_name) AS entity_name
       FROM universal_faqs f
       LEFT JOIN temples t ON f.entity_type = 'TEMPLE' AND t.id = f.entity_id
       LEFT JOIN services s ON f.entity_type = 'SERVICE' AND s.id = f.entity_id
       LEFT JOIN pandits p ON f.entity_type = 'PANDIT' AND p.id = f.entity_id
       LEFT JOIN users u ON u.id = p.user_id
       ${whereSql}
      ORDER BY f.entity_type, f.sort_order
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM universal_faqs f ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function getById(q, id) {
  const { rows } = await q('SELECT * FROM universal_faqs WHERE id = $1', [id]);
  return rows[0] || null;
}

async function nextSortOrder(q, entityType, entityId) {
  const { rows } = await q(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM universal_faqs WHERE entity_type = $1 AND entity_id IS NOT DISTINCT FROM $2`,
    [entityType, entityId || null],
  );
  return rows[0].next;
}

async function create(q, { entityType, entityId, question, answer, slug, status, adminUserId }) {
  const sortOrder = await nextSortOrder(q, entityType, entityId || null);
  const { rows } = await q(
    `INSERT INTO universal_faqs
       (entity_type, entity_id, question, answer, slug, status, sort_order, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::content_status, 'draft'), $7, $8, $8)
     RETURNING *`,
    [entityType, entityId || null, question, answer, slug || null, status, sortOrder, adminUserId],
  );
  return rows[0];
}

async function update(q, id, { question, answer, slug, sortOrder, adminUserId }) {
  const { rows } = await q(
    `UPDATE universal_faqs SET
       question   = COALESCE($2, question),
       answer     = COALESCE($3, answer),
       slug       = COALESCE($4, slug),
       sort_order = COALESCE($5, sort_order),
       updated_by = $6
     WHERE id = $1 RETURNING *`,
    [id, question, answer, slug, sortOrder, adminUserId],
  );
  return rows[0] || null;
}

async function setStatus(q, id, status, adminUserId) {
  const { rows } = await q(
    `UPDATE universal_faqs SET status = $2::content_status, updated_by = $3 WHERE id = $1 RETURNING *`,
    [id, status, adminUserId],
  );
  return rows[0] || null;
}

/** Reorders within one entity scope only — orderedIds must all share the
 *  same entity_type/entity_id, matching the admin UI's scoped list view. */
async function reorder(q, entityType, entityId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await q(
      `UPDATE universal_faqs SET sort_order = $3
        WHERE id = $1 AND entity_type = $2 AND entity_id IS NOT DISTINCT FROM $4`,
      [orderedIds[i], entityType, i, entityId || null],
    );
  }
  return list(q, { entityType, page: 1, perPage: orderedIds.length });
}

async function remove(q, id) {
  const { rowCount } = await q('DELETE FROM universal_faqs WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, getById, create, update, setStatus, reorder, remove };
