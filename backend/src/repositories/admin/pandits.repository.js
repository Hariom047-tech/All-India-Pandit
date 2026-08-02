async function list(q, { search, verificationStatus, tier, isFeatured, city, minRating, page, perPage }) {
  const where = ['p.deleted_at IS NULL'];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(u.full_name ILIKE $${params.length} OR p.slug ILIKE $${params.length})`); }
  if (verificationStatus) { params.push(verificationStatus); where.push(`p.verification_status = $${params.length}`); }
  if (tier) { params.push(tier); where.push(`p.current_tier = $${params.length}`); }
  if (isFeatured !== undefined) { params.push(isFeatured === 'true'); where.push(`p.is_featured = $${params.length}`); }
  if (city) { params.push(city); where.push(`u.city = $${params.length}`); }
  if (minRating) { params.push(minRating); where.push(`p.avg_rating >= $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT p.id, p.slug, u.full_name AS name, u.city, u.state, p.verification_status, p.current_tier,
            p.avg_rating, p.review_count, p.is_featured, p.is_available, p.rank_score, p.created_at
     FROM pandits p JOIN users u ON u.id = p.user_id
     ${whereSql} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM pandits p JOIN users u ON u.id = p.user_id ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function verificationQueue(q) {
  const { rows } = await q(
    `SELECT p.id, p.slug, u.full_name AS name, u.email, u.phone, p.verification_status,
            p.id_proof_type, p.video_kyc_completed, p.created_at
     FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.verification_status IN ('documents_submitted', 'under_review') AND p.deleted_at IS NULL
     ORDER BY p.created_at`,
  );
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const { rows: certs } = await q(
    'SELECT pandit_id, certificate_name, institution, year_obtained, document_url FROM pandit_certificates WHERE pandit_id = ANY($1)',
    [ids],
  );
  return rows.map((p) => ({ ...p, certificates: certs.filter((c) => c.pandit_id === p.id) }));
}

async function findIdBySlug(q, slug) {
  const { rows } = await q('SELECT id, user_id FROM pandits WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function setVerification(q, id, { status, verifiedBy }) {
  // $2 needs two different implied types (verification_status enum for the
  // assignment, text for the CASE comparison) — Postgres can't reconcile
  // that without explicit casts on each usage ("inconsistent types deduced
  // for parameter $2" otherwise).
  const { rowCount } = await q(
    `UPDATE pandits SET verification_status = $2::verification_status,
            verified_at = CASE WHEN $2::text = 'verified' THEN NOW() ELSE verified_at END,
            verified_by = CASE WHEN $2::text = 'verified' THEN $3 ELSE verified_by END
     WHERE id = $1`,
    [id, status, verifiedBy],
  );
  if (rowCount > 0) await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [id]);
  return rowCount > 0;
}

async function toggleFeatured(q, id, featured, featuredUntil) {
  const { rowCount } = await q('UPDATE pandits SET is_featured = $2, featured_until = $3 WHERE id = $1', [id, featured, featuredUntil || null]);
  return rowCount > 0;
}

async function setTier(q, id, tier, expiresAt) {
  const { rowCount } = await q('UPDATE pandits SET current_tier = $2, subscription_expires_at = $3 WHERE id = $1', [id, tier, expiresAt || null]);
  if (rowCount > 0) await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [id]);
  return rowCount > 0;
}

async function analytics(q, id, days = 30) {
  const { rows } = await q(
    `SELECT date, profile_views, whatsapp_clicks, call_clicks, message_clicks, inquiry_count, review_count
     FROM pandit_analytics WHERE pandit_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval
     ORDER BY date`,
    [id, days],
  );
  return rows;
}

async function notifyUser(q, panditUserId, { type, title, body }) {
  await q(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)`,
    [panditUserId, type, title, body],
  );
}

module.exports = { list, verificationQueue, findIdBySlug, setVerification, toggleFeatured, setTier, analytics, notifyUser };
