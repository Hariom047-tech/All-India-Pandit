const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'src/db/03-qualified-leads.sql'), 'utf8');
    await client.query(sql);
    console.log('Migration 03-qualified-leads.sql applied successfully.');
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
