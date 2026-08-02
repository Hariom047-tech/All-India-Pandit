async function listCategories(q) {
  const { rows } = await q('SELECT * FROM service_categories ORDER BY display_order');
  return rows;
}

async function createCategory(q, { name, slug, description, iconName, displayOrder }) {
  const { rows } = await q(
    `INSERT INTO service_categories (name, slug, description, icon_name, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, slug, description || null, iconName || null, displayOrder || 0],
  );
  return rows[0];
}

async function updateCategory(q, id, fields) {
  const { rows } = await q(
    `UPDATE service_categories SET name = COALESCE($2, name), description = COALESCE($3, description),
            icon_name = COALESCE($4, icon_name), display_order = COALESCE($5, display_order), is_active = COALESCE($6, is_active)
     WHERE id = $1 RETURNING *`,
    [id, fields.name, fields.description, fields.iconName, fields.displayOrder, fields.isActive],
  );
  return rows[0] || null;
}

async function deleteCategory(q, id) {
  const { rowCount } = await q('UPDATE service_categories SET is_active = FALSE WHERE id = $1', [id]);
  return rowCount > 0;
}

async function list(q, { search, categorySlug, page, perPage }) {
  const where = [];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
  if (categorySlug) { params.push(categorySlug); where.push(`sc.slug = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT s.id, s.slug, s.name, sc.name AS category, s.is_popular, s.is_active, s.created_at
     FROM services s JOIN service_categories sc ON sc.id = s.category_id
     ${whereSql} ORDER BY s.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM services s JOIN service_categories sc ON sc.id = s.category_id ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function findIdBySlug(q, slug) {
  const { rows } = await q('SELECT id FROM services WHERE slug = $1', [slug]);
  return rows[0]?.id || null;
}

async function create(q, s) {
  const { rows } = await q(
    `INSERT INTO services (category_id, name, slug, description, short_description, icon_name, estimated_duration, is_popular)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, slug`,
    [s.categoryId, s.name, s.slug, s.description || null, s.shortDescription || null, s.iconName || null, s.estimatedDuration || null, !!s.isPopular],
  );
  return rows[0];
}

async function update(q, slug, fields) {
  const { rows } = await q(
    `UPDATE services SET
       name = COALESCE($2, name), description = COALESCE($3, description),
       icon_name = COALESCE($4, icon_name), estimated_duration = COALESCE($5, estimated_duration),
       is_popular = COALESCE($6, is_popular), is_active = COALESCE($7, is_active)
     WHERE slug = $1 RETURNING *`,
    [slug, fields.name, fields.description, fields.iconName, fields.estimatedDuration, fields.isPopular, fields.isActive],
  );
  return rows[0] || null;
}

async function softDelete(q, slug) {
  const { rowCount } = await q('UPDATE services SET is_active = FALSE WHERE slug = $1', [slug]);
  return rowCount > 0;
}

async function listSamagri(q, serviceId) {
  const { rows } = await q('SELECT * FROM service_samagri WHERE service_id = $1 ORDER BY display_order', [serviceId]);
  return rows;
}

async function addSamagri(q, serviceId, item) {
  const { rows } = await q(
    `INSERT INTO service_samagri (service_id, item_name, quantity, is_essential, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [serviceId, item.itemName, item.quantity || null, item.isEssential !== false, item.displayOrder || 0],
  );
  return rows[0];
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  list, findIdBySlug, create, update, softDelete, listSamagri, addSamagri,
};
