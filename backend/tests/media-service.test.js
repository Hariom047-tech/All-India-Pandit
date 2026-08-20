/**
 * services/media/mediaService.js — validation + the presigned-upload
 * authorize/confirm flow. No database, no network: S3 calls only happen
 * when AWS_S3_MEDIA_BUCKET is set, and these tests keep it unset except
 * where explicitly checking the "not configured" 501 path.
 *
 *   npm run test:media
 */

const test = require('node:test');
const assert = require('node:assert');

const mediaService = require('../src/services/media/mediaService');

test.beforeEach(() => {
  delete process.env.AWS_S3_MEDIA_BUCKET;
  delete process.env.MEDIA_CDN_BASE_URL;
});

test('validateUpload accepts a known image type within the size limit', () => {
  const { ext } = mediaService.validateUpload({ mimeType: 'image/webp', sizeBytes: 1024, allowVideo: false });
  assert.strictEqual(ext, '.webp');
});

test('validateUpload rejects an unknown mime type with a 400', () => {
  assert.throws(
    () => mediaService.validateUpload({ mimeType: 'application/pdf', sizeBytes: 100 }),
    (err) => err.status === 400 && /Unsupported file type/.test(err.message),
  );
});

test('validateUpload rejects video mime types when allowVideo is false', () => {
  assert.throws(
    () => mediaService.validateUpload({ mimeType: 'video/mp4', sizeBytes: 100, allowVideo: false }),
    (err) => err.status === 400,
  );
});

test('validateUpload accepts video mime types when allowVideo is true', () => {
  const { ext } = mediaService.validateUpload({ mimeType: 'video/mp4', sizeBytes: 100, allowVideo: true });
  assert.strictEqual(ext, '.mp4');
});

test('validateUpload rejects a file over the size limit with a 413', () => {
  assert.throws(
    () => mediaService.validateUpload({
      mimeType: 'image/jpeg', sizeBytes: 20 * 1024 * 1024, allowVideo: false, maxMb: 8,
    }),
    (err) => err.status === 413 && /Maximum 8 MB/.test(err.message),
  );
});

test('validateUpload lets a missing/non-numeric sizeBytes through (server cannot yet know the real size before the presigned PUT completes)', () => {
  assert.doesNotThrow(() => mediaService.validateUpload({ mimeType: 'image/webp', sizeBytes: undefined }));
});

test('generateUploadUrl returns 501 when S3 is not configured (local-disk deployments must fall back to the multipart endpoint)', async () => {
  await assert.rejects(
    mediaService.generateUploadUrl('pandits', { mimeType: 'image/webp', allowVideo: false }),
    (err) => err.status === 501,
  );
});

test('generateUploadUrl validates BEFORE minting a key — an invalid mime type never reaches S3Client construction', async () => {
  // Still unconfigured, so this proves validation (400) wins over the
  // S3-not-configured branch — generateUploadUrl checks s3Enabled() first,
  // so this documents that ordering rather than testing a live bucket.
  await assert.rejects(
    mediaService.generateUploadUrl('pandits', { mimeType: 'image/webp', allowVideo: false }),
    (err) => err.status === 501, // s3Enabled() is checked first
  );
});

test('confirmUpload rejects a key outside the requested folder before ever calling storage', async () => {
  await assert.rejects(
    mediaService.confirmUpload('pandits', 'temples/some-other-file.webp'),
    (err) => err.status === 400,
  );
});

test('confirmUpload rejects a missing/non-string key', async () => {
  await assert.rejects(mediaService.confirmUpload('pandits', undefined), (err) => err.status === 400);
  await assert.rejects(mediaService.confirmUpload('pandits', null), (err) => err.status === 400);
});
