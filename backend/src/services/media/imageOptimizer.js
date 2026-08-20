const sharp = require('sharp');

/**
 * Upload-time image optimization (docs/S3_CLOUDFRONT_MIGRATION.md #15).
 *
 * A phone photo can be 5-10 MB at 4000x3000 — nothing on this site displays
 * that many pixels, and shipping the original to a Pandit card wastes
 * bandwidth for every visitor, forever. This re-encodes every uploaded
 * IMAGE (never video — transcoding video is a different, much heavier
 * problem, deliberately out of scope here) to WebP, capped at a sensible
 * max dimension.
 *
 * Deliberately ONE output, not a 320/640/1280 srcset: generating and storing
 * three objects per upload, wiring three URLs through every DB row and
 * every frontend component that renders one today, is a substantially
 * bigger change (touches the schema, every repository, every <img> call
 * site) for a further optimization on top of what already matters most —
 * getting off an unoptimized multi-megabyte original. That is a reasonable
 * follow-up once this is live, not a blocker for it.
 */

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;

/**
 * @param {Buffer} buffer
 * @param {string} mimeType  the ORIGINAL mime type, used only to decide
 *        whether this is an image worth touching at all
 * @returns {Promise<{ buffer: Buffer, ext: string, mimeType: string } | null>}
 *          null means "leave the original buffer alone" — either it is not
 *          an image, or re-encoding failed and the safest thing is to store
 *          exactly what the user uploaded rather than fail the request.
 */
async function optimizeImage(buffer, mimeType) {
  if (!mimeType || !mimeType.startsWith('image/')) return null;

  try {
    const optimized = await sharp(buffer, { failOn: 'none' })
      .rotate() // apply EXIF orientation before it's stripped, or sideways photos ship sideways
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    // A pathological input (e.g. a 1x1 pixel) can re-encode LARGER than it
    // started — not worth strictly enforcing "always smaller", but never
    // ship a re-encode that grew for no visual benefit on an already-small file.
    if (optimized.length >= buffer.length && buffer.length < 20 * 1024) return null;

    return { buffer: optimized, ext: '.webp', mimeType: 'image/webp' };
  } catch (err) {
    // Corrupt/unsupported input, or an environment without the libvips
    // codec for this format. The upload must not fail because of an
    // optimization that is a nice-to-have, not a correctness requirement —
    // store the original as uploaded instead.
    console.error('[media] image optimization failed, storing original:', err.message);
    return null;
  }
}

module.exports = { optimizeImage, MAX_DIMENSION, WEBP_QUALITY };
