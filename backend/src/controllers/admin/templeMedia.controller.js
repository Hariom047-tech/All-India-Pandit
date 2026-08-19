const repo = require('../../repositories/admin/templeMedia.repository');
const temples = require('../../repositories/admin/temples.repository');
const { makeMediaUpload } = require('../../middleware/mediaUpload');
const { logAdminAction } = require('../../utils/adminLog');

const templeUpload = makeMediaUpload('temples', { allowVideo: true, maxMb: 60 });
const ALLOWED = ['photo', 'video', 'virtual_tour_360'];

/**
 * The temples repository exposes getBySlug (full row), not findIdBySlug — the
 * pandits repository is the one with findIdBySlug. Only the id is needed here.
 */
async function resolveTemple(req, res) {
  const temple = await temples.getBySlug(req.db, req.params.id);
  if (!temple) { res.status(404).json({ error: 'Temple not found' }); return null; }
  return { id: temple.id, slug: temple.slug };
}

async function list(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) return;
  res.json(await repo.list(req.db, temple.id));
}

async function upload(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) {
    if (req.file) templeUpload.removeFile(templeUpload.urlFor(req.file.filename));
    return;
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });

  const mediaUrl = templeUpload.urlFor(req.file.filename);
  const fileIsVideo = templeUpload.isVideo(req.file.mimetype);
  // Trust the sniffed type over the declared one — a mislabelled file would
  // render in the wrong element on the public gallery.
  const mediaType = fileIsVideo ? 'video' : (req.body?.mediaType || 'photo');

  if (!ALLOWED.includes(mediaType)) {
    templeUpload.removeFile(mediaUrl);
    return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED.join(', ')}` });
  }

  const media = await repo.add(req.db, temple.id, {
    mediaUrl, mediaType,
    title: req.body?.title, caption: req.body?.caption,
    mimeType: req.file.mimetype, sizeBytes: req.file.size,
    uploadedBy: req.adminUser.id,
  });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'TEMPLE_MEDIA_UPLOADED',
    targetType: 'temple', targetId: temple.id,
    details: { mediaType, mimeType: req.file.mimetype }, ip: req.ip,
  });
  res.status(201).json(media);
}

async function remove(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) return;
  const media = await repo.remove(req.db, temple.id, req.params.mediaId);
  if (!media) return res.status(404).json({ error: 'Media not found' });
  templeUpload.removeFile(media.media_url);
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'TEMPLE_MEDIA_DELETED',
    targetType: 'temple', targetId: temple.id, ip: req.ip,
  });
  res.json({ ok: true });
}

/** Profile picture — photos only. The repo re-checks media_type in SQL. */
async function setCover(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) return;
  const ok = await repo.setCover(req.db, temple.id, req.params.mediaId);
  // A video id lands here too, and the repo's photo-only guard rejects it.
  if (!ok) return res.status(404).json({ error: 'Photo not found. Only a photo can be the profile picture.' });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'TEMPLE_COVER_CHANGED',
    targetType: 'temple', targetId: temple.id,
    details: { mediaId: req.params.mediaId }, ip: req.ip,
  });
  res.json({ ok: true });
}

/**
 * Hero placement — photos and videos alike.
 *
 * The body carries the desired state rather than flipping whatever is stored,
 * so a double-tap or a retried request is idempotent instead of toggling back.
 */
async function setHero(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) return;

  const { show } = req.body || {};
  if (typeof show !== 'boolean') {
    return res.status(400).json({ error: 'Body must be { "show": true | false }' });
  }

  const media = await repo.setHero(req.db, temple.id, req.params.mediaId, show);
  if (!media) return res.status(404).json({ error: 'Media not found' });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: show ? 'TEMPLE_MEDIA_HERO_ON' : 'TEMPLE_MEDIA_HERO_OFF',
    targetType: 'temple', targetId: temple.id,
    details: { mediaId: media.id, mediaType: media.media_type }, ip: req.ip,
  });
  res.json(media);
}

async function reorder(req, res) {
  const temple = await resolveTemple(req, res);
  if (!temple) return;
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
  res.json(await repo.reorder(req.db, temple.id, orderedIds));
}

module.exports = { list, upload, remove, setCover, setHero, reorder, templeUploadHandler: templeUpload.handler };
