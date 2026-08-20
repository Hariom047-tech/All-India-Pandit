#!/usr/bin/env node
/**
 * Moves EXISTING local-disk media (backend/public/uploads/...) to S3, for
 * every table the admin upload flows write to. Part of the S3 + CloudFront
 * migration — see docs/S3_CLOUDFRONT_MIGRATION.md, phase 4.
 *
 * Safe by construction, not just by convention:
 *   - dry-run by default. Nothing is uploaded or written until --execute.
 *   - idempotent / resumable. Only rows with the key column still NULL are
 *     selected, so re-running (after a crash, a Ctrl-C, or just to pick up
 *     rows uploaded since) only ever touches what is still un-migrated —
 *     no double-uploads, no duplicate objects.
 *   - one row's failure (missing local file, S3 error, ...) is logged and
 *     skipped; it never aborts the batch.
 *   - the database row is updated ONLY after the S3 upload is confirmed
 *     present via a HeadObject (objectExists) — never on the strength of
 *     PutObject alone.
 *   - the local file is NEVER deleted here. That is a deliberate separate
 *     step — see cleanup-legacy-media.js — run only after production
 *     verification.
 *
 * Usage:
 *   node scripts/migrate-media-to-s3.js                    # dry run, all tables
 *   node scripts/migrate-media-to-s3.js --execute           # actually migrate
 *   node scripts/migrate-media-to-s3.js --execute --table=pandit_media
 *   node scripts/migrate-media-to-s3.js --execute --limit=25
 *   node scripts/migrate-media-to-s3.js --execute --id=<uuid> --table=pandit_media
 *
 * Requires AWS_S3_MEDIA_BUCKET and MEDIA_CDN_BASE_URL (same as the running
 * app — see .env.example) — there is nothing to migrate TO otherwise.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const mediaStore = require('../src/services/media/mediaStorage');
const { IMAGE_TYPES, VIDEO_TYPES } = require('../src/middleware/mediaUpload');

const PUBLIC_UPLOADS = path.join(__dirname, '..', 'public', 'uploads');

// Reverse of mediaUpload.js's ext-by-mimetype maps, for tables that never
// stored a mime_type column (services, service_categories) — the extension
// on disk is the only signal left for Content-Type once migrating.
const MIME_BY_EXT = Object.fromEntries(
  Object.entries({ ...IMAGE_TYPES, ...VIDEO_TYPES }).map(([mime, ext]) => [ext, mime]),
);
function guessMimeType(filePath, fallback) {
  if (fallback) return fallback;
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * One entry per table an upload flow writes to. `urlCol`/`keyCol` name the
 * legacy-URL and new-key columns; `mimeCol` is null where the table has none.
 */
const TABLES = [
  { table: 'pandit_media', idCol: 'id', urlCol: 'media_url', keyCol: 'media_key', mimeCol: 'mime_type' },
  { table: 'temple_media', idCol: 'id', urlCol: 'media_url', keyCol: 'media_key', mimeCol: 'mime_type' },
  { table: 'services', idCol: 'id', urlCol: 'image_url', keyCol: 'image_key', mimeCol: null },
  { table: 'service_categories', idCol: 'id', urlCol: 'image_url', keyCol: 'image_key', mimeCol: null },
  { table: 'home_hero_images', idCol: 'id', urlCol: 'image_url', keyCol: 'image_key', mimeCol: 'mime_type' },
];

function parseArgs(argv) {
  const args = { execute: false, limit: 200, table: null, id: null };
  for (const raw of argv) {
    if (raw === '--execute') args.execute = true;
    else if (raw.startsWith('--limit=')) args.limit = parseInt(raw.slice('--limit='.length), 10) || args.limit;
    else if (raw.startsWith('--table=')) args.table = raw.slice('--table='.length);
    else if (raw.startsWith('--id=')) args.id = raw.slice('--id='.length);
  }
  return args;
}

