const { Client } = require('pg');

async function run() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/panditconnect');
  await client.connect();
  try {
    await client.query('BEGIN');

    const tables = [
      'reviews', 'pandit_services', 'pandit_temples', 'pandit_languages',
      'pandit_certificates', 'pandit_media', 'pandit_availability',
      'pandit_blocked_dates', 'pandit_analytics', 'pandit_subscriptions',
      'payment_transactions', 'saved_pandits', 'inquiries', 'pandits',
      'temple_services', 'temple_timings', 'temple_media', 'saved_temples',
      'temples', 'service_samagri', 'services', 'service_categories',
      'blog_posts', 'faqs'
    ];

    for (const table of tables) {
      await client.query(`DELETE FROM ${table}`);
    }

    await client.query(`DELETE FROM users WHERE role NOT IN ('admin', 'super_admin')`);

    await client.query('COMMIT');
    console.log('Database wiped as postgres superuser successfully.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
