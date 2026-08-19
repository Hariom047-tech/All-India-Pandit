/**
 * Create or update an admin user in the database.
 * Usage: node scripts/create-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME     = process.env.ADMIN_NAME || 'Admin';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.');
  process.exit(1);
}

async function run() {
  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // Check if admin already exists via SECURITY DEFINER function
    const { rows: existing } = await client.query(
      `SELECT * FROM auth_find_user_by_email($1)`, [ADMIN_EMAIL]
    );

    if (existing.length > 0) {
      const user = existing[0];
      console.log(`⚠️  User already exists: ${user.email} (role: ${user.role})`);

      // Update password + role to admin
      await client.query(`SET app.current_user_id = '${user.id}'`);
      await client.query(
        `UPDATE users SET password_hash = $1, role = 'admin', status = 'active', email_verified = TRUE WHERE id = $2`,
        [passwordHash, user.id]
      );
      console.log(`✅ Updated to admin role with new password.`);

      // Verify
      const { rows: check } = await client.query(
        `SELECT * FROM auth_find_user_by_email($1)`, [ADMIN_EMAIL]
      );
      const u = check[0];
      console.log('\n📋 Admin user state:');
      console.log(`   ID:     ${u.id}`);
      console.log(`   Email:  ${u.email}`);
      console.log(`   Name:   ${u.full_name}`);
      console.log(`   Role:   ${u.role}`);
      console.log(`   Status: ${u.status}`);
      return;
    }

    // Create new admin user
    const userId = crypto.randomUUID();
    await client.query(`SET app.current_user_id = '${userId}'`);
    const { rows } = await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
       VALUES ($1, $2, $3, $4, 'admin', 'active', TRUE)
       RETURNING id, email, full_name, role, status`,
      [userId, ADMIN_EMAIL, passwordHash, ADMIN_NAME]
    );

    const newUser = rows[0];
    console.log('\n✅ Admin user created successfully!');
    console.log(`   ID:     ${newUser.id}`);
    console.log(`   Email:  ${newUser.email}`);
    console.log(`   Name:   ${newUser.full_name}`);
    console.log(`   Role:   ${newUser.role}`);
    console.log(`   Status: ${newUser.status}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
