const http = require('node:http');
const crypto = require('node:crypto');
const { Pool } = require('pg');

/**
 * A privileged connection for test FIXTURE SETUP only — never for anything
 * under test.
 *
 * The app's own pool (config/db.js) connects as panditconnect_app, which has
 * NO bypass of Row-Level Security. `users_update_self`/`users_update_admin`
 * mean a bare `query('UPDATE users SET status = ...')` with no RLS context
 * set silently updates ZERO rows — no error, just a no-op — and
 * password_reset_challenges has no UPDATE policy at all, so not even an
 * admin context can write to it directly.
 *
 * This connects as the bootstrap superuser (docker-compose's POSTGRES_USER,
 * which owns the schema and has BYPASSRLS) purely so a test can force state
 * a real user action would eventually cause (a devotee's phone getting
 * verified, a token's clock running out) without needing to drive the actual
 * flow that produces it. Code under test never uses this connection.
 */
const superPool = new Pool({
  connectionString: process.env.SUPER_DATABASE_URL
    || (process.env.DATABASE_URL || '').replace('panditconnect_app:panditconnect_app_dev', 'panditconnect:panditconnect')
    || 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect',
});
const superQuery = (text, params) => superPool.query(text, params);

/**
 * Runs `fn(q)` with app.current_user_id set to a fixture admin, so
 * current_app_user_is_admin() is true for the duration — the same RLS path a
 * real admin request takes (unlike superQuery, which bypasses RLS entirely).
 * Use this when the test's intent IS "an admin did this"; use superQuery for
 * plain arrangement that doesn't correspond to any real actor.
 *
 * The admin row is created once (via INSERT, which — unlike UPDATE — has no
 * restrictive users_insert_self check) and reused for the life of the test
 * process.
 */
const { withUserContext } = require('../src/config/db');
let cachedAdminId = null;
async function withAdminContext(fn) {
  if (!cachedAdminId) {
    const email = `fixture-admin-${crypto.randomBytes(6).toString('hex')}@test.local`;
    const { rows } = await superQuery(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ($1, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu', 'Fixture Admin', 'admin', 'active')
       RETURNING id`,
      [email],
    );
    cachedAdminId = rows[0].id;
  }
  return withUserContext(cachedAdminId, fn);
}

/** Minimal HTTP client so tests exercise the real Express stack end to end. */
function request(server, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, path, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Same as `request`, but for endpoints that don't return JSON (sitemap.xml,
 *  the server-rendered HTML shell) — `request`'s auto-JSON.parse would throw
 *  on these. Returns the raw text body instead. */
function requestRaw(server, method, path, headers) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({
      host: '127.0.0.1', port, path, method, headers: headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const uniq = () => crypto.randomBytes(6).toString('hex');

/**
 * Registers a devotee and, when verified=true, marks the phone verified
 * directly in the database — the OTP delivery channel is a console.log in
 * this environment, so going through the real OTP endpoint would test the
 * placeholder rather than the qualification rule we care about.
 */
async function makeDevotee(server, { verified = true, status = 'active' } = {}) {
  const email = `devotee-${uniq()}@test.local`;
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await request(server, 'POST', '/api/auth/register', {
    email, password: 'TestPass123', fullName: 'Test Devotee', phone,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const token = res.body.token;
  const userId = res.body.user.id;
  // superQuery, not the app pool: users_update_self/_admin RLS would
  // otherwise make this a silent no-op (0 rows), leaving phone_verified
  // false and every qualified-lead test built on this helper failing for a
  // reason that has nothing to do with the qualification rule under test.
  await superQuery('UPDATE users SET phone_verified = $2, status = $3 WHERE id = $1', [userId, verified, status]);
  return { token, userId, email, phone };
}

/** Provisions a pandit the way an admin would, straight through the repository. */
async function makePandit(overrides = {}) {
  const bcrypt = require('bcryptjs');
  const repo = require('../src/repositories/admin/pandits.repository');
  const password = overrides.password || 'PanditPass123';
  const email = overrides.email || `pandit-${uniq()}@test.local`;
  const slug = overrides.slug || `test-pandit-${uniq()}`;
  const { user, pandit } = await repo.createFull({
    email,
    fullName: overrides.fullName || 'Test Pandit',
    phone: overrides.phone || `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
    slug,
    passwordHash: await bcrypt.hash(password, 10),
    dateOfBirth: overrides.dateOfBirth || '1980-05-15',
    verificationStatus: 'verified',
    planTier: overrides.planTier,
    createdByAdminId: null,
    // The seeded 500-pandit dataset already saturates every paid tier's seat
    // cap (see enforce_seat_cap(), migration 19) — a test fixture is not a
    // sale that cap exists to stop.
    allowSeatOverflow: true,
    ...overrides.extra,
  });
  return { user, pandit, email, slug, password, dateOfBirth: overrides.dateOfBirth || '1980-05-15' };
}

async function countLeads(panditId) {
  // superQuery: qualified_leads RLS scopes SELECT to the owning pandit's own
  // session — a bare query here would always see zero rows.
  const { rows } = await superQuery('SELECT COUNT(*)::int AS c FROM qualified_leads WHERE pandit_id = $1', [panditId]);
  return rows[0].c;
}

module.exports = { request, requestRaw, auth, uniq, makeDevotee, makePandit, countLeads, superQuery, withAdminContext };
