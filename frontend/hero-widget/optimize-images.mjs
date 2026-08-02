import sharp from "sharp";
import { readdirSync, renameSync } from "node:fs";
import path from "node:path";

// One-off maintenance script: re-run after dropping fresh, full-size JPEGs
// into public/assets/img/temples/hero/ (e.g. a swapped-out temple photo).
// Produces 1920w + 960w WebP plus a recompressed JPEG fallback in place.
const srcDir = path.resolve("../public/assets/img/temples/hero");

const files = readdirSync(srcDir).filter((f) => /\.jpe?g$/i.test(f));

for (const file of files) {
  const base = file.replace(/\.jpe?g$/i, "");
  const input = path.join(srcDir, file);

  await sharp(input)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(path.join(srcDir, `${base}.webp`));

  await sharp(input)
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(path.join(srcDir, `${base}-960.webp`));

  const jpgTmp = path.join(srcDir, `${base}.jpg.tmp`);
  await sharp(input)
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(jpgTmp);
  renameSync(jpgTmp, path.join(srcDir, `${base}.jpg`));

  console.log("optimized", file);
}
console.log("done");
