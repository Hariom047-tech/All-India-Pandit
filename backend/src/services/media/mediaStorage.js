const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Storage backend for uploaded media (pandit/temple/service/review photos and
 * videos): S3 + CloudFront when configured, local disk otherwise.
 *
 * This is the ONE place that knows which mode is active. Callers (mediaUpload.js,
 * upload.js) ask it to save/remove a buffer and get back a URL — they never
 * branch on S3-vs-disk themselves. See docs/S3_CLOUDFRONT_MIGRATION.md.
 *
 * Local disk is the default with zero configuration, so a laptop with no AWS
 * account keeps working exactly as before. Setting AWS_S3_MEDIA_BUCKET (and
 * MEDIA_CDN_BASE_URL) switches every NEW upload to S3 — existing rows already
 * holding a `/uploads/...` path keep resolving locally (dual-read), matching
 * the migration plan's "no big-bang cutover" phase.
 */

const PUBLIC_ROOT = path.join(__dirname, '../../../public/uploads');

function s3Enabled() {
  return Boolean(process.env.AWS_S3_MEDIA_BUCKET);
}

function bucketName() {
  return process.env.AWS_S3_MEDIA_BUCKET;
}

function cdnBaseUrl() {
  const base = process.env.MEDIA_CDN_BASE_URL;
  if (!base) {
    throw new Error('MEDIA_CDN_BASE_URL must be set when AWS_S3_MEDIA_BUCKET is configured');
  }
  return base.replace(/\/+$/, '');
}

// Constructed lazily so a deployment that never sets AWS_S3_MEDIA_BUCKET never
// even requires the @aws-sdk/client-s3 package to resolve at startup.
let _s3Client = null;
function s3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  // No explicit credentials: in production this is the EC2 instance's IAM
  // role (see docs/S3_CLOUDFRONT_MIGRATION.md #27). AWS_ACCESS_KEY_ID /
  // AWS_SECRET_ACCESS_KEY in the environment still work for local testing —
  // the SDK's default credential chain picks either up automatically.
  _s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
  return _s3Client;
}

function randomFilename(ext) {
  return crypto.randomBytes(16).toString('hex') + ext;
}

/** The public URL for a filename already known to exist in `folder`, without touching storage. */
function urlForFilename(folder, filename) {
  return s3Enabled() ? `${cdnBaseUrl()}/${folder}/${filename}` : `/uploads/${folder}/${filename}`;
}

/**
 * Persists a buffer and returns { filename, key, url }.
 *
 * `key` is the raw storage key (`${folder}/${filename}`) regardless of mode —
 * it is what a future S3-native operation (delete-by-key, presigned GET,
 * the historical migration script) needs, independent of how the URL is
 * currently being resolved.
 *
 * @param {string} folder    e.g. "pandits", "temples", "services", "home", "reviews"
 * @param {Buffer} buffer
 * @param {string} ext       file extension including the dot, e.g. ".webp"
 * @param {string} mimeType  used as S3's Content-Type; ignored on local disk
 */
async function saveBuffer(folder, buffer, ext, mimeType) {
  const filename = randomFilename(ext);
  const key = `${folder}/${filename}`;

  if (s3Enabled()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Immutable, randomly-named objects never change — see plan #7.
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return { filename, key, url: urlForFilename(folder, filename) };
  }

  const dir = path.join(PUBLIC_ROOT, folder);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return { filename, key, url: urlForFilename(folder, filename) };
}

/** Best-effort delete. A stray object/file left behind is harmless; failures are swallowed. */
async function removeByUrl(folder, mediaUrl) {
  if (!mediaUrl) return;

  if (s3Enabled() && mediaUrl.startsWith(`${cdnBaseUrl()}/`)) {
    const key = mediaUrl.slice(cdnBaseUrl().length + 1);
    // Only ever delete within this call's own folder prefix — a media_url
    // from a different entity/folder must not be deletable through this path.
    if (!key.startsWith(`${folder}/`)) return;
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key })).catch(() => {});
    return;
  }

  if (!mediaUrl.startsWith(`/uploads/${folder}/`)) return;
  await fs.promises.unlink(path.join(PUBLIC_ROOT, folder, path.basename(mediaUrl))).catch(() => {});
}

/** The public URL for an already-known full key (`folder/filename`), without touching storage. */
function urlForKey(key) {
  return s3Enabled() ? `${cdnBaseUrl()}/${key}` : `/uploads/${key}`;
}

/**
 * True if `key` exists in the active backend. Used by the historical
 * migration script's verification step (db/26-media-storage-keys.sql,
 * scripts/migrate-media-to-s3.js) — an upload is only "done" once this
 * confirms the object is actually retrievable, not just that PutObject
 * returned 200.
 */
async function objectExists(key) {
  if (s3Enabled()) {
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await s3Client().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }
  return fs.promises.access(path.join(PUBLIC_ROOT, key)).then(() => true).catch(() => false);
}

/**
 * Uploads a buffer to S3 under an EXACT, caller-chosen key — unlike
 * saveBuffer(), which always mints a fresh random filename for a brand-new
 * upload. The historical migration script needs this instead: it is moving
 * an already-existing local file (`public/uploads/pandits/<hex>.ext`) to S3
 * and wants the SAME key, so re-running the script is naturally idempotent
 * (objectExists(key) short-circuits an already-migrated file) and the
 * database's existing filename-based URL stays predictable.
 *
 * Local-disk mode has no meaningful "migrate to S3" operation — the file is
 * already local — so this throws rather than silently doing nothing.
 */
async function uploadExistingFile(key, buffer, mimeType) {
  if (!s3Enabled()) {
    throw new Error('uploadExistingFile requires AWS_S3_MEDIA_BUCKET to be set (nothing to migrate to otherwise)');
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3Client().send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { key, url: urlForKey(key) };
}

/**
 * A short-lived presigned PUT URL for a browser to upload directly to S3,
 * bypassing this server's own bandwidth for large files (plan #7/#12 in
 * docs/S3_CLOUDFRONT_MIGRATION.md). Local-disk mode has no equivalent — a
 * browser cannot PUT straight to this process's filesystem — so callers must
 * check s3Enabled() first and fall back to the existing proxy-upload
 * endpoints when it is false; see routes wiring in mediaUpload.js callers.
 *
 * @param {string} key
 * @param {string} mimeType
 * @param {number} [expiresInSeconds=300] short-lived on purpose — a leaked
 *        URL should stop working quickly. 5 minutes is generous for a mobile
 *        upload to start; it is the START deadline, not an upload-duration cap.
 */
async function generatePresignedPutUrl(key, mimeType, expiresInSeconds = 300) {
  if (!s3Enabled()) {
    throw new Error('generatePresignedPutUrl requires AWS_S3_MEDIA_BUCKET to be set');
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const command = new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  });
  const uploadUrl = await getSignedUrl(s3Client(), command, { expiresIn: expiresInSeconds });
  return { uploadUrl, key, url: urlForKey(key), expiresInSeconds };
}

module.exports = {
  s3Enabled, saveBuffer, removeByUrl, urlForFilename, urlForKey,
  objectExists, uploadExistingFile, generatePresignedPutUrl, randomFilename,
};
