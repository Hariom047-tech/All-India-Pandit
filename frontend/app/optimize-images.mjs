import sharp from "sharp";
import { readdirSync, renameSync } from "node:fs";
import path from "node:path";

async function processDir(srcDir, { width, jpgQuality, webpQuality, alsoJpg }) {
  const files = readdirSync(srcDir).filter((f) => /\.jpe?g$/i.test(f));
  for (const file of files) {
    const base = file.replace(/\.jpe?g$/i, "");
    const input = path.join(srcDir, file);

    await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: webpQuality })
      .toFile(path.join(srcDir, `${base}.webp`));

    if (alsoJpg) {
      const jpgTmp = path.join(srcDir, `${base}.jpg.tmp`);
      await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: jpgQuality, mozjpeg: true })
        .toFile(jpgTmp);
      renameSync(jpgTmp, path.join(srcDir, `${base}.jpg`));
    }
    console.log("optimized", path.relative(process.cwd(), input));
  }
}

// Temple photos (top-level, not the hero/ subfolder which has its own script):
// 1200w WebP + a recompressed JPEG fallback in place.
await processDir(path.resolve("public/assets/img/temples"), {
  width: 1200,
  jpgQuality: 78,
  webpQuality: 74,
  alsoJpg: true,
});

// Pandit headshots: add a 640w WebP for card thumbnails; keep the original
// 1024x1024 JPEG as-is for the profile page's larger portrait.
await processDir(path.resolve("public/assets/img/pandits"), {
  width: 640,
  webpQuality: 76,
  alsoJpg: false,
});

// Temple gallery photos (public/assets/img/temples/gallery/*) — smaller,
// used as grid thumbnails that open into a full-size lightbox.
await processDir(path.resolve("public/assets/img/temples/gallery"), {
  width: 1000,
  jpgQuality: 76,
  webpQuality: 72,
  alsoJpg: true,
});

console.log("done");
