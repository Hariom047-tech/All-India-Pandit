/**
 * Normalises an admin-supplied list into the JSONB shape the public page
 * renders. Accepts undefined (leave alone) vs [] (explicitly cleared), which
 * a plain COALESCE cannot distinguish.
 */
function jsonListOrNull(value, shape) {
  if (value === undefined) return null;          // caller omitted it -> keep existing
  if (!Array.isArray(value)) return JSON.stringify([]);
  return JSON.stringify(value.map(shape).filter(Boolean).slice(0, 40));
}

const asBenefit = (b) => {
  const title = String(b?.title ?? b ?? '').trim();
  return title ? { title, detail: String(b?.detail ?? '').trim() } : null;
};
const asStep = (p, i) => {
  const title = String(p?.title ?? p ?? '').trim();
  return title ? {
    step: Number(p?.step) || i + 1,
    title,
    detail: String(p?.detail ?? '').trim(),
    duration: String(p?.duration ?? '').trim(),
  } : null;
};
const asFaq = (f) => {
  const q = String(f?.q ?? '').trim();
  return q ? { q, a: String(f?.a ?? '').trim() } : null;
};
const asSamagri = (x) => {
  const item = String(x?.item ?? x ?? '').trim();
  return item ? { item, qty: String(x?.qty ?? '').trim() } : null;
};

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
    `UPDATE service_categories SET
       name          = COALESCE($2, name),
       description   = COALESCE($3, description),
       icon_name     = COALESCE($4, icon_name),
       display_order = COALESCE($5, display_order),
       is_active     = COALESCE($6, is_active),
       image_url     = COALESCE($7, image_url),
       tagline       = COALESCE($8, tagline),
       -- home_rank is nullable BY DESIGN (null = hidden from the strip), so it
       -- cannot use COALESCE — that would make un-featuring impossible.
       home_rank     = CASE WHEN $9::boolean THEN $10::int ELSE home_rank END
     WHERE id = $1 RETURNING *`,
    [id, fields.name, fields.description, fields.iconName, fields.displayOrder, fields.isActive,
      fields.imageUrl, fields.tagline,
      fields.homeRank !== undefined, fields.homeRank ?? null],
  );
  return rows[0] || null;
}

async function findCategoryById(q, id) {
  const { rows } = await q('SELECT * FROM service_categories WHERE id = $1', [id]);
  return rows[0] || null;
}

async function setCategoryImage(q, id, imageUrl) {
  const { rows } = await q(
    'UPDATE service_categories SET image_url = $2 WHERE id = $1 RETURNING image_url', [id, imageUrl]);
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
    `SELECT s.id, s.slug, s.name, sc.name AS category, s.is_popular, s.is_active,
            s.is_online_available, s.created_at
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
    `INSERT INTO services
       (category_id, name, slug, description, short_description, icon_name,
        estimated_duration, is_popular, recommended_muhurat,
        benefits, process, faqs, samagri_list, is_online_available, online_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             COALESCE($10::jsonb, '[]'::jsonb), COALESCE($11::jsonb, '[]'::jsonb),
             COALESCE($12::jsonb, '[]'::jsonb), COALESCE($13::jsonb, '[]'::jsonb),
             COALESCE($14, FALSE), $15)
     RETURNING id, slug`,
    [s.categoryId, s.name, s.slug, s.description || null, s.shortDescription || null,
      s.iconName || null, s.estimatedDuration || null, !!s.isPopular, s.recommendedMuhurat || null,
      jsonListOrNull(s.benefits, asBenefit),
      jsonListOrNull(s.process, asStep),
      jsonListOrNull(s.faqs, asFaq),
      jsonListOrNull(s.samagri, asSamagri),
      s.isOnlineAvailable, s.onlineNote || null],
  );
  return rows[0];
}

async function update(q, slug, fields) {
  const { rows } = await q(
    `UPDATE services SET
       name                = COALESCE($2, name),
       description         = COALESCE($3, description),
       short_description   = COALESCE($4, short_description),
       icon_name           = COALESCE($5, icon_name),
       estimated_duration  = COALESCE($6, estimated_duration),
       is_popular          = COALESCE($7, is_popular),
       is_active           = COALESCE($8, is_active),
       recommended_muhurat = COALESCE($9, recommended_muhurat),
       benefits            = COALESCE($10::jsonb, benefits),
       process             = COALESCE($11::jsonb, process),
       faqs                = COALESCE($12::jsonb, faqs),
       samagri_list        = COALESCE($13::jsonb, samagri_list),
       is_online_available = COALESCE($14, is_online_available),
       online_note         = COALESCE($15, online_note)
     WHERE slug = $1 RETURNING *`,
    [slug, fields.name, fields.description, fields.shortDescription, fields.iconName,
      fields.estimatedDuration, fields.isPopular, fields.isActive, fields.recommendedMuhurat,
      jsonListOrNull(fields.benefits, asBenefit),
      jsonListOrNull(fields.process, asStep),
      jsonListOrNull(fields.faqs, asFaq),
      jsonListOrNull(fields.samagri, asSamagri),
      fields.isOnlineAvailable, fields.onlineNote],
  );
  return rows[0] || null;
}

/** Full record for the admin editor — the list query is intentionally slim. */
async function getBySlug(q, slug) {
  const { rows } = await q(
    `SELECT s.*, sc.slug AS category_slug, sc.name AS category_name
       FROM services s JOIN service_categories sc ON sc.id = s.category_id
      WHERE s.slug = $1`,
    [slug],
  );
  return rows[0] || null;
}

async function setImage(q, slug, imageUrl) {
  const { rows } = await q(
    'UPDATE services SET image_url = $2 WHERE slug = $1 RETURNING image_url',
    [slug, imageUrl],
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
  findCategoryById, setCategoryImage,
  getBySlug, setImage,
  listCategories, createCategory, updateCategory, deleteCategory,
  list, findIdBySlug, create, update, softDelete, listSamagri, addSamagri,
};
