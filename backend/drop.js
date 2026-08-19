const { Client } = require('pg');
async function test() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();
  try {
    await client.query("DROP TABLE IF EXISTS home_hero_images CASCADE");
    console.log('Dropped table home_hero_images');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    client.end();
  }
}
test();
