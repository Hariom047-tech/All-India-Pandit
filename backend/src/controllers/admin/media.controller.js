const repo = require('../../repositories/admin/media.repository');
const pandits = require('../../repositories/admin/pandits.repository');
const { removeUploadedFile, isVideo } = require('../../middleware/panditMedia');
const { logAdminAction } = require('../../utils/adminLog');

const ALLOWED_TYPES = ['photo', 'video_intro', 'certificate', 'thumbnail'];

async function resolvePandit(req, res) {
  const found = await pandits.findIdBySlug(req.db, req.params.id);
  if (!found) { res.status(404).json({ error: 'Pandit not found' }); return null; }
  return found;
}

async function list(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;
  res.json(await repo.list(req.db, pandit.id));
}

/**
 * POST <secret>/pandits/:id/media — multipart, field name `file`.
 *
 * The declared mediaType is cross-checked against the sniffed MIME type: a
 * video uploaded as `photo` would end up rendered in an <img>, and a photo
 * declared as `video_intro` would sit broken in the reels slider.
 */
async function upload(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) {
    if (req.file) removeUploadedFile(`/uploads/pandits/${req.file.filename}`);
    return;
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });

  const mediaUrl = `/uploads/pandits/${req.file.filename}`;
  const mediaType = String(req.body?.mediaType || '').trim();

  const fail = (msg) => { removeUploadedFile(mediaUrl); return res.status(400).json({ error: msg }); };

  if (!ALLOWED_TYPES.includes(mediaType)) {
    return fail(`mediaType must be one of: ${ALLOWED_TYPES.join(', ')}`);
  }
  const fileIsVideo = isVideo(req.file.mimetype);
  if (mediaType === 'video_intro' && !fileIsVideo) return fail('video_intro requires a video file');
  if (mediaType !== 'video_intro' && fileIsVideo) return fail('Videos must be uploaded as mediaType "video_intro"');

  const media = await repo.add(req.db, pandit.id, {
    mediaUrl,
    mediaType,
    title: req.body?.title,
    caption: req.body?.caption,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'PANDIT_MEDIA_UPLOADED',
    targetType: 'pandit', targetId: pandit.id,
    details: { mediaType, mimeType: req.file.mimetype, sizeBytes: req.file.size },
    ip: req.ip,
  });

  res.status(201).json(media);
}

async function remove(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;

  const media = await repo.remove(req.db, pandit.id, req.params.mediaId);
  if (!media) return res.status(404).json({ error: 'Media not found' });

  // Row first, file second: an orphaned file is harmless, a row pointing at a
  // deleted file renders as a broken element on the public profile.
  removeUploadedFile(media.media_url);

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'PANDIT_MEDIA_DELETED',
    targetType: 'pandit', targetId: pandit.id,
    details: { mediaType: media.media_type }, ip: req.ip,
  });
  res.json({ ok: true });
}

async function reorder(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'orderedIds must be an array of media ids' });
  }
  res.json(await repo.reorder(req.db, pandit.id, orderedIds));
}

async function setPrimaryPhoto(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;
  const media = await repo.setPrimaryPhoto(req.db, pandit.id, req.params.mediaId);
  if (!media) return res.status(404).json({ error: 'Photo not found' });
  res.json({ ok: true, profilePhotoUrl: media.media_url });
}

module.exports = { list, upload, remove, reorder, setPrimaryPhoto };
