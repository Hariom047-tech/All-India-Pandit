// Scales rate-limit ceilings up (never removes them) — see
// middleware/security.js's TEST_RATE_LIMIT_SCALE. Must be set before
// requiring app.js, which registers the actual limiter instances.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { query } = require('../src/config/db');
const { request, auth, makeDevotee, makePandit, uniq, superQuery } = require('./helpers');

test('Pandit login', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('valid pandit credentials return a session and profile slug', async () => {
    const p = await makePandit();
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'pandit');
    assert.equal(res.body.pandit.slug, p.slug);
  });

  await t.test('login response never contains the password hash or the DOB', async () => {
    const p = await makePandit();
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('password_hash'));
    assert.ok(!serialized.includes('date_of_birth'));
    assert.ok(!serialized.includes('1980-05-15'));
  });

  await t.test('wrong password is rejected with the generic message', async () => {
    const p = await makePandit();
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: 'WrongPass123' });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Login nahi ho paya/);
  });

  await t.test('unknown email gives the SAME message as a wrong password (no enumeration)', async () => {
    const unknown = await request(server, 'POST', '/api/auth/pandit/login',
      { email: `nobody-${uniq()}@test.local`, password: 'WrongPass123' });
    const p = await makePandit();
    const wrongPw = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: 'WrongPass123' });
    assert.equal(unknown.status, wrongPw.status);
    assert.deepEqual(unknown.body, wrongPw.body);
  });

  await t.test('a devotee cannot use the pandit door', async () => {
    const email = `dev-${uniq()}@test.local`;
    await request(server, 'POST', '/api/auth/register', { email, password: 'TestPass123', fullName: 'Dev' });
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email, password: 'TestPass123' });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /sirf registered Pandit Ji accounts/);
  });

  await t.test('a suspended pandit cannot log in', async () => {
    const p = await makePandit();
    // superQuery: the app pool's users_update_self/_admin RLS policies make
    // a bare UPDATE here a silent no-op (0 rows) — see helpers.js.
    await superQuery('UPDATE users SET status = $2 WHERE id = $1', [p.user.id, 'suspended']);
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    assert.equal(res.status, 403);
  });
});

test('Pandit DOB password reset', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('correct email + correct DOB issues a reset challenge', async () => {
    const p = await makePandit({ dateOfBirth: '1975-03-09' });
    const res = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1975-03-09' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.resetToken);
  });

  await t.test('correct email + WRONG DOB fails generically', async () => {
    const p = await makePandit({ dateOfBirth: '1975-03-09' });
    const res = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1975-03-10' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Details verify nahi ho paayi.');
    assert.ok(!res.body.resetToken);
  });

  await t.test('wrong email gives the IDENTICAL response to a wrong DOB', async () => {
    const p = await makePandit({ dateOfBirth: '1975-03-09' });
    const wrongDob = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1975-03-10' });
    const wrongEmail = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: `nobody-${uniq()}@test.local`, dateOfBirth: '1975-03-09' });
    assert.equal(wrongDob.status, wrongEmail.status);
    assert.deepEqual(wrongDob.body, wrongEmail.body);
  });

  await t.test('a devotee account cannot be reset through the pandit path', async () => {
    const email = `dev-${uniq()}@test.local`;
    const reg = await request(server, 'POST', '/api/auth/register', { email, password: 'TestPass123', fullName: 'Dev' });
    await superQuery('UPDATE users SET date_of_birth = $2 WHERE id = $1', [reg.body.user.id, '1990-01-01']);
    const res = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email, dateOfBirth: '1990-01-01' });
    assert.equal(res.status, 400);
  });

  await t.test('malformed / impossible dates are rejected', async () => {
    const p = await makePandit();
    for (const bad of ['15-05-1980', '1980-02-30', 'yesterday', '2099-01-01', '']) {
      const res = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
        { email: p.email, dateOfBirth: bad });
      assert.equal(res.status, 400, `expected rejection for "${bad}"`);
    }
  });

  await t.test('full happy path: old password stops working, new one works', async () => {
    const p = await makePandit({ dateOfBirth: '1982-07-21' });
    const challenge = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1982-07-21' });
    const reset = await request(server, 'POST', '/api/auth/pandit/reset-password', {
      resetToken: challenge.body.resetToken, newPassword: 'BrandNew456', confirmPassword: 'BrandNew456',
    });
    assert.equal(reset.status, 200);

    const oldLogin = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    assert.equal(oldLogin.status, 401, 'old password must stop working');

    const newLogin = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: 'BrandNew456' });
    assert.equal(newLogin.status, 200, 'new password must work');
  });

  await t.test('a reset token is single-use', async () => {
    const p = await makePandit({ dateOfBirth: '1982-07-21' });
    const challenge = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1982-07-21' });
    const token = challenge.body.resetToken;
    const first = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: token, newPassword: 'FirstPass123', confirmPassword: 'FirstPass123' });
    const second = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: token, newPassword: 'SecondPass123', confirmPassword: 'SecondPass123' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
  });

  await t.test('an expired reset token is refused', async () => {
    const p = await makePandit({ dateOfBirth: '1982-07-21' });
    const challenge = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1982-07-21' });
    // superQuery: password_reset_challenges has no UPDATE RLS policy at all
    // (by design — see 03-qualified-leads.sql), so not even an admin context
    // can write to it directly; the app pool would silently update 0 rows.
    await superQuery(`UPDATE password_reset_challenges SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1`, [p.user.id]);
    const res = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: challenge.body.resetToken, newPassword: 'BrandNew456', confirmPassword: 'BrandNew456' });
    assert.equal(res.status, 400);
  });

  await t.test('weak passwords and mismatches are refused', async () => {
    const p = await makePandit({ dateOfBirth: '1982-07-21' });
    const mk = async () => (await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1982-07-21' })).body.resetToken;

    const short = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: await mk(), newPassword: 'Ab1', confirmPassword: 'Ab1' });
    assert.equal(short.status, 400);

    const noDigit = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: await mk(), newPassword: 'onlyletters', confirmPassword: 'onlyletters' });
    assert.equal(noDigit.status, 400);

    const mismatch = await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: await mk(), newPassword: 'GoodPass123', confirmPassword: 'OtherPass123' });
    assert.equal(mismatch.status, 400);
  });

  await t.test('a successful reset revokes every existing session', async () => {
    const p = await makePandit({ dateOfBirth: '1991-11-11' });
    const login = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    const token = login.body.token;
    assert.equal((await request(server, 'GET', '/api/auth/me', null, auth(token))).status, 200);

    const challenge = await request(server, 'POST', '/api/auth/pandit/reset-password/verify',
      { email: p.email, dateOfBirth: '1991-11-11' });
    await request(server, 'POST', '/api/auth/pandit/reset-password',
      { resetToken: challenge.body.resetToken, newPassword: 'RotatedPass9', confirmPassword: 'RotatedPass9' });

    const after = await request(server, 'GET', '/api/auth/me', null, auth(token));
    assert.equal(after.status, 401, 'the pre-reset session must be dead');
  });
});

