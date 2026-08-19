/**
 * GET /api/_render/* (backend/src/controllers/render.controller.js, Phase 7)
 * — the server-injected-metadata endpoints nginx proxies "/" and the entity
 * detail routes to (docker/nginx/*.conf). Runs against the real Express app
 * and the real seeded DB (same fixtures api.test.js already relies on:
 * kashi-vishwanath / rudrabhishek / ramesh-sharma).
 *
 * FRONTEND_INTERNAL_URL is pointed at a tiny local stub server (standing in
 * for the real frontend container, which isn't reachable from a plain
 * `npm test` run) — indexHtmlCache.js reads this env var once at module
 * load, so it MUST be set before `../src/app` is required anywhere in this
 * process. node --test runs each test file in its own process, so this
 * doesn't affect other test files.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestRaw, superQuery } = require('./helpers');

const SHELL_HTML = '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/assets/index-TEST.js"></script></body></html>';

let stubServer;
test.before(async () => {
  stubServer = http.createServer((req, res) => {
    if (req.url === '/__spa-shell__') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SHELL_HTML);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => stubServer.listen(0, resolve));
  process.env.FRONTEND_INTERNAL_URL = `http://127.0.0.1:${stubServer.address().port}`;
});
test.after(() => stubServer.close());

test('GET /api/_render/*', async (t) => {
  const app = require('../src/app');
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('home: injects the site-wide title/description/canonical and Organization+WebSite JSON-LD', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/');
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>PanditSuggest[^<]*<\/title>/);
    assert.match(res.text, /<link rel="canonical" href="https?:\/\/[^"]+\/">/);
    assert.match(res.text, /"@type":"Organization"/);
    assert.match(res.text, /"@type":"WebSite"/);
    // the plain shell content must still be there — this is additive, not a replacement
    assert.ok(res.text.includes('<div id="root"></div>'));
  });

  await t.test('temple: injects the real entity\'s name and a PlaceOfWorship node, not a generic LocalBusiness', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/temples/kashi-vishwanath');
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>Kashi Vishwanath Temple[^<]*<\/title>/);
    assert.match(res.text, /"@type":"PlaceOfWorship"/);
    assert.equal(res.text.includes('"@type":"LocalBusiness"'), false);
  });

  await t.test('service: injects the real service name and a Service node, not a Product (no price is ever quoted platform-side)', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/services/rudrabhishek');
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>Rudrabhishek[^<]*<\/title>/);
    assert.match(res.text, /"@type":"Service"/);
    assert.equal(res.text.includes('"@type":"Product"'), false);
  });

  await t.test('pandit: injects the real pandit name and a Person node (never LocalBusiness)', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/pandits/ramesh-sharma');
    assert.equal(res.status, 200);
    // The seed fixture's full_name is itself "Pandit Ramesh Sharma" (honorific
    // baked into the seeded name) — asserting on the surname alone keeps this
    // test decoupled from that fixture-specific detail.
    assert.match(res.text, /<title>[^<]*Ramesh Sharma[^<]*<\/title>/);
    assert.match(res.text, /"@type":"Person"/);
  });

  await t.test('duplicate-honorific regression: "Pandit Pandit Ramesh Sharma" never appears (Phase 12 technical SEO batch)', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/pandits/ramesh-sharma');
    assert.equal(res.text.includes('Pandit Pandit'), false);
    assert.match(res.text, /<title>Pandit Ramesh Sharma[^<]*<\/title>/);
  });

  await t.test('an unknown slug returns a real 404 (not a "soft 404") but still serves the plain shell so a real browser renders the friendly NotFound page', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/temples/this-slug-does-not-exist-xyz');
    assert.equal(res.status, 404);
    assert.equal(res.text, SHELL_HTML, 'must be byte-identical to the plain shell — no partial/broken injection');
  });

  await t.test('an unknown service/pandit slug also returns a real 404', async () => {
    const svc = await requestRaw(server, 'GET', '/api/_render/services/this-slug-does-not-exist-xyz');
    assert.equal(svc.status, 404);
    const pandit = await requestRaw(server, 'GET', '/api/_render/pandits/this-slug-does-not-exist-xyz');
    assert.equal(pandit.status, 404);
  });

  await t.test('exactly one title/canonical/ld-json script per response — no duplicate tags from a double-injection bug', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/temples/kashi-vishwanath');
    assert.equal((res.text.match(/<title>/g) || []).length, 1);
    assert.equal((res.text.match(/<link rel="canonical"/g) || []).length, 1);
    assert.equal((res.text.match(/id="ld-json"/g) || []).length, 1);
  });

  await t.test('indexability engine: a real, content-rich seeded temple is never noindexed', async () => {
    const res = await requestRaw(server, 'GET', '/api/_render/temples/kashi-vishwanath');
    assert.equal(res.text.includes('name="robots" content="noindex'), false);
  });

  await t.test('indexability engine: a bare name+city stub temple is noindexed on the server-rendered page too', async () => {
    const slug = `render-thin-${Date.now()}`;
    await superQuery(
      `INSERT INTO temples (id, name, slug, address_line1, city, state, latitude, longitude, is_active, is_verified)
       VALUES (gen_random_uuid(), 'Thin Stub Temple', $1, 'Test Address', 'Testville', 'Test State', 0, 0, TRUE, TRUE)`,
      [slug],
    );
    const res = await requestRaw(server, 'GET', `/api/_render/temples/${slug}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /<meta name="robots" content="noindex, follow">/);
  });
});
