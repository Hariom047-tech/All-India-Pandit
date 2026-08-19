const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function reset() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Set ADMIN_PASSWORD env var before running this script.');
    process.exit(1);
  }
  const client = new Client(connectionString);
  await client.connect();
  try {
    const hash = await bcrypt.hash(password, 10);
    await client.query("UPDATE users SET password_hash = $1 WHERE email = 'admin@panditconnect.demo'", [hash]);
    console.log('Password updated.');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    client.end();
  }
}
reset();
