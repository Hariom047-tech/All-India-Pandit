const bcrypt = require('bcryptjs');
const { query } = require('./src/config/db');

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);

  try {
    await query(
      `INSERT INTO users (email, password_hash, role, full_name, email_verified)
       VALUES ($1, $2, 'admin', 'Hariom Patidar', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin'`,
      [email, hash]
    );
    console.log('Admin user created successfully');
  } catch (err) {
    console.error('Error creating admin:', err.message);
  } finally {
    process.exit(0);
  }
}
createAdmin();
