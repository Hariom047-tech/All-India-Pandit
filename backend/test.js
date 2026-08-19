const { Client } = require('pg');
async function test() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();
  try {
    const { rows } = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'home_hero_images'");
    console.log('Columns:', rows);
  } catch(e) {
    console.error('Error:', e);
  } finally {
    client.end();
  }
}
test();
