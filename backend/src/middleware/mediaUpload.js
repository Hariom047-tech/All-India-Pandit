const multer = require('multer');
const mediaStore = require('../services/media/mediaStorage');
const { optimizeImage } = require('../services/media/imageOptimizer');

/**
 * Factory for entity-scoped media upload middleware.
 *
 * Pandits, temples, services and the home hero all need the same thing:
 * random filenames, MIME allow-listing, a size cap, and multer errors turned
 * into clean 4xx responses. Writing that four times would guarantee the four
 * copies drift — one of them would end up accepting SVG (scriptable) or
 * trusting the client's filename. One factory, four configurations.
 *
 * Files are buffered in memory (not written straight to disk by multer) so
 * the same code path can hand the buffer to either S3 or local disk — see
 * services/media/mediaStorage.js, the one place that decides which.
 */

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};
// SVG is deliberately absent: it can carry <script>, and these files are
// served from our own origin.
const VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const MB = 1024 * 1024;

/**
 * @param {string} folder      subfolder under public/uploads, or S3 key prefix (e.g. "temples")
 * @param {object} [opts]
 * @param {boolean} [opts.allowVideo=false]
 * @param {number}  [opts.maxMb]
 */
function makeMediaUpload(folder, { allowVideo = false, maxMb } = {}) {
  const accepted = allowVideo ? { ...IMAGE_TYPES, ...VIDEO_TYPES } : { ...IMAGE_TYPES };
  const limitMb = maxMb ?? (allowVideo ? 60 : 8);

  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (accepted[file.mimetype]) return cb(null, true);
      const err = new Error(`Unsupported file type. Allowed: ${Object.keys(accepted).join(', ')}`);
      err.status = 400;
      cb(err, false);
    },
    limits: { fileSize: limitMb * MB, files: 1 },
  }).single('file');

  /** Express middleware — translates multer's error codes into HTTP statuses,
   *  then persists the buffered file (S3 or disk) before calling next(). */
  function handler(req, res, next) {
    upload(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `File is too large. Maximum ${limitMb} MB.` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Unexpected upload field — use "file".' });
        }
        return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) return next();
      try {
        // Images are re-encoded to a capped-size WebP before storage (never
        // videos — see imageOptimizer.js). Falls back to the original bytes
        // on any failure, so optimization is strictly a bonus, never a
        // reason an upload fails.
        const optimized = await optimizeImage(req.file.buffer, req.file.mimetype);
        const buffer = optimized ? optimized.buffer : req.file.buffer;
        const ext = optimized ? optimized.ext : (accepted[req.file.mimetype] || '');
        const mimeType = optimized ? optimized.mimeType : req.file.mimetype;

        const { filename, key, url } = await mediaStore.saveBuffer(folder, buffer, ext, mimeType);
        // filename kept for callers still doing `.urlFor(req.file.filename)`;
        // mediaUrl is the already-resolved URL, S3 or local; storageKey is the
        // raw object key (see db/26-media-storage-keys.sql).
        req.file.filename = filename;
        req.file.mediaUrl = url;
        req.file.storageKey = key;
        // Reflect what was actually stored — a controller reading
        // req.file.mimetype/size after this point (for isVideo checks or
        // the mimeType/sizeBytes written to the database) must see the
        // optimized WebP, not the original upload's format.
        req.file.mimetype = mimeType;
        req.file.size = buffer.length;
        next();
      } catch (storeErr) {
        next(storeErr);
      }
    });
  }

  /** Public URL for a stored file, as written to the database. */
  const urlFor = (filename) => mediaStore.urlForFilename(folder, filename);

  /** Best-effort cleanup. A stray file is harmless; a row pointing at a
   *  deleted file renders as a broken element, so the row goes first. */
  function removeFile(mediaUrl) {
    mediaStore.removeByUrl(folder, mediaUrl).catch(() => {});
  }

  return { handler, urlFor, removeFile, limitMb, isVideo: (m) => Boolean(VIDEO_TYPES[m]) };
}

module.exports = { makeMediaUpload, IMAGE_TYPES, VIDEO_TYPES };
