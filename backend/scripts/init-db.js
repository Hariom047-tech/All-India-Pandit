#!/usr/bin/env node
/**
 * Applies backend/src/db/01-schema.sql then 02-seed.sql against DATABASE_URL.
 *
 * Docker Compose never needs this — the postgres image runs both files itself
 * via /docker-entrypoint-initdb.d/ on first container start. This script is
 * for running the backend against a Postgres that ISN'T freshly created by
 * that image: a local install, a remote dev database, or re-seeding a
 * container after `docker compose down` without `-v` (data dir already has
 * content, so postgres's own auto-init won't fire again).
 *
 * Run: DATABASE_URL=postgresql://... node backend/scripts/init-db.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_DIR = path.join(__dirname, '..', 'src', 'db');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const file of ['01-schema.sql', '02-seed.sql']) {
      const sql = fs.readFileSync(path.join(DB_DIR, file), 'utf8');
      console.log(`applying ${file}...`);
      await client.query(sql); // no params → simple query protocol → runs every ';'-separated statement
    }
    console.log('Database schema + seed applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
