/**
 * services/media/mediaStorage.js — the S3-or-local-disk storage backend
 * behind every media upload (pandits, temples, services, home hero,
 * reviews). Pure I/O against a temp directory / env vars, no database.
 *
 *   npm run test:media
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// mediaStorage resolves its local-disk root relative to its own file
// location (backend/public/uploads) — that's the real path this suite
// exercises for the local-disk branch, and the reason it cleans up after
// itself rather than using a throwaway temp dir.
const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');
const TEST_FOLDER = '__test_media_storage__';

test.afterEach(async () => {
  await fs.promises.rm(path.join(UPLOADS_ROOT, TEST_FOLDER), { recursive: true, force: true }).catch(() => {});
});

test('local-disk mode: saveBuffer with AWS_S3_MEDIA_BUCKET unset writes to public/uploads and returns a relative URL', async () => {
  delete process.env.AWS_S3_MEDIA_BUCKET;
  delete process.env.MEDIA_CDN_BASE_URL;
  // Re-require fresh each test — the module has no top-level state cached
  // from env vars (s3Enabled() reads process.env per call), so a plain
  // require is fine, but this keeps the test explicit about that.
  const store = require('../src/services/media/mediaStorage');

  assert.strictEqual(store.s3Enabled(), false);

  const buf = Buffer.from('fake webp bytes');
  const { filename, key, url } = await store.saveBuffer(TEST_FOLDER, buf, '.webp', 'image/webp');

  assert.match(filename, /^[0-9a-f]{32}\.webp$/);
  assert.strictEqual(key, `${TEST_FOLDER}/${filename}`);
  assert.strictEqual(url, `/uploads/${TEST_FOLDER}/${filename}`);

  const written = path.join(UPLOADS_ROOT, TEST_FOLDER, filename);
  assert.strictEqual(fs.existsSync(written), true);
  assert.deepStrictEqual(fs.readFileSync(written), buf);
});

test('local-disk mode: removeByUrl deletes the file it wrote', async () => {
  delete process.env.AWS_S3_MEDIA_BUCKET;
  const store = require('../src/services/media/mediaStorage');

  const { filename, url } = await store.saveBuffer(TEST_FOLDER, Buffer.from('x'), '.webp', 'image/webp');
  const written = path.join(UPLOADS_ROOT, TEST_FOLDER, filename);
  assert.strictEqual(fs.existsSync(written), true);

  await store.removeByUrl(TEST_FOLDER, url);
  assert.strictEqual(fs.existsSync(written), false);
});

test('local-disk mode: removeByUrl ignores a URL outside its own folder (no cross-folder deletes)', async () => {
  delete process.env.AWS_S3_MEDIA_BUCKET;
  const store = require('../src/services/media/mediaStorage');

  const { filename, url } = await store.saveBuffer(TEST_FOLDER, Buffer.from('x'), '.webp', 'image/webp');
  const written = path.join(UPLOADS_ROOT, TEST_FOLDER, filename);

  // Same filename, wrong folder argument — must not touch the real file.
  await store.removeByUrl('some_other_folder', url);
  assert.strictEqual(fs.existsSync(written), true);
});

test('local-disk mode: removeByUrl is a safe no-op for null/empty/garbage input', async () => {
  delete process.env.AWS_S3_MEDIA_BUCKET;
  const store = require('../src/services/media/mediaStorage');
  await assert.doesNotReject(store.removeByUrl(TEST_FOLDER, null));
  await assert.doesNotReject(store.removeByUrl(TEST_FOLDER, undefined));
  await assert.doesNotReject(store.removeByUrl(TEST_FOLDER, 'not-a-url-at-all'));
});

test('S3 mode: s3Enabled() and urlForFilename() switch on AWS_S3_MEDIA_BUCKET without any network call', () => {
  process.env.AWS_S3_MEDIA_BUCKET = 'panditsuggest-test-media';
  process.env.MEDIA_CDN_BASE_URL = 'https://media.panditsuggest.com';
  const store = require('../src/services/media/mediaStorage');

  try {
    assert.strictEqual(store.s3Enabled(), true);
    assert.strictEqual(
      store.urlForFilename('pandits', 'abc123.webp'),
      'https://media.panditsuggest.com/pandits/abc123.webp',
    );
    // A trailing slash on the base URL must not produce a double slash.
    process.env.MEDIA_CDN_BASE_URL = 'https://media.panditsuggest.com/';
    assert.strictEqual(
      store.urlForFilename('temples', 'xyz.jpg'),
      'https://media.panditsuggest.com/temples/xyz.jpg',
    );
  } finally {
    delete process.env.AWS_S3_MEDIA_BUCKET;
    delete process.env.MEDIA_CDN_BASE_URL;
  }
});

test('S3 mode: urlForFilename throws a clear error if MEDIA_CDN_BASE_URL is missing (bucket set without CDN is a config mistake, not a silent broken URL)', () => {
  process.env.AWS_S3_MEDIA_BUCKET = 'panditsuggest-test-media';
  delete process.env.MEDIA_CDN_BASE_URL;
  const store = require('../src/services/media/mediaStorage');
  try {
    assert.throws(() => store.urlForFilename('pandits', 'abc.webp'), /MEDIA_CDN_BASE_URL/);
  } finally {
    delete process.env.AWS_S3_MEDIA_BUCKET;
  }
});
