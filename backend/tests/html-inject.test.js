/**
 * backend/src/utils/htmlInject.js — pure function, no DB, no server. Locks
 * down two things that would otherwise only be caught by eyeballing a live
 * page (Phase 7's verification, docs/SEO_ARCHITECTURE.md §9): the
 * `id="ld-json"` on the injected JSON-LD script (must match what
 * frontend/app/src/lib/structuredData.ts's useStructuredData queries for, or
 * the client creates a SECOND competing script tag once React mounts — a
 * real bug caught during Phase 7 and fixed by aligning the ids), and the
 * `</script>`-breakout escape (a title/description containing a literal
 * "</script>" substring must not be able to end the inline script early).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { injectSeo } = require('../src/utils/htmlInject');

const SHELL = '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>';
const SITE_URL = 'https://panditsuggest.com';
const SITE_NAME = 'PanditSuggest';

test('injectSeo', async (t) => {
  await t.test('inserts all expected tags right before </head>, leaves the rest of the document untouched', () => {
    const html = injectSeo(SHELL, {
      title: 'Test Page', description: 'A test description.', canonicalPath: '/test', ogImage: `${SITE_URL}/img.png`,
      structuredData: [],
    }, SITE_URL, SITE_NAME);

    assert.match(html, /<title>Test Page<\/title>/);
    assert.match(html, /<meta name="description" content="A test description\.">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/panditsuggest\.com\/test">/);
    assert.match(html, /<meta property="og:title" content="Test Page">/);
    assert.match(html, /<meta property="og:site_name" content="PanditSuggest">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.ok(html.includes('<body><div id="root"></div></body></html>'), 'body must be untouched');
    assert.equal((html.match(/<\/head>/g) || []).length, 1, 'must not introduce a second </head>');
  });

  await t.test('a relative canonicalPath is resolved against siteUrl; an already-absolute one is passed through', () => {
    const rel = injectSeo(SHELL, { title: 't', description: 'd', canonicalPath: '/temples/x', ogImage: 'x', structuredData: [] }, SITE_URL, SITE_NAME);
    assert.match(rel, /<link rel="canonical" href="https:\/\/panditsuggest\.com\/temples\/x">/);

    const abs = injectSeo(SHELL, { title: 't', description: 'd', canonicalPath: 'https://elsewhere.example/x', ogImage: 'x', structuredData: [] }, SITE_URL, SITE_NAME);
    assert.match(abs, /<link rel="canonical" href="https:\/\/elsewhere\.example\/x">/);
  });

  await t.test('HTML-escapes title/description so an admin-entered value cannot break the markup', () => {
    const html = injectSeo(SHELL, {
      title: 'A "Great" <Temple> & Co', description: 'Uses & and <tags> and "quotes"',
      canonicalPath: '/x', ogImage: 'x', structuredData: [],
    }, SITE_URL, SITE_NAME);
    assert.match(html, /<title>A &quot;Great&quot; &lt;Temple&gt; &amp; Co<\/title>/);
    assert.match(html, /content="Uses &amp; and &lt;tags&gt; and &quot;quotes&quot;"/);
    assert.equal(html.includes('<Temple>'), false, 'a raw unescaped tag must never reach the document');
  });

  await t.test('no structuredData means no <script> tag at all', () => {
    const html = injectSeo(SHELL, { title: 't', description: 'd', canonicalPath: '/x', ogImage: 'x', structuredData: [] }, SITE_URL, SITE_NAME);
    assert.equal(html.includes('application/ld+json'), false);
  });

  await t.test('JSON-LD script carries id="ld-json" — the client singleton (structuredData.ts) queries this exact id to take over the node instead of creating a second one', () => {
    const html = injectSeo(SHELL, {
      title: 't', description: 'd', canonicalPath: '/x', ogImage: 'x',
      structuredData: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'PanditSuggest' }],
    }, SITE_URL, SITE_NAME);
    assert.match(html, /<script id="ld-json" type="application\/ld\+json">/);
  });

  await t.test('a "</script>" substring inside a structured-data string value cannot prematurely close the inline script tag', () => {
    const html = injectSeo(SHELL, {
      title: 't', description: 'd', canonicalPath: '/x', ogImage: 'x',
      structuredData: [{ '@type': 'Thing', name: 'evil</script><script>alert(1)</script>' }],
    }, SITE_URL, SITE_NAME);

    // The raw, unescaped sequence must not appear anywhere in the output —
    // if it did, the browser would parse a second, attacker-controlled <script>.
    assert.equal(html.includes('</script><script>alert(1)</script>'), false);
    // The escaped form must be present instead, and the JSON must still
    // round-trip to the original string.
    const scriptMatch = html.match(/<script id="ld-json" type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'expected exactly one ld-json script tag to survive parsing');
    const parsed = JSON.parse(scriptMatch[1]);
    assert.equal(parsed['@graph'][0].name, 'evil</script><script>alert(1)</script>');
  });

  await t.test('multiple structured-data nodes are wrapped as one {"@context","@graph"} document, not one script per node', () => {
    const html = injectSeo(SHELL, {
      title: 't', description: 'd', canonicalPath: '/x', ogImage: 'x',
      structuredData: [{ '@type': 'BreadcrumbList' }, { '@type': 'Service' }],
    }, SITE_URL, SITE_NAME);
    assert.equal((html.match(/<script id="ld-json"/g) || []).length, 1);
    const scriptMatch = html.match(/<script id="ld-json" type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const parsed = JSON.parse(scriptMatch[1]);
    assert.equal(parsed['@context'], 'https://schema.org');
    assert.equal(parsed['@graph'].length, 2);
  });
});
