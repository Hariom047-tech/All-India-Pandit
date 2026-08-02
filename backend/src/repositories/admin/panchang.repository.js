async function list(q, { dateFrom, dateTo }) {
  const where = [];
  const params = [];
  if (dateFrom) { params.push(dateFrom); where.push(`date >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); where.push(`date <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await q(`SELECT * FROM panchang_data ${whereSql} ORDER BY date`, params);
  return rows;
}

async function create(q, p) {
  const { rows } = await q(
    `INSERT INTO panchang_data (date, tithi_name, paksha, nakshatra, yoga, karana, sunrise, sunset, moonrise, moonset, hindu_month)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (date) DO UPDATE SET tithi_name = EXCLUDED.tithi_name, nakshatra = EXCLUDED.nakshatra
     RETURNING *`,
    [p.date, p.tithiName, p.paksha, p.nakshatra, p.yoga, p.karana, p.sunrise || null, p.sunset || null, p.moonrise || null, p.moonset || null, p.hinduMonth || null],
  );
  return rows[0];
}

async function update(q, id, fields) {
  const { rows } = await q(
    `UPDATE panchang_data SET tithi_name = COALESCE($2, tithi_name), nakshatra = COALESCE($3, nakshatra),
            yoga = COALESCE($4, yoga), karana = COALESCE($5, karana)
     WHERE id = $1 RETURNING *`,
    [id, fields.tithiName, fields.nakshatra, fields.yoga, fields.karana],
  );
  return rows[0] || null;
}

async function listFestivals(q) {
  const { rows } = await q('SELECT * FROM festivals ORDER BY date');
  return rows;
}

async function createFestival(q, f) {
  const { rows } = await q(
    `INSERT INTO festivals (name, slug, description, date, significance, is_major, is_national)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [f.name, f.slug, f.description || null, f.date, f.significance || null, !!f.isMajor, !!f.isNational],
  );
  return rows[0];
}

async function updateFestival(q, id, fields) {
  const { rows } = await q(
    `UPDATE festivals SET name = COALESCE($2, name), description = COALESCE($3, description),
            date = COALESCE($4, date), is_major = COALESCE($5, is_major)
     WHERE id = $1 RETURNING *`,
    [id, fields.name, fields.description, fields.date, fields.isMajor],
  );
  return rows[0] || null;
}

async function deleteFestival(q, id) {
  const { rowCount } = await q('DELETE FROM festivals WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, create, update, listFestivals, createFestival, updateFestival, deleteFestival };
