const bcrypt = require('bcryptjs');

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.');
  process.exit(1);
}

bcrypt.hash(password, 10).then(hash => {
  console.log(`INSERT INTO users (email, password_hash, role, full_name, email_verified) VALUES ('${email}', '${hash}', 'admin', 'Hariom Patidar', true) ON CONFLICT (email) DO UPDATE SET password_hash = '${hash}', role = 'admin';`);
});
