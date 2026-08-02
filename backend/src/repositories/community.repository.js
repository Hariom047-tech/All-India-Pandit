const { query } = require('../config/db');

async function list({ category, page, perPage }) {
  const where = ["status = 'published'"];
  const params = [];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  params.push(perPage, (page - 1) * perPage);
  const { rows } = await query(
    `SELECT p.id, p.title, p.category, u.full_name AS author, p.view_count, p.like_count, p.comment_count,
            p.is_pinned, p.created_at
     FROM community_posts p JOIN users u ON u.id = p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM community_posts p WHERE ${where.join(' AND ')}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function create({ userId, title, body, category }) {
  const { rows } = await query(
    `INSERT INTO community_posts (user_id, title, body, category) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, title, body, category || null],
  );
  return rows[0].id;
}

async function getById(id) {
  const { rows } = await query(
    `SELECT p.id, p.title, p.body, p.category, u.full_name AS author, p.view_count, p.like_count,
            p.comment_count, p.created_at
     FROM community_posts p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND p.status = 'published'`,
    [id],
  );
  if (!rows[0]) return null;
  await query('UPDATE community_posts SET view_count = view_count + 1 WHERE id = $1', [id]);

  const { rows: comments } = await query(
    `SELECT c.id, c.parent_id, c.body, u.full_name AS author, c.like_count, c.created_at
     FROM community_comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1 AND c.status = 'published' ORDER BY c.created_at`,
    [id],
  );
  return { ...rows[0], comments };
}

async function exists(id) {
  const { rows } = await query("SELECT 1 FROM community_posts WHERE id = $1 AND status = 'published'", [id]);
  return !!rows[0];
}

async function addComment({ postId, userId, body, parentId }) {
  const { rows } = await query(
    `INSERT INTO community_comments (post_id, user_id, body, parent_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [postId, userId, body, parentId || null],
  );
  await query('UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
  return rows[0].id;
}

module.exports = { list, create, getById, exists, addComment };
