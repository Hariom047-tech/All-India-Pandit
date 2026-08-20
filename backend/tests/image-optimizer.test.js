/**
 * services/media/imageOptimizer.js — upload-time WebP re-encode + resize
 * cap. Pure buffer-in/buffer-out, no database, no network.
 *
 *   npm run test:media
 */

const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');

const { optimizeImage, MAX_DIMENSION } = require('../src/services/media/imageOptimizer');

async function makeJpeg(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).jpeg({ quality: 100 }).toBuffer();
}

test('re-encodes a large JPEG to WebP and caps the dimension', async () => {
  const original = await makeJpeg(3000, 2000);
  const result = await optimizeImage(original, 'image/jpeg');

  assert.notStrictEqual(result, null);
  assert.strictEqual(result.ext, '.webp');
  assert.strictEqual(result.mimeType, 'image/webp');
  assert.ok(result.buffer.length < original.length, 'optimized output should be smaller than a quality-100 JPEG original');

  const meta = await sharp(result.buffer).metadata();
  assert.strictEqual(meta.format, 'webp');
  assert.ok(meta.width <= MAX_DIMENSION);
  assert.ok(meta.height <= MAX_DIMENSION);
});

test('does not upscale an image already smaller than the cap', async () => {
  const original = await makeJpeg(400, 300);
  const result = await optimizeImage(original, 'image/jpeg');
  assert.notStrictEqual(result, null);
  const meta = await sharp(result.buffer).metadata();
  assert.strictEqual(meta.width, 400);
  assert.strictEqual(meta.height, 300);
});

test('returns null (leave original alone) for a video mime type', async () => {
  const result = await optimizeImage(Buffer.from('not really a video'), 'video/mp4');
  assert.strictEqual(result, null);
});

test('returns null for a missing/empty mime type', async () => {
  assert.strictEqual(await optimizeImage(Buffer.from('x'), null), null);
  assert.strictEqual(await optimizeImage(Buffer.from('x'), ''), null);
});

test('returns null (falls back to original) for corrupt/unparseable image bytes, without throwing', async () => {
  const garbage = Buffer.from('this is not a real image file at all');
  await assert.doesNotReject(async () => {
    const result = await optimizeImage(garbage, 'image/jpeg');
    assert.strictEqual(result, null);
  });
});

test('preserves already-WebP input as WebP', async () => {
  // Random noise, not a solid color: a flat-color image already compresses
  // to a few hundred bytes at quality 100, which trips the "don't bother
  // re-encoding an already-tiny file" guard (see imageOptimizer.js) and is
  // not representative of a real uploaded photo anyway.
  const noise = Buffer.alloc(2000 * 2000 * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = Math.floor(Math.random() * 256);
  const original = await sharp(noise, { raw: { width: 2000, height: 2000, channels: 3 } })
    .webp({ quality: 100 }).toBuffer();

  const result = await optimizeImage(original, 'image/webp');
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.mimeType, 'image/webp');
});
