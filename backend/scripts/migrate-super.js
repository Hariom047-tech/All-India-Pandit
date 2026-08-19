/**
 * Applies migrations 04–10 as the postgres superuser.
 * Usage: node scripts/migrate-super.js <postgres-password>
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'src', 'db');
const MIGRATIONS = [
  '04-dynamic-content.sql',
  '05-temple-content.sql',
  '06-service-categories.sql',
  '07-online-puja.sql',
  '08-pandit-credentials.sql',
  '09-platform-reviews.sql',
  '10-temple-media-placement.sql',
];

async function main() {
  const pgPassword = process.argv[2];
  if (!pgPassword) {
    console.error('Usage: node scripts/migrate-super.js <your-postgres-password>');
    process.exit(1);
  }

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'panditconnect',
    user: 'postgres',
    password: pgPassword,
  });

  client.on('notice', (n) => console.log(`  NOTICE: ${n.message}`));

  await client.connect();
  console.log('✅ Connected as postgres superuser\n');

  try {
    for (const file of MIGRATIONS) {
      const filePath = path.join(DB_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${file} (not found)`);
        continue;
      }
      process.stdout.write(`Applying ${file}... `);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log('✅ done');
    }
    console.log('\n🎉 All migrations applied! Refresh the admin panel.');
  } catch (err) {
    console.error(`\n❌ Failed: ${err.message}`);
    if (err.hint) console.error(`   Hint: ${err.hint}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
