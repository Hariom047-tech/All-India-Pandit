#!/usr/bin/env node
/**
 * Deletes the LOCAL copy of media that has already been confirmed migrated
 * to S3 by migrate-media-to-s3.js. Deliberately a separate script from the
 * migration itself — see docs/S3_CLOUDFRONT_MIGRATION.md phase 9 / #14:
 * "copy, verify, update DB, production test, cleanup LATER", never
 * "move + delete immediately". Do not run this until production has been
 * observed serving the migrated media correctly.
 *
 * Safety:
 *   - dry-run by default, same as the migration script.
 *   - only ever considers a row whose key column is already set (i.e.
 *     migrate-media-to-s3.js already confirmed the S3 object exists at some
 *     point in the past) — never touches a row still on local-only storage.
 *   - re-verifies the S3 object exists RIGHT NOW, immediately before
 *     deleting the local file — if the object is missing (deleted out of
 *     band, wrong bucket, etc.) the local copy is left alone and the row is
 *     reported as a failure instead of silently losing the only copy.
 *   - a missing local file is not an error — it just means there is nothing
 *     to clean up for that row.
 *
 * Usage:
 *   node scripts/cleanup-legacy-media.js                  # dry run, all tables
 *   node scripts/cleanup-legacy-media.js --execute
 *   node scripts/cleanup-legacy-media.js --execute --table=pandit_media
 *   node scripts/cleanup-legacy-media.js --execute --limit=25
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const mediaStore = require('../src/services/media/mediaStorage');

const PUBLIC_UPLOADS = path.join(__dirname, '..', 'public', 'uploads');

const TABLES = [
  { table: 'pandit_media', idCol: 'id', keyCol: 'media_key' },
  { table: 'temple_media', idCol: 'id', keyCol: 'media_key' },
  { table: 'services', idCol: 'id', keyCol: 'image_key' },
  { table: 'service_categories', idCol: 'id', keyCol: 'image_key' },
  { table: 'home_hero_images', idCol: 'id', keyCol: 'image_key' },
];

function parseArgs(argv) {
  const args = { execute: false, limit: 500, table: null };
  for (const raw of argv) {
    if (raw === '--execute') args.execute = true;
    else if (raw.startsWith('--limit=')) args.limit = parseInt(raw.slice('--limit='.length), 10) || args.limit;
    else if (raw.startsWith('--table=')) args.table = raw.slice('--table='.length);
  }
  return args;
}

async function cleanupTable(client, spec, { execute, limit }) {
  const { table, idCol, keyCol } = spec;
  const { rows } = await client.query(
    `SELECT ${idCol} AS id, ${keyCol} AS key FROM ${table} WHERE ${keyCol} IS NOT NULL ORDER BY ${idCol} LIMIT $1`,
    [limit],
  );

  const summary = { table, found: rows.length, deleted: 0, missingLocally: 0, failed: 0 };
  if (!rows.length) return summary;

  console.log(`\n== ${table}: ${rows.length} migrated row(s) ==`);

  for (const row of rows) {
    const localPath = path.join(PUBLIC_UPLOADS, row.key);
    try {
      if (!fs.existsSync(localPath)) {
        summary.missingLocally += 1;
        continue; // already cleaned up, or never had a local copy — nothing to do
      }

      const stillInS3 = await mediaStore.objectExists(row.key);
      if (!stillInS3) {
        console.error(`  [FAIL] ${table}#${row.id}: S3 object missing for key ${row.key} — refusing to delete the only copy`);
        summary.failed += 1;
        continue;
      }

      if (!execute) {
        console.log(`  [DRY-RUN] ${table}#${row.id}: would delete ${localPath}`);
        summary.deleted += 1;
        continue;
      }

      await fs.promises.unlink(localPath);
      console.log(`  [OK]   ${table}#${row.id}: deleted ${localPath}`);
      summary.deleted += 1;
    } catch (err) {
      console.error(`  [FAIL] ${table}#${row.id}: ${err.message}`);
      summary.failed += 1;
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.AWS_S3_MEDIA_BUCKET) {
    console.error('AWS_S3_MEDIA_BUCKET is not set — refusing to run (nothing has been migrated to verify against).');
    process.exit(1);
  }

  const targets = args.table ? TABLES.filter((t) => t.table === args.table) : TABLES;
  if (args.table && !targets.length) {
    console.error(`Unknown --table=${args.table}. Known tables: ${TABLES.map((t) => t.table).join(', ')}`);
    process.exit(1);
  }

  console.log(`Mode: ${args.execute ? 'EXECUTE (will delete local files)' : 'DRY RUN (no deletions — pass --execute to apply)'}`);
  console.log('Only rows already confirmed migrated (key column set) are considered.');

  const client = new Client({
    connectionString: process.env.DATABASE_URL
      || 'postgresql://panditconnect_app:panditconnect_app_dev@localhost:5433/panditconnect',
  });
  await client.connect();

  const summaries = [];
  try {
    for (const spec of targets) {
      summaries.push(await cleanupTable(client, spec, args));
    }
  } finally {
    await client.end();
  }

  console.log('\n== Summary ==');
  let totalFailed = 0;
  for (const s of summaries) {
    console.log(`  ${s.table}: found=${s.found} deleted=${s.deleted} missingLocally=${s.missingLocally} failed=${s.failed}`);
    totalFailed += s.failed;
  }
  if (!args.execute) {
    console.log('\nDry run only — no files were deleted. Re-run with --execute to apply.');
  }
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nCleanup script failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
