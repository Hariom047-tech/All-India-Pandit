const { Client } = require('pg');
async function test() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();
  try {
    const { rows } = await client.query("SELECT email, role, status FROM users WHERE role = 'admin'");
    console.log('Admins:', rows);
  } catch(e) {
    console.error('Error:', e);
  } finally {
    client.end();
  }
}
test();
