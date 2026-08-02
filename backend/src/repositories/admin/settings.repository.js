async function getAll(q) {
  const { rows } = await q('SELECT key, value, description, updated_at FROM platform_settings ORDER BY key');
  return rows;
}

async function upsert(q, key, value, description, updatedBy) {
  const { rows } = await q(
    `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = COALESCE(EXCLUDED.description, platform_settings.description),
       updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *`,
    [key, JSON.stringify(value), description || null, updatedBy],
  );
  return rows[0];
}

module.exports = { getAll, upsert };