async function migrateTable(client, spec, { execute, limit, id }) {
  const { table, idCol, urlCol, keyCol, mimeCol } = spec;
  const mimeSelect = mimeCol ? `, ${mimeCol}` : '';
  const params = [];
  let where = `${urlCol} LIKE '/uploads/%' AND ${keyCol} IS NULL`;
  if (id) { params.push(id); where += ` AND ${idCol} = $${params.length}`; }
  params.push(limit);

  const { rows } = await client.query(
    `SELECT ${idCol} AS id, ${urlCol} AS url${mimeSelect}
       FROM ${table}
      WHERE ${where}
      ORDER BY ${idCol}
      LIMIT $${params.length}`,
    params,
  );

  const summary = { table, found: rows.length, migrated: 0, skipped: 0, failed: 0 };
  if (!rows.length) return summary;

  console.log(`\n== ${table}: ${rows.length} row(s) to ${execute ? 'migrate' : 'preview'} ==`);

  for (const row of rows) {
    const relative = row.url.replace(/^\/uploads\//, '');
    const localPath = path.join(PUBLIC_UPLOADS, relative);
    const key = relative; // "<folder>/<filename>" — identical to the storage key scheme in use today

    try {
      if (!fs.existsSync(localPath)) {
        console.log(`  [SKIP] ${table}#${row.id}: local file missing (${localPath})`);
        summary.skipped += 1;
        continue;
      }

      if (!execute) {
        console.log(`  [DRY-RUN] ${table}#${row.id}: ${row.url} -> s3://${process.env.AWS_S3_MEDIA_BUCKET}/${key}`);
        summary.migrated += 1; // counted as "would migrate" in dry-run summaries
        continue;
      }

      const alreadyThere = await mediaStore.objectExists(key);
      if (!alreadyThere) {
        const buffer = await fs.promises.readFile(localPath);
        const mimeType = guessMimeType(localPath, mimeCol ? row[mimeCol] : null);
        await mediaStore.uploadExistingFile(key, buffer, mimeType);
      }

      const verified = await mediaStore.objectExists(key);
      if (!verified) {
        console.error(`  [FAIL] ${table}#${row.id}: upload did not verify (HeadObject failed after PutObject)`);
        summary.failed += 1;
        continue;
      }

      const newUrl = mediaStore.urlForKey(key);
      // The keyCol IS NULL guard makes this UPDATE itself idempotent even
      // against a concurrent second run of this script.
      const { rowCount } = await client.query(
        `UPDATE ${table} SET ${urlCol} = $1, ${keyCol} = $2 WHERE ${idCol} = $3 AND ${keyCol} IS NULL`,
        [newUrl, key, row.id],
      );
      if (rowCount === 0) {
        console.log(`  [SKIP] ${table}#${row.id}: already migrated by a concurrent run`);
        summary.skipped += 1;
        continue;
      }

      console.log(`  [OK]   ${table}#${row.id}: ${row.url} -> ${newUrl}`);
      summary.migrated += 1;
    } catch (err) {
      console.error(`  [FAIL] ${table}#${row.id}: ${err.message}`);
      summary.failed += 1;
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.AWS_S3_MEDIA_BUCKET || !process.env.MEDIA_CDN_BASE_URL) {
    console.error(
      'AWS_S3_MEDIA_BUCKET and MEDIA_CDN_BASE_URL must both be set (see .env.example) — '
      + 'there is nothing to migrate TO otherwise.',
    );
    process.exit(1);
  }

  const targets = args.table ? TABLES.filter((t) => t.table === args.table) : TABLES;
  if (args.table && !targets.length) {
    console.error(`Unknown --table=${args.table}. Known tables: ${TABLES.map((t) => t.table).join(', ')}`);
    process.exit(1);
  }

  console.log(`Mode: ${args.execute ? 'EXECUTE (will upload + update DB)' : 'DRY RUN (no changes — pass --execute to apply)'}`);
  console.log(`Bucket: ${process.env.AWS_S3_MEDIA_BUCKET}   CDN: ${process.env.MEDIA_CDN_BASE_URL}`);
  console.log(`Per-table limit: ${args.limit}${args.id ? `   id: ${args.id}` : ''}`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL
      || 'postgresql://panditconnect_app:panditconnect_app_dev@localhost:5433/panditconnect',
  });
  await client.connect();

  const summaries = [];
  try {
    for (const spec of targets) {
      summaries.push(await migrateTable(client, spec, args));
    }
  } finally {
    await client.end();
  }

  console.log('\n== Summary ==');
  let totalMigrated = 0;
  let totalFailed = 0;
  for (const s of summaries) {
    console.log(`  ${s.table}: found=${s.found} migrated=${s.migrated} skipped=${s.skipped} failed=${s.failed}`);
    totalMigrated += s.migrated;
    totalFailed += s.failed;
  }
  if (!args.execute) {
    console.log('\nDry run only — no files were uploaded and no database rows were changed. Re-run with --execute to apply.');
  }
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nMigration script failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
