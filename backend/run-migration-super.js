const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();

  try {
    const files = ['03-qualified-leads.sql', '04-dynamic-content.sql', '05-temple-content.sql', '06-service-categories.sql', '07-online-puja.sql', '08-pandit-credentials.sql'];
    for (const file of files) {
      const filePath = path.join(__dirname, 'src/db', file);
      if (fs.existsSync(filePath)) {
        console.log(`Applying ${file}...`);
        const sql = fs.readFileSync(filePath, 'utf8');
        try {
          await client.query(sql);
          console.log(`${file} applied successfully.`);
        } catch (e) {
          if (e.message.includes('already exists')) {
             console.log(`${file} already applied (or partially applied). Skipping error:`, e.message);
          } else {
             throw e;
          }
        }
      } else {
        console.log(`File ${file} not found.`);
      }
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
