async function listPosts(q, { status, page, perPage }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT id, slug, title, category, status, published_at, view_count, created_at
     FROM blog_posts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM blog_posts ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function create(q, authorId, p) {
  const { rows } = await q(
    `INSERT INTO blog_posts (author_id, title, slug, excerpt, body, cover_image_url, category, tags, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING id, slug`,
    [authorId, p.title, p.slug, p.excerpt || null, p.body, p.coverImageUrl || null, p.category || null, p.tags || null],
  );
  return rows[0];
}

async function update(q, slug, fields) {
  const { rows } = await q(
    `UPDATE blog_posts SET
       title = COALESCE($2, title), excerpt = COALESCE($3, excerpt), body = COALESCE($4, body),
       category = COALESCE($5, category)
     WHERE slug = $1 RETURNING *`,
    [slug, fields.title, fields.excerpt, fields.body, fields.category],
  );
  return rows[0] || null;
}

async function softDelete(q, slug) {
  const { rowCount } = await q(`UPDATE blog_posts SET status = 'removed' WHERE slug = $1`, [slug]);
  return rowCount > 0;
}

// $2 needs two different implied types (content_status enum for the
// assignment, text for the CASE comparison) — same fix as
// pandits.repository.js's setVerification: explicit casts on each usage.
async function setPublished(q, slug, published) {
  const { rowCount } = await q(
    `UPDATE blog_posts SET status = $2::content_status,
            published_at = CASE WHEN $2::text = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END
     WHERE slug = $1`,
    [slug, published ? 'published' : 'archived'],
  );
  return rowCount > 0;
}

module.exports = { listPosts, create, update, softDelete, setPublished };
