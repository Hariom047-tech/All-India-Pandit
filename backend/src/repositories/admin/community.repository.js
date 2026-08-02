async function listPosts(q, { status, page, perPage }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT p.id, p.title, p.category, p.status, u.full_name AS author, p.comment_count, p.created_at
     FROM community_posts p JOIN users u ON u.id = p.user_id
     ${whereSql} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM community_posts p ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function moderatePost(q, id, status) {
  const { rowCount } = await q('UPDATE community_posts SET status = $2 WHERE id = $1', [id, status]);
  return rowCount > 0;
}

async function moderateComment(q, id, status) {
  const { rowCount } = await q('UPDATE community_comments SET status = $2 WHERE id = $1', [id, status]);
  return rowCount > 0;
}

module.exports = { listPosts, moderatePost, moderateComment };
