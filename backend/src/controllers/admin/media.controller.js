const repo = require('../../repositories/admin/media.repository');
const pandits = require('../../repositories/admin/pandits.repository');
const { removeUploadedFile, isVideo } = require('../../middleware/panditMedia');
const mediaService = require('../../services/media/mediaService');
const { logAdminAction } = require('../../utils/adminLog');

const ALLOWED_TYPES = ['photo', 'video_intro', 'certificate', 'thumbnail'];
const FOLDER = 'pandits';

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
    if (req.file) removeUploadedFile(req.file.mediaUrl);
    return;
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field "file")' });

  const mediaUrl = req.file.mediaUrl;
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
    mediaKey: req.file.storageKey,
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

/**
 * POST <secret>/pandits/:id/media/presign — step 1 of the direct-to-S3 flow
 * for large intro videos (docs/S3_CLOUDFRONT_MIGRATION.md #7). Body:
 * { mediaType, mimeType, sizeBytes? }. 501s when this deployment is still in
 * local-disk mode — the admin UI should fall back to POST .../media then.
 */
async function presign(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;

  const mediaType = String(req.body?.mediaType || '').trim();
  if (!ALLOWED_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }
  const allowVideo = mediaType === 'video_intro';
  const { mimeType, sizeBytes } = req.body || {};
  const presigned = await mediaService.generateUploadUrl(FOLDER, {
    mimeType, sizeBytes: Number(sizeBytes) || undefined, allowVideo, maxMb: 60,
  });
  res.json(presigned);
}

/**
 * POST <secret>/pandits/:id/media/confirm — step 2. Body:
 * { key, mediaType, mimeType, sizeBytes, title?, caption? }. Verifies the
 * object the browser just PUT to S3 actually exists before writing the
 * pandit_media row — see mediaService.confirmUpload for why.
 */
async function confirmUpload(req, res) {
  const pandit = await resolvePandit(req, res);
  if (!pandit) return;

  const { key, mediaType, mimeType, sizeBytes, title, caption } = req.body || {};
  if (!ALLOWED_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }
  const fileIsVideo = isVideo(mimeType);
  if (mediaType === 'video_intro' && !fileIsVideo) {
    return res.status(400).json({ error: 'video_intro requires a video file' });
  }
  if (mediaType !== 'video_intro' && fileIsVideo) {
    return res.status(400).json({ error: 'Videos must be uploaded as mediaType "video_intro"' });
  }

  const confirmed = await mediaService.confirmUpload(FOLDER, key);

  const media = await repo.add(req.db, pandit.id, {
    mediaUrl: confirmed.url,
    mediaKey: confirmed.key,
    mediaType,
    title,
    caption,
    mimeType,
    sizeBytes: Number(sizeBytes) || null,
  });

  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'PANDIT_MEDIA_UPLOADED',
    targetType: 'pandit', targetId: pandit.id,
    details: { mediaType, mimeType, sizeBytes, via: 'presigned' },
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

module.exports = { list, upload, presign, confirmUpload, remove, reorder, setPrimaryPhoto };
