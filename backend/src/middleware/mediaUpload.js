const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Factory for entity-scoped media upload middleware.
 *
 * Pandits, temples, services and the home hero all need the same thing:
 * random filenames, MIME allow-listing, a size cap, and multer errors turned
 * into clean 4xx responses. Writing that four times would guarantee the four
 * copies drift — one of them would end up accepting SVG (scriptable) or
 * trusting the client's filename. One factory, four configurations.
 */

const PUBLIC_ROOT = path.join(__dirname, '../../public/uploads');

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
 * @param {string} folder      subfolder under public/uploads (e.g. "temples")
 * @param {object} [opts]
 * @param {boolean} [opts.allowVideo=false]
 * @param {number}  [opts.maxMb]
 */
function makeMediaUpload(folder, { allowVideo = false, maxMb } = {}) {
  const dir = path.join(PUBLIC_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });

  const accepted = allowVideo ? { ...IMAGE_TYPES, ...VIDEO_TYPES } : { ...IMAGE_TYPES };
  const limitMb = maxMb ?? (allowVideo ? 60 : 8);

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      // Extension comes from the accepted MIME type, never from the client's
      // filename — an upload cannot name itself "x.png.php" or "../../evil".
      filename: (req, file, cb) =>
        cb(null, crypto.randomBytes(16).toString('hex') + (accepted[file.mimetype] || '')),
    }),
    fileFilter: (req, file, cb) => {
      if (accepted[file.mimetype]) return cb(null, true);
      const err = new Error(`Unsupported file type. Allowed: ${Object.keys(accepted).join(', ')}`);
      err.status = 400;
      cb(err, false);
    },
    limits: { fileSize: limitMb * MB, files: 1 },
  }).single('file');

  /** Express middleware — translates multer's error codes into HTTP statuses. */
  function handler(req, res, next) {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File is too large. Maximum ${limitMb} MB.` });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Unexpected upload field — use "file".' });
      }
      return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
    });
  }

  /** Public URL for a stored file, as written to the database. */
  const urlFor = (filename) => `/uploads/${folder}/${filename}`;

  /** Best-effort cleanup. A stray file is harmless; a row pointing at a
   *  deleted file renders as a broken element, so the row goes first. */
  function removeFile(mediaUrl) {
    if (!mediaUrl || !mediaUrl.startsWith(`/uploads/${folder}/`)) return;
    fs.promises.unlink(path.join(dir, path.basename(mediaUrl))).catch(() => {});
  }

  return { handler, urlFor, removeFile, limitMb, isVideo: (m) => Boolean(VIDEO_TYPES[m]) };
}

module.exports = { makeMediaUpload, IMAGE_TYPES, VIDEO_TYPES };
