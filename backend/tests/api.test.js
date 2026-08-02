const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');

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
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('backend API', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  await t.test('GET /api/health', async () => {
    const res = await request(server, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  await t.test('GET /api/temples filters by city', async () => {
    const res = await request(server, 'GET', '/api/temples?city=Varanasi');
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 1);
    assert.equal(res.body.data[0].name, 'Kashi Vishwanath Temple');
  });

  await t.test('GET /api/temples/:id 404s for an unknown id', async () => {
    const res = await request(server, 'GET', '/api/temples/does-not-exist');
    assert.equal(res.status, 404);
  });

  await t.test('GET /api/temples/:id includes available pandits', async () => {
    const res = await request(server, 'GET', '/api/temples/kashi-vishwanath');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.availablePandits));
    assert.ok(res.body.availablePandits.length > 0);
  });

  await t.test('GET /api/pandits filters by service and language', async () => {
    const res = await request(server, 'GET', '/api/pandits?service=wedding&lang=Tamil');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.every((p) => p.services.includes('wedding') && p.langs.includes('Tamil')));
  });

  await t.test('GET /api/services/:id includes pandits and temples', async () => {
    const res = await request(server, 'GET', '/api/services/kaal-sarp');
    assert.equal(res.status, 200);
    assert.ok(res.body.pandits.length > 0);
    assert.ok(res.body.temples.length > 0);
  });

  await t.test('POST /api/recommend matches "naya ghar liya hai" to Griha Pravesh', async () => {
    const res = await request(server, 'POST', '/api/recommend', { text: 'naya ghar liya hai' });
    assert.equal(res.status, 200);
    assert.equal(res.body.matched, true);
    assert.ok(res.body.services.some((s) => s.slug === 'griha-pravesh'));
  });

  await t.test('POST /api/contact rejects an invalid email', async () => {
    const res = await request(server, 'POST', '/api/contact', { name: 'x', email: 'bad', message: 'hi' });
    assert.equal(res.status, 400);
  });

  await t.test('POST /api/contact accepts a valid message', async () => {
    const res = await request(server, 'POST', '/api/contact', { name: 'Test', email: 't@example.com', message: 'hello' });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  await t.test('POST /api/newsletter dedupes an existing subscriber', async () => {
    const email = `dup-${Date.now()}@example.com`;
    const first = await request(server, 'POST', '/api/newsletter', { email });
    const second = await request(server, 'POST', '/api/newsletter', { email });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.alreadySubscribed, true);
  });

  await t.test('POST /api/pandits/:id/enquiry requires name and phone', async () => {
    const res = await request(server, 'POST', '/api/pandits/ramesh-sharma/enquiry', { name: 'A' });
    assert.equal(res.status, 400);
  });

  await t.test('POST /api/pandits/:id/enquiry records an anonymous enquiry', async () => {
    const res = await request(server, 'POST', '/api/pandits/ramesh-sharma/enquiry', { name: 'Devotee', phone: '+919999900001' });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
  });

  await t.test('POST /api/temples/:id/inquiry routes to one of the temple\'s pandits', async () => {
    const res = await request(server, 'POST', '/api/temples/kashi-vishwanath/inquiry', { name: 'Devotee', phone: '+919999900002', service: 'rudrabhishek' });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
  });

  await t.test('unknown route 404s', async () => {
    const res = await request(server, 'GET', '/api/nope');
    assert.equal(res.status, 404);
  });

  // ---------------------------------------------------------------- auth
  let token;
  const email = `devotee-${Date.now()}@example.com`;

  await t.test('POST /api/auth/register creates a session', async () => {
    const res = await request(server, 'POST', '/api/auth/register', { email, password: 'Passw0rd!', fullName: 'Test Devotee' });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'devotee');
    token = res.body.token;
  });

  await t.test('POST /api/auth/register rejects a duplicate email', async () => {
    const res = await request(server, 'POST', '/api/auth/register', { email, password: 'Passw0rd!', fullName: 'Dupe' });
    assert.equal(res.status, 409);
  });

  await t.test('POST /api/auth/login rejects a wrong password', async () => {
    const res = await request(server, 'POST', '/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(res.status, 401);
  });

  await t.test('GET /api/auth/me requires a token', async () => {
    const res = await request(server, 'GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  await t.test('GET /api/auth/me returns the logged-in user', async () => {
    const res = await request(server, 'GET', '/api/auth/me', null, auth(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, email);
  });

  // ------------------------------------------------------------- /api/me
  await t.test('saved pandits round-trip', async () => {
    const add = await request(server, 'POST', '/api/me/saved-pandits', { slug: 'ramesh-sharma' }, auth(token));
    assert.equal(add.status, 201);

    const list = await request(server, 'GET', '/api/me/saved-pandits', null, auth(token));
    assert.equal(list.status, 200);
    assert.ok(list.body.some((p) => p.slug === 'ramesh-sharma'));

    const remove = await request(server, 'DELETE', '/api/me/saved-pandits/ramesh-sharma', null, auth(token));
    assert.equal(remove.status, 200);
  });

  // --------------------------------------------------------------- reviews
  await t.test('GET /api/reviews returns the public testimonial feed', async () => {
    const res = await request(server, 'GET', '/api/reviews');
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body[0].name);
  });

  await t.test('POST /api/reviews requires auth, then creates a review', async () => {
    const anon = await request(server, 'POST', '/api/reviews', { targetType: 'pandit', targetSlug: 'ramesh-sharma', rating: 5 });
    assert.equal(anon.status, 401);

    const res = await request(server, 'POST', '/api/reviews', { targetType: 'pandit', targetSlug: 'ramesh-sharma', rating: 5, body: 'Great!' }, auth(token));
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
  });

  // ------------------------------------------------------------ community
  let postId;
  await t.test('POST /api/community creates a post', async () => {
    const res = await request(server, 'POST', '/api/community', { title: 'Question', body: 'How do I prepare?' }, auth(token));
    assert.equal(res.status, 201);
    postId = res.body.id;
  });

  await t.test('GET /api/community/:id includes comments', async () => {
    await request(server, 'POST', `/api/community/${postId}/comments`, { body: 'Reply' }, auth(token));
    const res = await request(server, 'GET', `/api/community/${postId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.comments.length, 1);
  });

  // ------------------------------------------------------------- payments
  await t.test('POST /api/pandits/:id/subscribe 501s without gateway keys configured', async () => {
    const plogin = await request(server, 'POST', '/api/auth/login', { email: 'ramesh-sharma@panditconnect.demo', password: 'PanditConnect@2026' });
    assert.equal(plogin.status, 201);
    const res = await request(server, 'POST', '/api/pandits/ramesh-sharma/subscribe', { tier: 'gold', billingCycle: 'monthly' }, auth(plogin.body.token));
    assert.equal(res.status, 501);
  });

  // -------------------------------------------------------------- security
  await t.test('security headers are present (helmet)', async () => {
    const res = await request(server, 'GET', '/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    // Relaxed deliberately (see app.js) so the frontend can call the backend
    // directly cross-origin without the nginx proxy, per the README's
    // supported dev setup.
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
  });

  await t.test('a failed login is written to security_audit_log', async () => {
    const { query } = require('../src/config/db');
    const email = `audit-check-${Date.now()}@example.com`;
    await request(server, 'POST', '/api/auth/login', { email, password: 'wrong' });
    const { rows } = await query(
      `SELECT * FROM security_audit_log WHERE event_type = 'LOGIN_FAILED' AND details->>'email' = $1`,
      [email],
    );
    assert.equal(rows.length, 1);
  });

  await t.test('GET /api/me/export and DELETE /api/me: portability + erasure', async () => {
    const exportEmail = `export-${Date.now()}@example.com`;
    const reg = await request(server, 'POST', '/api/auth/register', { email: exportEmail, password: 'Passw0rd!', fullName: 'Export Me' });
    const exportToken = reg.body.token;

    await request(server, 'POST', '/api/me/saved-pandits', { slug: 'ramesh-sharma' }, auth(exportToken));

    const exported = await request(server, 'GET', '/api/me/export', null, auth(exportToken));
    assert.equal(exported.status, 200);
    assert.equal(exported.body.profile.email, exportEmail);
    assert.equal(exported.body.savedPandits.length, 1);

    const del = await request(server, 'DELETE', '/api/me', null, auth(exportToken));
    assert.equal(del.status, 200);

    const meAfterDelete = await request(server, 'GET', '/api/auth/me', null, auth(exportToken));
    assert.equal(meAfterDelete.status, 401); // session revoked on delete

    const reReg = await request(server, 'POST', '/api/auth/register', { email: exportEmail, password: 'Passw0rd!', fullName: 'Reused Email' });
    assert.equal(reReg.status, 201); // anonymization freed the email up
  });

  // Exhausts the /auth/login rate limiter's counter — keep this LAST so no
  // later test in this file needs a real login to still succeed.
  await t.test('POST /api/auth/login rate-limits repeated attempts', async () => {
    const email = 'rate-limit-check@example.com';
    let last;
    for (let i = 0; i < 21; i++) {
      last = await request(server, 'POST', '/api/auth/login', { email, password: 'wrong' });
    }
    assert.equal(last.status, 429);
  });
});
