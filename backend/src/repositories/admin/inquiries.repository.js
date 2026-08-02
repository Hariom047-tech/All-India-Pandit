async function list(q, { status, panditSlug, page, perPage }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`i.status = $${params.length}`); }
  if (panditSlug) { params.push(panditSlug); where.push(`p.slug = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT i.id, i.full_name, i.phone, i.email, i.status, i.created_at,
            p.slug AS pandit_slug, u.full_name AS pandit_name, t.name AS temple, sv.name AS service
     FROM inquiries i
     JOIN pandits p ON p.id = i.pandit_id JOIN users u ON u.id = p.user_id
     LEFT JOIN temples t ON t.id = i.temple_id LEFT JOIN services sv ON sv.id = i.service_id
     ${whereSql} ORDER BY i.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM inquiries i JOIN pandits p ON p.id = i.pandit_id ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function getById(q, id) {
  const { rows } = await q(
    `SELECT i.*, p.slug AS pandit_slug, u.full_name AS pandit_name
     FROM inquiries i JOIN pandits p ON p.id = i.pandit_id JOIN users u ON u.id = p.user_id
     WHERE i.id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function setStatus(q, id, status) {
  const { rowCount } = await q('UPDATE inquiries SET status = $2 WHERE id = $1', [id, status]);
  return rowCount > 0;
}

module.exports = { list, getById, setStatus };
