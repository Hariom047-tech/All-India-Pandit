async function list(q, { reviewableType, rating, isApproved, isFlagged, page, perPage }) {
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  if (reviewableType) { params.push(reviewableType); where.push(`r.reviewable_type = $${params.length}`); }
  if (rating) { params.push(rating); where.push(`r.rating = $${params.length}`); }
  if (isApproved !== undefined) { params.push(isApproved === 'true'); where.push(`r.is_approved = $${params.length}`); }
  if (isFlagged !== undefined) { params.push(isFlagged === 'true'); where.push(`r.is_flagged = $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT r.id, r.reviewable_type, r.rating, r.title, r.body, r.is_approved, r.is_flagged, r.flag_reason,
            u.full_name AS author, r.created_at
     FROM reviews r JOIN users u ON u.id = r.user_id
     ${whereSql} ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM reviews r ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function flagged(q) {
  const { rows } = await q(
    `SELECT r.id, r.reviewable_type, r.rating, r.title, r.body, r.flag_reason, u.full_name AS author, r.created_at
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.is_flagged = TRUE AND r.deleted_at IS NULL ORDER BY r.created_at DESC`,
  );
  return rows;
}

async function moderate(q, id, action) {
  let sql;
  if (action === 'approve') sql = `UPDATE reviews SET is_approved = TRUE, is_flagged = FALSE WHERE id = $1`;
  else if (action === 'reject') sql = `UPDATE reviews SET is_approved = FALSE, is_flagged = FALSE WHERE id = $1`;
  else if (action === 'delete') sql = `UPDATE reviews SET deleted_at = NOW() WHERE id = $1`;
  else return false;
  const { rowCount } = await q(sql, [id]);
  return rowCount > 0;
}

async function bulkModerate(q, ids, action) {
  let done = 0;
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    if (await moderate(q, id, action)) done += 1;
  }
  return done;
}

module.exports = { list, flagged, moderate, bulkModerate };
