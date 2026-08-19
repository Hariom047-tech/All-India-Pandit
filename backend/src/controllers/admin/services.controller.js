const repo = require('../../repositories/admin/services.repository');
const { makeMediaUpload } = require('../../middleware/mediaUpload');

const serviceImage = makeMediaUpload('services', { maxMb: 8 });
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');

const listCategories = async (req, res) => res.json(await repo.listCategories(req.db));

async function createCategory(req, res) {
  const { name, slug } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
  const category = await repo.createCategory(req.db, req.body);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SERVICE_CATEGORY_CREATED', targetType: 'service_category', targetId: category.id, ip: req.ip });
  res.status(201).json(category);
}

async function updateCategory(req, res) {
  const category = await repo.updateCategory(req.db, req.params.id, req.body || {});
  if (!category) return res.status(404).json({ error: 'Category not found' });
  res.json(category);
}

async function deleteCategory(req, res) {
  const ok = await repo.deleteCategory(req.db, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Category not found' });
  res.json({ ok: true });
}

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search, categorySlug } = req.query;
  const { data, total } = await repo.list(req.db, { search, categorySlug, page: paging.page, perPage: paging.perPage });
  res.json(paginationEnvelope(data, paging, total));
}

async function create(req, res) {
  const { categoryId, name, slug } = req.body || {};
  if (!categoryId || !name || !slug) return res.status(400).json({ error: 'categoryId, name and slug are required' });
  const service = await repo.create(req.db, req.body);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SERVICE_CREATED', targetType: 'service', targetId: service.id, details: { name }, ip: req.ip });
  res.status(201).json(service);
}

async function update(req, res) {
  const updated = await repo.update(req.db, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Service not found' });
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'SERVICE_UPDATED', targetType: 'service', targetId: updated.id, details: req.body, ip: req.ip });
  res.json(updated);
}

async function remove(req, res) {
  const ok = await repo.softDelete(req.db, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Service not found' });
  res.json({ ok: true });
}

async function listSamagri(req, res) {
  const serviceId = await repo.findIdBySlug(req.db, req.params.id);
  if (!serviceId) return res.status(404).json({ error: 'Service not found' });
  res.json(await repo.listSamagri(req.db, serviceId));
}

async function addSamagri(req, res) {
  const { itemName } = req.body || {};
  if (!itemName) return res.status(400).json({ error: 'itemName is required' });
  const serviceId = await repo.findIdBySlug(req.db, req.params.id);
  if (!serviceId) return res.status(404).json({ error: 'Service not found' });
  res.status(201).json(await repo.addSamagri(req.db, serviceId, req.body));
}

/** GET <secret>/services/:slug — full record for the admin editor. */
async function getBySlug(req, res) {
  const service = await repo.getBySlug(req.db, req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  res.json(service);
}

/** POST <secret>/services/:slug/image — replaces the hero image. */
async function uploadImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });
  const imageUrl = serviceImage.urlFor(req.file.filename);

  const existing = await repo.getBySlug(req.db, req.params.id);
  if (!existing) {
    serviceImage.removeFile(imageUrl);
    return res.status(404).json({ error: 'Service not found' });
  }

  const updated = await repo.setImage(req.db, req.params.id, imageUrl);
  // A service has one hero image, so the previous file is now unreachable.
  if (existing.image_url && existing.image_url !== imageUrl) serviceImage.removeFile(existing.image_url);

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'SERVICE_IMAGE_UPDATED',
    targetType: 'service', details: { slug: req.params.id }, ip: req.ip,
  });
  res.json({ ok: true, imageUrl: updated.image_url });
}

/** POST <secret>/service-categories/:id/image — tile image for the strip. */
async function uploadCategoryImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });
  const imageUrl = serviceImage.urlFor(req.file.filename);

  const existing = await repo.findCategoryById(req.db, req.params.id);
  if (!existing) { serviceImage.removeFile(imageUrl); return res.status(404).json({ error: 'Category not found' }); }

  const updated = await repo.setCategoryImage(req.db, req.params.id, imageUrl);
  if (existing.image_url && existing.image_url !== imageUrl) serviceImage.removeFile(existing.image_url);

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'SERVICE_CATEGORY_IMAGE_UPDATED',
    targetType: 'service_category', targetId: req.params.id, ip: req.ip,
  });
  res.json({ ok: true, imageUrl: updated.image_url });
}

module.exports = {
  uploadCategoryImage,
  getBySlug, uploadImage, serviceImageUpload: serviceImage.handler,
  listCategories, createCategory, updateCategory, deleteCategory,
  list, create, update, remove, listSamagri, addSamagri,
};
