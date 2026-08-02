async function list(q, { search, city, state, isActive, page, perPage }) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR city ILIKE $${params.length})`); }
  if (city) { params.push(city); where.push(`city = $${params.length}`); }
  if (state) { params.push(state); where.push(`state = $${params.length}`); }
  if (isActive !== undefined) { params.push(isActive === 'true'); where.push(`is_active = $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT id, slug, name, city, state, primary_deity, avg_rating, review_count, pandit_count, is_verified, is_featured, is_active, created_at
     FROM temples ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM temples ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function getBySlug(q, slug) {
  const { rows } = await q('SELECT * FROM temples WHERE slug = $1 AND deleted_at IS NULL', [slug]);
  return rows[0] || null;
}

async function create(q, t) {
  const { rows } = await q(
    `INSERT INTO temples (name, slug, description, short_description, primary_deity, address_line1, city, state, latitude, longitude, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE) RETURNING id, slug`,
    [t.name, t.slug, t.description || null, t.shortDescription || null, t.primaryDeity || null,
      t.addressLine1, t.city, t.state, t.latitude, t.longitude],
  );
  return rows[0];
}

async function update(q, slug, fields) {
  const sets = [];
  const params = [slug];
  const map = {
    name: 'name', description: 'description', shortDescription: 'short_description', primaryDeity: 'primary_deity',
    city: 'city', state: 'state', latitude: 'latitude', longitude: 'longitude', isVerified: 'is_verified',
  };
  for (const [key, column] of Object.entries(map)) {
    if (fields[key] !== undefined) { params.push(fields[key]); sets.push(`${column} = $${params.length}`); }
  }
  if (!sets.length) return getBySlug(q, slug);
  const { rows } = await q(`UPDATE temples SET ${sets.join(', ')} WHERE slug = $1 RETURNING *`, params);
  return rows[0] || null;
}

async function setActive(q, slug, isActive) {
  const { rowCount } = await q('UPDATE temples SET is_active = $2 WHERE slug = $1', [slug, isActive]);
  return rowCount > 0;
}

async function setTimings(q, templeId, timings) {
  for (const t of timings) {
    await q(
      `INSERT INTO temple_timings (temple_id, day, morning_open, morning_close, evening_open, evening_close, is_closed, special_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (temple_id, day) DO UPDATE SET
         morning_open = EXCLUDED.morning_open, morning_close = EXCLUDED.morning_close,
         evening_open = EXCLUDED.evening_open, evening_close = EXCLUDED.evening_close,
         is_closed = EXCLUDED.is_closed, special_note = EXCLUDED.special_note`,
      [templeId, t.day, t.morningOpen || null, t.morningClose || null, t.eveningOpen || null, t.eveningClose || null, !!t.isClosed, t.specialNote || null],
    );
  }
}

async function mapPandit(q, templeId, panditId, associationType) {
  await q(
    `INSERT INTO pandit_temples (pandit_id, temple_id, association_type) VALUES ($1, $2, $3)
     ON CONFLICT (pandit_id, temple_id) DO UPDATE SET association_type = EXCLUDED.association_type, is_active = TRUE`,
    [panditId, templeId, associationType || 'visiting'],
  );
}

module.exports = { list, getBySlug, create, update, setActive, setTimings, mapPandit };
