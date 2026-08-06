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

/** Full profile, hydrated with the joined user fields plus languages/
 *  services/temples — what the admin edit form loads and what update()
 *  below returns after saving. */
async function getFullById(q, id) {
  const { rows } = await q(
    `SELECT p.id, p.slug, p.title, p.bio, p.short_bio, p.experience_years, p.primary_specialization,
            p.specializations, p.whatsapp_number, p.public_phone, p.public_email,
            p.verification_status, p.current_tier, p.is_featured, p.is_available, p.avg_rating, p.review_count,
            u.id AS user_id, u.full_name AS name, u.email, u.phone, u.city, u.state
     FROM pandits p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const pandit = rows[0];
  const { rows: langs } = await q('SELECT language FROM pandit_languages WHERE pandit_id = $1 ORDER BY language', [id]);
  const { rows: services } = await q(
    `SELECT s.slug, s.name FROM pandit_services ps JOIN services s ON s.id = ps.service_id
     WHERE ps.pandit_id = $1 AND ps.is_active = TRUE ORDER BY s.name`,
    [id],
  );
  const { rows: temples } = await q(
    `SELECT t.slug, t.name, pt.association_type, pt.is_primary FROM pandit_temples pt JOIN temples t ON t.id = pt.temple_id
     WHERE pt.pandit_id = $1 AND pt.is_active = TRUE ORDER BY t.name`,
    [id],
  );
  return { ...pandit, languages: langs.map((l) => l.language), services, temples };
}

/** users + pandits are both RLS-scoped (see docs/ADMIN.md) — q here must be
 *  req.db (the admin-context-bound query fn), never the plain `query` import. */
async function update(q, id, userId, fields) {
  const userSets = [];
  const userParams = [userId];
  const userMap = { name: 'full_name', city: 'city', state: 'state', phone: 'phone' };
  for (const [key, column] of Object.entries(userMap)) {
    if (fields[key] !== undefined) { userParams.push(fields[key]); userSets.push(`${column} = $${userParams.length}`); }
  }
  if (userSets.length) await q(`UPDATE users SET ${userSets.join(', ')} WHERE id = $1`, userParams);

  const panditSets = [];
  const panditParams = [id];
  const panditMap = {
    bio: 'bio', shortBio: 'short_bio', experienceYears: 'experience_years',
    primarySpecialization: 'primary_specialization', whatsappNumber: 'whatsapp_number',
    publicPhone: 'public_phone', isAvailable: 'is_available',
  };
  for (const [key, column] of Object.entries(panditMap)) {
    if (fields[key] !== undefined) { panditParams.push(fields[key]); panditSets.push(`${column} = $${panditParams.length}`); }
  }
  if (fields.specializations !== undefined) { panditParams.push(fields.specializations); panditSets.push(`specializations = $${panditParams.length}`); }
  if (panditSets.length) await q(`UPDATE pandits SET ${panditSets.join(', ')} WHERE id = $1`, panditParams);

  if (Array.isArray(fields.languages)) {
    await q('DELETE FROM pandit_languages WHERE pandit_id = $1', [id]);
    for (const language of fields.languages) {
      await q('INSERT INTO pandit_languages (pandit_id, language) VALUES ($1, $2) ON CONFLICT (pandit_id, language) DO NOTHING', [id, language]);
    }
  }
}

/** Replace-all sync — service/temple slugs that don't resolve to a real row
 *  are silently skipped (the `SELECT ... WHERE slug = $2` finds nothing to
 *  insert) rather than failing the whole request over one typo. */
async function syncServices(q, panditId, serviceSlugs) {
  await q('DELETE FROM pandit_services WHERE pandit_id = $1', [panditId]);
  for (const slug of serviceSlugs) {
    await q(
      `INSERT INTO pandit_services (pandit_id, service_id)
       SELECT $1, id FROM services WHERE slug = $2
       ON CONFLICT (pandit_id, service_id) DO UPDATE SET is_active = TRUE`,
      [panditId, slug],
    );
  }
}

async function syncTemples(q, panditId, templeSlugs) {
  await q('DELETE FROM pandit_temples WHERE pandit_id = $1', [panditId]);
  for (const slug of templeSlugs) {
    await q(
      `INSERT INTO pandit_temples (pandit_id, temple_id)
       SELECT $1, id FROM temples WHERE slug = $2
       ON CONFLICT (pandit_id, temple_id) DO UPDATE SET is_active = TRUE`,
      [panditId, slug],
    );
  }
}

module.exports = {
  list, verificationQueue, findIdBySlug, setVerification, toggleFeatured, setTier, analytics, notifyUser,
  getFullById, update, syncServices, syncTemples,
};
