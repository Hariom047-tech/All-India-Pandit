/** Highlights are a plain ordered string list; anything falsy is dropped. */
function highlightsOrNull(value) {
  if (value === undefined) return null;                 // omitted -> keep existing
  if (!Array.isArray(value)) return JSON.stringify([]);
  return JSON.stringify(
    value.map((h) => String(typeof h === 'string' ? h : h?.text ?? '').trim())
      .filter(Boolean)
      .slice(0, 30),
  );
}

/**
 * Custom services — rituals particular to one temple, with no catalogue entry.
 *
 * Normalised here rather than trusted from the client: migration 11 puts a
 * CHECK on the column shape, so an unnamed row or a bare string would be
 * rejected by Postgres with an opaque constraint error. Dropping them quietly
 * at the edge is kinder than failing the admin's whole save.
 */
function customServicesOrNull(value) {
  if (value === undefined) return null;                 // omitted -> keep existing
  if (!Array.isArray(value)) return JSON.stringify([]);
  return JSON.stringify(
    value
      .map((s) => ({
        name: String(typeof s === 'string' ? s : s?.name ?? '').trim().slice(0, 120),
        description: String(s?.description ?? '').trim().slice(0, 400),
      }))
      // A nameless entry would render as an empty card on the public page.
      .filter((s) => s.name)
      .slice(0, 30),
  );
}

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
  // Defensive: SELECT * avoids crashing on missing columns, but we
  // normalise missing columns to safe defaults in the caller.
  const { rows } = await q('SELECT * FROM temples WHERE slug = $1 AND deleted_at IS NULL', [slug]);
  if (!rows[0]) return null;
  // If migration 11 hasn't run yet, custom_services won't be in the row.
  if (rows[0].custom_services === undefined) rows[0].custom_services = [];
  return rows[0];
}

async function create(q, t) {
  const { rows } = await q(
    `INSERT INTO temples
       (name, slug, description, short_description, primary_deity, address_line1,
        city, state, latitude, longitude, established_year, history, significance,
        highlights, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             COALESCE($14::jsonb, '[]'::jsonb), TRUE)
     RETURNING id, slug`,
    [t.name, t.slug, t.description || null, t.shortDescription || null, t.primaryDeity || null,
      t.addressLine1, t.city, t.state, t.latitude, t.longitude,
      t.establishedYear || null, t.history || null, t.significance || null,
      highlightsOrNull(t.highlights)],
  );
  return rows[0];
}

async function update(q, slug, fields) {
  const sets = [];
  const params = [slug];
  const map = {
    name: 'name', description: 'description', shortDescription: 'short_description', primaryDeity: 'primary_deity',
    addressLine1: 'address_line1',
    city: 'city', state: 'state', latitude: 'latitude', longitude: 'longitude', isVerified: 'is_verified',
    // Admin-editable Overview content (migration 05).
    establishedYear: 'established_year', history: 'history', significance: 'significance',
  };
  for (const [key, column] of Object.entries(map)) {
    if (fields[key] !== undefined) { params.push(fields[key]); sets.push(`${column} = $${params.length}`); }
  }
  // highlights needs a jsonb cast, so it cannot ride the generic map above.
  const highlights = highlightsOrNull(fields.highlights);
  if (highlights !== null) { params.push(highlights); sets.push(`highlights = $${params.length}::jsonb`); }
  // Guard: only write custom_services if the column exists (migration 11).
  const customServices = customServicesOrNull(fields.customServices);
  if (customServices !== null) {
    const { rows: colExists } = await q(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='temples' AND column_name='custom_services'`,
    );
    if (colExists.length > 0) {
      params.push(customServices);
      sets.push(`custom_services = $${params.length}::jsonb`);
    }
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

/** Catalogue services currently linked to this temple, as slugs. */
async function linkedServiceSlugs(q, templeId) {
  const { rows } = await q(
    `SELECT sv.slug FROM temple_services ts
       JOIN services sv ON sv.id = ts.service_id
      WHERE ts.temple_id = $1
      ORDER BY sv.display_order, sv.name`,
    [templeId],
  );
  return rows.map((r) => r.slug);
}

/**
 * Replace the temple's catalogue links with exactly `slugs`.
 *
 * Delete-then-insert rather than a diff: the admin picker always submits the
 * complete set, the row count is tiny, and req.db is inside a transaction so
 * there is no window where the temple appears to have no services.
 *
 * Returns the slugs that did not match a live service, so the controller can
 * tell the admin instead of silently dropping them — a typo'd slug would
 * otherwise vanish with a success message.
 */
async function setServices(q, templeId, slugs) {
  const wanted = [...new Set((slugs || []).map((s) => String(s).trim()).filter(Boolean))];

  await q('DELETE FROM temple_services WHERE temple_id = $1', [templeId]);
  if (!wanted.length) return { linked: [], unknown: [] };

  const { rows } = await q(
    `SELECT id, slug FROM services WHERE slug = ANY($1) AND is_active = TRUE`,
    [wanted],
  );
  const found = new Set(rows.map((r) => r.slug));

  for (const row of rows) {
    await q(
      `INSERT INTO temple_services (temple_id, service_id, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (temple_id, service_id) DO NOTHING`,
      [templeId, row.id],
    );
  }
  return { linked: rows.map((r) => r.slug), unknown: wanted.filter((s) => !found.has(s)) };
}

module.exports = {
  list, getBySlug, create, update, setActive, setTimings, mapPandit,
  linkedServiceSlugs, setServices,
};
