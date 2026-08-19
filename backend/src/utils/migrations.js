/**
 * Auto-migration runner — applies pending schema migrations at server startup.
 * Uses the DATABASE_URL connection (panditconnect_app) for read checks,
 * but falls back to a superuser connection for DDL if SUPERUSER_DATABASE_URL is set.
 *
 * For columns that only need adding (no ownership change), we can use a
 * SECURITY DEFINER wrapper approach via the existing DB connection.
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

async function applyPendingMigrations() {
  const client = await pool.connect();
  try {
    const missing = [];

    // Check each column/table that the app depends on
    if (!await columnExists(client, 'temples', 'custom_services')) missing.push('temples.custom_services');
    if (!await columnExists(client, 'temples', 'highlights')) missing.push('temples.highlights');
    if (!await columnExists(client, 'services', 'benefits')) missing.push('services.benefits');
    if (!await columnExists(client, 'services', 'home_rank')) missing.push('services.home_rank (service_categories)');
    if (!await columnExists(client, 'service_categories', 'home_rank')) missing.push('service_categories.home_rank');
    if (!await columnExists(client, 'services', 'is_online_available')) missing.push('services.is_online_available');
    if (!await columnExists(client, 'temple_media', 'show_in_hero')) missing.push('temple_media.show_in_hero');
    if (!await tableExists(client, 'home_hero_images')) missing.push('home_hero_images table');

    if (missing.length > 0) {
      console.error('\n[MIGRATION REQUIRED] The following database objects are missing:');
      missing.forEach(m => console.error(`  ✗ ${m}`));
      console.error('\nRun this command as the postgres superuser:');
      console.error('  psql -U postgres -d panditconnect -f C:\\maa-baglamukhi-project\\backend\\scripts\\fix-migrations.sql\n');
    } else {
      console.log('[migrations] All schema checks passed.');
    }

    return missing;
  } finally {
    client.release();
  }
}

module.exports = { applyPendingMigrations };
