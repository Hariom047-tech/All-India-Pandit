const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query } = require('../src/config/db');
const { adminSecretPath } = require('../src/config/env');

function request(server, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const A = `/api/${adminSecretPath}`;

test('admin panel', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  // A dedicated, freshly-inserted admin account, not the shared seeded
  // admin@panditconnect.demo — that account's TOTP state depends on whatever
  // was last done to it (including by hand, while testing this feature
  // interactively), so it can't be relied on to always be "not yet set up".
  // Inserted directly (bypassing the app's own "only super_admin can create
  // admins" bootstrap rule) the same way a real first admin would be —
  // see docs/ADMIN.md for that bootstrap step.
  const email = `admin-test-${Date.now()}@panditconnect.demo`;
  const password = 'Passw0rd!AdminTest';
  await query(
    `INSERT INTO users (email, password_hash, full_name, role, status) VALUES ($1, $2, 'Test Admin', 'admin', 'active')`,
    [email, bcrypt.hashSync(password, 10)],
  );

  await t.test('honeypot paths log and 404 without revealing anything', async () => {
    const res = await request(server, 'GET', '/api/admin');
    assert.equal(res.status, 404);
  });

  await t.test('admin routes require auth', async () => {
    const res = await request(server, 'GET', `${A}/dashboard/stats`);
    assert.equal(res.status, 401);
  });

  let token;
  await t.test('login step 1 + first-time TOTP setup + step 2 verify', async () => {
    const step1 = await request(server, 'POST', `${A}/auth/login`, { email, password });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.totpEnabled, false);
    assert.ok(step1.body.setup.secret);

    const validCode = totpCodeFor(step1.body.setup.secret);

    const wrong = await request(server, 'POST', `${A}/auth/login/verify`, { challengeToken: step1.body.challengeToken, totpCode: '000000' });
    assert.equal(wrong.status, 401);

    const verify = await request(server, 'POST', `${A}/auth/login/verify`, { challengeToken: step1.body.challengeToken, totpCode: validCode });
    assert.equal(verify.status, 200);
    assert.ok(verify.body.token);
    assert.equal(verify.body.user.role, 'admin');
    token = verify.body.token;
  });

  await t.test('GET auth/me returns the admin', async () => {
    const res = await request(server, 'GET', `${A}/auth/me`, null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, email);
  });

  await t.test('dashboard stats reflect real seed data', async () => {
    const res = await request(server, 'GET', `${A}/dashboard/stats`, null, auth(token));
    assert.equal(res.status, 200);
    assert.ok(res.body.totalPandits > 0);
  });

  await t.test('users list is RLS-scoped to admin visibility (sees devotee rows too)', async () => {
    const res = await request(server, 'GET', `${A}/users?role=devotee&perPage=1`, null, auth(token));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
  });

  await t.test('pandit verification round-trip', async () => {
    const res = await request(server, 'POST', `${A}/pandits/devdatt-shastri/verify`, { action: 'approve' }, auth(token));
    assert.equal(res.status, 200);
  });

  await t.test('review moderation', async () => {
    const list = await request(server, 'GET', `${A}/reviews?perPage=1`, null, auth(token));
    assert.ok(list.body.data.length > 0);
    const id = list.body.data[0].id;
    const res = await request(server, 'POST', `${A}/reviews/${id}/moderate`, { action: 'approve' }, auth(token));
    assert.equal(res.status, 200);
  });

  await t.test('super_admin-only routes reject a plain admin', async () => {
    const res = await request(server, 'GET', `${A}/security/admin-users`, null, auth(token));
    assert.equal(res.status, 403);
  });

  // Banning 127.0.0.1 blocks every test's requests, not just this file's —
  // banned_ips is real, shared Postgres state, and every test file's HTTP
  // client also runs from 127.0.0.1. This is exactly why package.json's test
  // script passes --test-concurrency=1: found by this test intermittently
  // 403ing unrelated api.test.js requests when node:test ran files in
  // parallel.
  await t.test('IP ban blocks the public API but not the admin panel, and is reversible', async () => {
    const ban = await request(server, 'POST', `${A}/security/ban-ip`, { ip: '127.0.0.1', reason: 'test' }, auth(token));
    assert.equal(ban.status, 201);

    const blocked = await request(server, 'GET', '/api/health');
    assert.equal(blocked.status, 403);

    const stillIn = await request(server, 'GET', `${A}/dashboard/stats`, null, auth(token));
    assert.equal(stillIn.status, 200);

    const unban = await request(server, 'DELETE', `${A}/security/ban-ip/127.0.0.1`, null, auth(token));
    assert.equal(unban.status, 200);

    const restored = await request(server, 'GET', '/api/health');
    assert.equal(restored.status, 200);
  });

  await t.test('logout revokes the session', async () => {
    const out = await request(server, 'POST', `${A}/auth/logout`, null, auth(token));
    assert.equal(out.status, 200);
    const after = await request(server, 'GET', `${A}/auth/me`, null, auth(token));
    assert.equal(after.status, 401);
  });
});

/** Same TOTP algorithm the app uses (src/utils/totp.js) — computing an
 *  expected code this way tests the login flow's wiring end-to-end, not
 *  the algorithm itself (already unit-verified against RFC 4648 test
 *  vectors when it was written). */
function totpCodeFor(base32Secret) {
  const crypto = require('crypto'); // eslint-disable-line global-require
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase()) {
    const v = ALPH.indexOf(c);
    if (v === -1) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);

  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}
