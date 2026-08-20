const mediaStore = require('./mediaStorage');
const { IMAGE_TYPES, VIDEO_TYPES } = require('../../middleware/mediaUpload');

/**
 * The centralized media service (docs/S3_CLOUDFRONT_MIGRATION.md #6).
 *
 * mediaStorage.js owns "how a buffer gets persisted" (S3 vs. disk).
 * This file owns "should this upload be allowed at all", plus the
 * presigned-direct-to-S3 flow for large files (#7/#12 in the same doc) —
 * the one thing the proxy-upload middleware (middleware/mediaUpload.js)
 * structurally cannot do, since a browser cannot get a presigned URL for a
 * request it already sent through this server.
 *
 * Controllers should not touch mediaStorage.js or the AWS SDK directly for
 * this flow; they call generateUploadUrl() then confirmUpload().
 */

function accepted({ allowVideo }) {
  return allowVideo ? { ...IMAGE_TYPES, ...VIDEO_TYPES } : { ...IMAGE_TYPES };
}

/** Throws a 400 with a message identical in shape to mediaUpload.js's own
 *  fileFilter rejection, so a presigned-upload caller and a proxy-upload
 *  caller see the same error text for the same mistake. */
function validateUpload({ mimeType, sizeBytes, allowVideo = false, maxMb }) {
  const types = accepted({ allowVideo });
  const ext = types[mimeType];
  if (!ext) {
    const err = new Error(`Unsupported file type. Allowed: ${Object.keys(types).join(', ')}`);
    err.status = 400;
    throw err;
  }
  const limitMb = maxMb ?? (allowVideo ? 60 : 8);
  if (Number.isFinite(sizeBytes) && sizeBytes > limitMb * 1024 * 1024) {
    const err = new Error(`File is too large. Maximum ${limitMb} MB.`);
    err.status = 413;
    throw err;
  }
  return { ext };
}

/**
 * Step 1 of the presigned-upload flow: authorize and hand back a short-lived
 * S3 PUT URL. The file itself never touches this server.
 *
 * Requires S3 to be configured — a 501 here tells the caller (an admin UI)
 * to fall back to the existing multipart-upload endpoint, which keeps
 * working in local-disk mode exactly as before this existed.
 *
 * @param {string} folder  e.g. "pandits", "temples"
 * @param {object} opts    { mimeType, sizeBytes, allowVideo, maxMb }
 */
async function generateUploadUrl(folder, { mimeType, sizeBytes, allowVideo = false, maxMb } = {}) {
  if (!mediaStore.s3Enabled()) {
    const err = new Error(
      'Direct S3 upload is not available on this deployment (AWS_S3_MEDIA_BUCKET is not set). '
      + 'Use the multipart upload endpoint instead.',
    );
    err.status = 501;
    throw err;
  }
  const { ext } = validateUpload({ mimeType, sizeBytes, allowVideo, maxMb });
  const filename = mediaStore.randomFilename(ext);
  const key = `${folder}/${filename}`;
  const presigned = await mediaStore.generatePresignedPutUrl(key, mimeType);
  return { ...presigned, filename };
}

/**
 * Step 2: after the browser's direct PUT to S3 succeeds, confirm the object
 * actually exists before trusting the client's word for it. A client that
 * lies about a successful upload — or whose upload silently failed partway
 * — must not be able to make this server write a database row pointing at
 * nothing.
 *
 * @param {string} folder  must match the folder the presigned key was minted for
 * @param {string} key     the key returned by generateUploadUrl()
 */
async function confirmUpload(folder, key) {
  if (typeof key !== 'string' || !key.startsWith(`${folder}/`)) {
    const err = new Error('key does not belong to this upload folder');
    err.status = 400;
    throw err;
  }
  const exists = await mediaStore.objectExists(key);
  if (!exists) {
    const err = new Error('Upload not found in storage — it may have failed, or the presigned URL expired.');
    err.status = 409;
    throw err;
  }
  return { key, url: mediaStore.urlForKey(key) };
}

module.exports = { validateUpload, generateUploadUrl, confirmUpload };
