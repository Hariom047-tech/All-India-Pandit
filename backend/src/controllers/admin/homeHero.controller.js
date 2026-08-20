const repo = require('../../repositories/homeHero.repository');
const { makeMediaUpload } = require('../../middleware/mediaUpload');
const { logAdminAction } = require('../../utils/adminLog');

const hero = makeMediaUpload('home');
const MAX_IMAGES = 3;

const list = async (req, res) => res.json(await repo.listAll(req.db));

async function upload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });
  const imageUrl = req.file.mediaUrl;

  // The hero has exactly three slots. Refusing a fourth is clearer than
  // silently accepting one that will never be displayed.
  const existing = await repo.listAll(req.db);
  if (existing.length >= MAX_IMAGES) {
    hero.removeFile(imageUrl);
    return res.status(400).json({ error: `Maximum ${MAX_IMAGES} hero images. Delete one first.` });
  }

  const created = await repo.add(req.db, {
    imageUrl,
    imageKey: req.file.storageKey,
    altText: req.body?.altText,
    caption: req.body?.caption,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    uploadedBy: req.adminUser.id,
  });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'HOME_HERO_IMAGE_ADDED',
    targetType: 'home_hero', targetId: created.id, ip: req.ip,
  });
  res.status(201).json(created);
}

async function remove(req, res) {
  const deleted = await repo.remove(req.db, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Image not found' });
  hero.removeFile(deleted.image_url);
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'HOME_HERO_IMAGE_DELETED',
    targetType: 'home_hero', ip: req.ip,
  });
  res.json({ ok: true });
}

async function reorder(req, res) {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
  res.json(await repo.reorder(req.db, orderedIds));
}

module.exports = { list, upload, remove, reorder, heroUpload: hero.handler };
