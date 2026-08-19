/**
 * GET /api/sitemap.xml (backend/src/controllers/sitemap.controller.js,
 * Phase 5) — proxied to the site root by nginx so it's reachable at the
 * conventional /sitemap.xml (docs/SEO_ARCHITECTURE.md §5). Runs against the
 * real Express app and the real seeded DB.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { requestRaw, superQuery } = require('./helpers');

test('GET /api/sitemap.xml', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const res = await requestRaw(server, 'GET', '/api/sitemap.xml');

  await t.test('200, XML content-type, well-formed', () => {
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/xml/);
    assert.match(res.text, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(res.text, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(res.text, /<\/urlset>\s*$/);
    // every <url> opened must be closed — a cheap structural sanity check
    const opens = (res.text.match(/<url>/g) || []).length;
    const closes = (res.text.match(/<\/url>/g) || []).length;
    assert.ok(opens > 0, 'expected at least one <url> entry');
    assert.equal(opens, closes);
  });

  await t.test('includes the indexable static pages', () => {
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/<\/loc>/);
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/temples<\/loc>/);
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/pandits<\/loc>/);
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/services<\/loc>/);
  });

  await t.test('excludes noindex-only utility pages — must match the noindex list in Seo.tsx (docs/SEO_ARCHITECTURE.md §3)', () => {
    assert.equal(/<loc>https?:\/\/[^<]+\/login<\/loc>/.test(res.text), false);
    assert.equal(/<loc>https?:\/\/[^<]+\/search<\/loc>/.test(res.text), false);
    assert.equal(/<loc>https?:\/\/[^<]+\/dashboard<\/loc>/.test(res.text), false);
  });

  await t.test('includes real seeded entities, each with a <lastmod> date', () => {
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/temples\/kashi-vishwanath<\/loc>\s*\n\s*<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/services\/rudrabhishek<\/loc>\s*\n\s*<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(res.text, /<loc>https?:\/\/[^<]+\/pandits\/ramesh-sharma<\/loc>\s*\n\s*<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  await t.test('static pages carry no <lastmod> — nothing tracks when their content last changed, so none is guessed', () => {
    const homeEntry = res.text.match(/<url>\s*<loc>https?:\/\/[^<]+\/<\/loc>[\s\S]*?<\/url>/);
    assert.ok(homeEntry);
    assert.equal(homeEntry[0].includes('<lastmod>'), false);
  });

  await t.test('a temple that fails the same visibility gate the public API uses (is_active/deleted_at) never appears', async () => {
    // Same gate sitemap.repository.js and temples.repository.js's public
    // list/detail queries both use — an inactive temple must be invisible
    // to both, or the sitemap would advertise a URL a visitor can't reach.
    const slug = `sitemap-hidden-${Date.now()}`;
    await superQuery(
      `INSERT INTO temples (id, name, slug, address_line1, city, state, latitude, longitude, is_active, is_verified)
       VALUES (gen_random_uuid(), 'Hidden Test Temple', $1, 'Test Address', 'Testville', 'Test State', 0, 0, FALSE, TRUE)`,
      [slug],
    );
    const fresh = await requestRaw(server, 'GET', '/api/sitemap.xml');
    assert.equal(fresh.text.includes(`/temples/${slug}`), false);
  });

  await t.test('a visible-but-thin temple (Phase 11 indexability engine says noindex) is excluded — must never advertise a URL that says noindex on itself', async () => {
    // Same fixture shape as render.test.js's "bare name+city stub temple"
    // regression test — that one confirms the page itself is noindexed;
    // this confirms the sitemap agrees and doesn't still list it.
    const slug = `sitemap-thin-${Date.now()}`;
    await superQuery(
      `INSERT INTO temples (id, name, slug, address_line1, city, state, latitude, longitude, is_active, is_verified)
       VALUES (gen_random_uuid(), 'Thin Sitemap Temple', $1, 'Test Address', 'Testville', 'Test State', 0, 0, TRUE, TRUE)`,
      [slug],
    );
    const fresh = await requestRaw(server, 'GET', '/api/sitemap.xml');
    assert.equal(fresh.text.includes(`/temples/${slug}`), false);
  });
});
