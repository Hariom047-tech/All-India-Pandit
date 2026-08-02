async function list(q, { search, role, status, city, state, page, perPage }) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
  if (role) { params.push(role); where.push(`role = $${params.length}`); }
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (city) { params.push(city); where.push(`city = $${params.length}`); }
  if (state) { params.push(state); where.push(`state = $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT id, email, phone, full_name, role, status, city, state, email_verified, phone_verified,
            last_login_at, created_at
     FROM users ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function getById(q, id) {
  const { rows } = await q(
    `SELECT id, email, phone, full_name, role, status, city, state, pincode, email_verified, phone_verified,
            last_login_at, login_count, created_at, updated_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) return null;
  const user = rows[0];

  const { rows: pandit } = await q('SELECT id, slug, verification_status, current_tier FROM pandits WHERE user_id = $1', [id]);
  const { rows: reviewCount } = await q('SELECT COUNT(*)::int AS c FROM reviews WHERE user_id = $1', [id]);
  const { rows: inquiryCount } = await q('SELECT COUNT(*)::int AS c FROM inquiries WHERE user_id = $1', [id]);

  return { ...user, pandit: pandit[0] || null, reviewCount: reviewCount[0].c, inquiryCount: inquiryCount[0].c };
}

async function update(q, id, { fullName, phone, city, state, role }) {
  const { rows } = await q(
    `UPDATE users SET
       full_name = COALESCE($2, full_name), phone = COALESCE($3, phone),
       city = COALESCE($4, city), state = COALESCE($5, state),
       role = COALESCE($6, role)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, full_name, role, status, city, state`,
    [id, fullName, phone, city, state, role],
  );
  return rows[0] || null;
}

async function setStatus(q, id, status) {
  const { rowCount } = await q('UPDATE users SET status = $2 WHERE id = $1 AND deleted_at IS NULL', [id, status]);
  return rowCount > 0;
}

async function revokeAllSessions(q, id) {
  await q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
}

async function softDelete(q, id) {
  await q(
    `UPDATE users SET deleted_at = NOW(), email = 'deleted-' || id || '@panditconnect.invalid',
            phone = NULL, full_name = 'Deleted User'
     WHERE id = $1`,
    [id],
  );
  await q('UPDATE pandits SET deleted_at = NOW(), is_available = FALSE WHERE user_id = $1', [id]);
  await revokeAllSessions(q, id);
}

module.exports = { list, getById, update, setStatus, revokeAllSessions, softDelete };
