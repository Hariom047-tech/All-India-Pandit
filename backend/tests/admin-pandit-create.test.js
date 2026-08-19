const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query } = require('../src/config/db');
const { request, uniq, withAdminContext, superQuery } = require('./helpers');
const repo = require('../src/repositories/admin/pandits.repository');

test('Admin pandit provisioning', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const base = () => ({
    email: `admincreated-${uniq()}@test.local`,
    fullName: 'Admin Created Pandit',
    slug: `admin-created-${uniq()}`,
    passwordHash: null,
    dateOfBirth: '1979-04-04',
    verificationStatus: 'verified',
    createdByAdminId: null,
  });

  await t.test('creates a linked user + pandit pair', async () => {
    const spec = { ...base(), passwordHash: await bcrypt.hash('TempPass123', 10) };
    const { user, pandit } = await repo.createFull(spec);
    const { rows } = await query('SELECT user_id, verification_status FROM pandits WHERE id = $1', [pandit.id]);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].verification_status, 'verified');
    const { rows: u } = await query('SELECT role, status, date_of_birth FROM users WHERE id = $1', [user.id]);
    assert.equal(u[0].role, 'pandit');
    assert.equal(u[0].status, 'active');
    assert.ok(u[0].date_of_birth, 'DOB stored for the reset flow');
  });

  await t.test('stores only a bcrypt hash, never the plaintext', async () => {
    const spec = { ...base(), passwordHash: await bcrypt.hash('TempPass123', 10) };
    const { user } = await repo.createFull(spec);
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    assert.ok(rows[0].password_hash.startsWith('$2'), 'must be a bcrypt hash');
    assert.notEqual(rows[0].password_hash, 'TempPass123');
    assert.ok(await bcrypt.compare('TempPass123', rows[0].password_hash));
  });

  await t.test('assigns the requested plan and an expiry', async () => {
    const spec = {
      ...base(), passwordHash: await bcrypt.hash('TempPass123', 10),
      planTier: 'gold', planBillingCycle: 'monthly',
      // The seeded 500-pandit dataset already saturates gold's seat cap
      // (see enforce_seat_cap(), migration 19) — this fixture is not a sale.
      allowSeatOverflow: true,
    };
    const { pandit } = await repo.createFull(spec);
    const { rows } = await query('SELECT current_tier, subscription_expires_at FROM pandits WHERE id = $1', [pandit.id]);
    assert.equal(rows[0].current_tier, 'gold');
    assert.ok(rows[0].subscription_expires_at);
    const { rows: subs } = await query('SELECT is_active FROM pandit_subscriptions WHERE pandit_id = $1', [pandit.id]);
    assert.equal(subs.length, 1);
    assert.equal(subs[0].is_active, true);
  });

  await t.test('a duplicate email is rejected', async () => {
    const spec = { ...base(), passwordHash: await bcrypt.hash('TempPass123', 10) };
    await repo.createFull(spec);
    await assert.rejects(
      () => repo.createFull({ ...spec, slug: `other-${uniq()}` }),
      (err) => err.code === '23505',
    );
  });

  await t.test('an INVALID PLAN rolls the whole transaction back — no orphan user or pandit', async () => {
    const spec = {
      ...base(),
      passwordHash: await bcrypt.hash('TempPass123', 10),
      planTier: 'platinum_does_not_exist',
    };
    await assert.rejects(() => repo.createFull(spec));

    const { rows: users } = await query('SELECT id FROM users WHERE email = $1', [spec.email]);
    assert.equal(users.length, 0, 'no orphan user row may survive');
    const { rows: pandits } = await query('SELECT id FROM pandits WHERE slug = $1', [spec.slug]);
    assert.equal(pandits.length, 0, 'no orphan pandit row may survive');
  });

  await t.test('admin password reset rotates the hash and revokes sessions', async () => {
    const spec = { ...base(), passwordHash: await bcrypt.hash('TempPass123', 10) };
    const { user, pandit } = await repo.createFull(spec);

    const login = await request(server, 'POST', '/api/auth/pandit/login', { email: spec.email, password: 'TempPass123' });
    assert.equal(login.status, 200);

    // withAdminContext: resetPassword's UPDATE relies on users_update_admin
    // RLS — the real admin controller calls it with a request-scoped query
    // executor that already carries that context (via requireAdmin
    // middleware); the bare app pool here has none, so this exercises the
    // same RLS path a genuine admin request takes.
    const newHash = await bcrypt.hash('AdminSet456', 10);
    const ok = await withAdminContext((q) => repo.resetPassword(q, pandit.id, newHash));
    assert.equal(ok, true);

    // superQuery: user_sessions RLS would otherwise scope this SELECT to
    // nothing, and rows.every() on an empty array is vacuously true — the
    // assertion would pass even if nothing had actually been revoked.
    const { rows } = await superQuery('SELECT revoked_at FROM user_sessions WHERE user_id = $1', [user.id]);
    assert.ok(rows.length > 0, 'the login above must have created a session to check');
    assert.ok(rows.every((r) => r.revoked_at !== null), 'every session must be revoked');

    const oldPw = await request(server, 'POST', '/api/auth/pandit/login', { email: spec.email, password: 'TempPass123' });
    assert.equal(oldPw.status, 401);
    const newPw = await request(server, 'POST', '/api/auth/pandit/login', { email: spec.email, password: 'AdminSet456' });
    assert.equal(newPw.status, 200);
  });

  await t.test('the /auth/me payload never contains date_of_birth', async () => {
    const spec = { ...base(), passwordHash: await bcrypt.hash('TempPass123', 10) };
    await repo.createFull(spec);
    const login = await request(server, 'POST', '/api/auth/pandit/login', { email: spec.email, password: 'TempPass123' });
    const me = await request(server, 'GET', '/api/auth/me', null, { Authorization: `Bearer ${login.body.token}` });
    assert.equal(me.status, 200);
    assert.ok(!('date_of_birth' in me.body), 'DOB must never be published');
    assert.ok(!('password_hash' in me.body));
    assert.ok(!('totp_secret_encrypted' in me.body));
  });
});
