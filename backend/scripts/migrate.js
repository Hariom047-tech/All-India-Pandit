#!/usr/bin/env node
/**
 * Applies the incremental migrations (everything after 02-seed.sql) to an
 * EXISTING database, without touching schema or seed data.
 *
 * Migrations use ALTER TABLE / CREATE EXTENSION which require table ownership.
 * Set DATABASE_OWNER_URL (superuser) in .env — the script prefers it over
 * DATABASE_URL (app role). Falls back to DATABASE_URL if owner URL is absent.
 *
 * Safe to run repeatedly — every migration is written to be idempotent.
 *
 *   npm run db:migrate
 *   DATABASE_OWNER_URL=postgresql://owner:pass@host:5433/db npm run db:migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_DIR = path.join(__dirname, '..', 'src', 'db');
const MIGRATIONS = fs.readdirSync(DB_DIR)
  .filter((f) => /^\d+.*\.sql$/.test(f) && !f.startsWith('01-') && !f.startsWith('02-'))
  .sort();

async function main() {
  // Migrations need the table owner (superuser). Use DATABASE_OWNER_URL when
  // set, otherwise fall back to DATABASE_URL and hope it has enough privilege.
  const url = process.env.DATABASE_OWNER_URL
    || process.env.DATABASE_URL
    || 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect';
  const usingOwner = !!process.env.DATABASE_OWNER_URL;
  const client = new Client({ connectionString: url });

  // Surface RAISE NOTICE from the migration's own self-check.
  client.on('notice', (n) => console.log(`  ${n.message}`));

  await client.connect();
  console.log(`Connected: ${url.replace(/:[^:@/]*@/, ':***@')} (${usingOwner ? 'owner' : 'app role — may lack ALTER TABLE privilege'})`);
  try {
    if (!MIGRATIONS.length) { console.log('No migrations found.'); return; }
    for (const file of MIGRATIONS) {
      process.stdout.write(`Applying ${file}... `);
      await client.query(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
      console.log('done');
    }
    console.log('\nAll migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  if (err.hint) console.error('Hint:', err.hint);
  console.error(
    '\nHint: migrations need the table owner. Set DATABASE_OWNER_URL in .env:\n'
    + '  DATABASE_OWNER_URL=postgresql://panditconnect:panditconnect@localhost:5433/panditconnect\n'
    + 'Or start fresh: docker compose down -v && docker compose up -d --build',
  );
  process.exit(1);
});
