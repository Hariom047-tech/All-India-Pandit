const multer = require('multer');
const { IMAGE_TYPES } = require('./mediaUpload');
const mediaStore = require('../services/media/mediaStorage');
const { optimizeImage } = require('../services/media/imageOptimizer');

/** Review photos — up to 5 per review, images only. Buffered in memory and
 *  persisted through mediaStorage (S3 or local disk), same as mediaUpload.js. */
const FOLDER = 'reviews';
const MB = 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * MB, files: 5 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only image files are allowed!'), false);
  },
});

/** Express middleware — parses up to `maxCount` files under `fieldName`, then
 *  persists each one, attaching `.mediaUrl` to every entry in req.files. */
function reviewPhotos(fieldName, maxCount) {
  const parse = upload.array(fieldName, maxCount);
  return function (req, res, next) {
    parse(req, res, async (err) => {
      if (err) return next(err);
      try {
        for (const file of req.files || []) {
          const optimized = await optimizeImage(file.buffer, file.mimetype);
          const buffer = optimized ? optimized.buffer : file.buffer;
          const ext = optimized ? optimized.ext : (IMAGE_TYPES[file.mimetype] || '');
          const mimeType = optimized ? optimized.mimeType : file.mimetype;
          const { url } = await mediaStore.saveBuffer(FOLDER, buffer, ext, mimeType);
          file.mediaUrl = url;
        }
        next();
      } catch (storeErr) {
        next(storeErr);
      }
    });
  };
}

/** Best-effort cleanup for a rejected review's already-uploaded photos. */
function removePhoto(mediaUrl) {
  mediaStore.removeByUrl(FOLDER, mediaUrl).catch(() => {});
}

module.exports = { upload, reviewPhotos, removePhoto };