test('Pandit dashboard, leads and ownership', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  async function loginPandit(p) {
    const res = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    return res.body.token;
  }

  await t.test('dashboard reports real qualified-lead counts and separates views', async () => {
    const p = await makePandit({ planTier: 'gold' });
    const token = await loginPandit(p);

    const d1 = await makeDevotee(server);
    const d2 = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d1.token));
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'whatsapp' }, auth(d2.token));
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' });          // guest
    await request(server, 'POST', `/api/pandits/${p.slug}/view`, {});                            // view

    const res = await request(server, 'GET', '/api/me/dashboard', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.qualifiedLeads.today, 2, 'guest click must not count');
    assert.equal(res.body.analytics.ctaClicks, 3, 'CTA clicks include the guest');
    assert.equal(res.body.analytics.verifiedInteractions, 2);
    assert.equal(res.body.analytics.qualifiedLeadCount, 2);
    assert.equal(res.body.plan.tier, 'gold');
    assert.ok(res.body.views, 'views block present');
  });

  await t.test('the dashboard exposes no viewer identity', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/view`, {}, auth(d.token));
    const res = await request(server, 'GET', '/api/me/dashboard', null, auth(token));
    assert.ok(!JSON.stringify(res.body.views).includes(d.userId));
    assert.equal(typeof res.body.views.total, 'number');
  });

  await t.test('leads list shows the devotee name and verified mobile', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'whatsapp' }, auth(d.token));

    const res = await request(server, 'GET', '/api/me/leads', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].contact_name, 'Test Devotee');
    assert.equal(res.body.data[0].contact_phone, d.phone);
  });

  await t.test('leads never leak email, DOB or password fields', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d.token));
    const res = await request(server, 'GET', '/api/me/leads', null, auth(token));
    const s = JSON.stringify(res.body);
    assert.ok(!s.includes('password'));
    assert.ok(!s.includes('date_of_birth'));
    assert.ok(!s.includes(d.email));
  });

  await t.test('Pandit A cannot see Pandit B leads', async () => {
    const a = await makePandit();
    const b = await makePandit();
    const tokenA = await loginPandit(a);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${b.slug}/click`, { method: 'call' }, auth(d.token));

    const res = await request(server, 'GET', '/api/me/leads', null, auth(tokenA));
    // paginationEnvelope nests the count under meta, not top-level.
    assert.equal(res.body.meta.total, 0, "A's list must not contain B's lead");
  });

  await t.test('Pandit A cannot re-status Pandit B lead by id', async () => {
    const a = await makePandit();
    const b = await makePandit();
    const tokenA = await loginPandit(a);
    const d = await makeDevotee(server);
    const click = await request(server, 'POST', `/api/pandits/${b.slug}/click`, { method: 'call' }, auth(d.token));
    const leadId = click.body.leadId;

    const res = await request(server, 'PATCH', `/api/me/leads/${leadId}`, { status: 'completed' }, auth(tokenA));
    assert.equal(res.status, 404, 'must be indistinguishable from "does not exist"');

    // superQuery: qualified_leads RLS scopes SELECT to the owning pandit's
    // own session — a bare query here would see nothing at all.
    const { rows } = await superQuery('SELECT status FROM qualified_leads WHERE id = $1', [leadId]);
    assert.equal(rows[0].status, 'new', "B's lead must be untouched");
  });

  await t.test('a pandit CAN re-status their own lead, and it stays in the counts', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    const click = await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d.token));

    const res = await request(server, 'PATCH', `/api/me/leads/${click.body.leadId}`, { status: 'contacted' }, auth(token));
    assert.equal(res.status, 200);

    const dash = await request(server, 'GET', '/api/me/dashboard', null, auth(token));
    assert.equal(dash.body.qualifiedLeads.today, 1, 'status change must not remove it from statistics');
  });

  await t.test('a devotee gets no pandit dashboard', async () => {
    const d = await makeDevotee(server);
    const res = await request(server, 'GET', '/api/me/dashboard', null, auth(d.token));
    assert.equal(res.status, 404);
  });

  await t.test('/me/leads requires authentication', async () => {
    assert.equal((await request(server, 'GET', '/api/me/leads')).status, 401);
  });

  await t.test('leads trend is zero-filled and matches the real lead count', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d.token));

    const res = await request(server, 'GET', '/api/me/leads/trend?days=7', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.points.length, 7, 'must be zero-filled to the full window');
    const todayPoint = res.body.points[res.body.points.length - 1];
    assert.equal(todayPoint.leads, 1);
    assert.equal(res.body.points.slice(0, -1).every((pt) => pt.leads === 0), true, 'no leads on earlier days');
  });

  await t.test('leads trend rejects an unlisted window', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const res = await request(server, 'GET', '/api/me/leads/trend?days=13', null, auth(token));
    assert.equal(res.status, 400);
  });

  await t.test('leads geo derives country from the verified phone and city from the profile', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server); // +9199... => IN
    await superQuery('UPDATE users SET city = $2, state = $3 WHERE id = $1', [d.userId, 'Indore', 'Madhya Pradesh']);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d.token));

    const res = await request(server, 'GET', '/api/me/leads/geo', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.countries[0].code, 'IN');
    assert.equal(res.body.countries[0].count, 1);
    assert.equal(res.body.cities[0].city, 'Indore');
  });

  await t.test('leads geo never leaks the phone number itself', async () => {
    const p = await makePandit();
    const token = await loginPandit(p);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'whatsapp' }, auth(d.token));

    const res = await request(server, 'GET', '/api/me/leads/geo', null, auth(token));
    assert.ok(!JSON.stringify(res.body).includes(d.phone));
  });

  await t.test('Pandit A geo/trend never includes Pandit B leads', async () => {
    const a = await makePandit();
    const b = await makePandit();
    const tokenA = await loginPandit(a);
    const d = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${b.slug}/click`, { method: 'call' }, auth(d.token));

    const geo = await request(server, 'GET', '/api/me/leads/geo', null, auth(tokenA));
    assert.equal(geo.body.total, 0);
    const trend = await request(server, 'GET', '/api/me/leads/trend?days=7', null, auth(tokenA));
    assert.equal(trend.body.points.every((pt) => pt.leads === 0), true);
  });

  await t.test('a pandit cannot self-award verification or a paid tier', async () => {
    const p = await makePandit({ planTier: 'free' });
    const token = await loginPandit(p);
    await request(server, 'PUT', '/api/me/pandit-profile', {
      bio: 'Legit bio update',
      verificationStatus: 'verified', currentTier: 'diamond', isFeatured: true, rankScore: 9999,
    }, auth(token));

    const { rows } = await query(
      'SELECT current_tier, is_featured FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(rows[0].current_tier, 'free', 'tier must be unchanged');
    assert.equal(rows[0].is_featured, false, 'featured must be unchanged');
  });
});
