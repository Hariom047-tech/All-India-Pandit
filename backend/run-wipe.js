const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const client = new Client('postgresql://panditconnect_app:panditconnect_app_dev@localhost:5432/panditconnect');
  await client.connect();
  try {
    const sql = fs.readFileSync('wipe.sql', 'utf8');
    await client.query(sql);
    console.log('Database wiped successfully.');
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
