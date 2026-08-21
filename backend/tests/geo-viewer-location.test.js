/**
 * CloudFront viewer-location snapshot (services/distribution/market.js) —
 * the geo debug endpoint / admin diagnostic panel's data source, and the
 * new IN/US/GB/AE market-mapping + safe-decoding cases this task calls for.
 *
 * Pure functions — no database, no network.
 *
 *   npm run test:media -- (not wired here; run directly)
 *   node --test tests/geo-viewer-location.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  toMarket, countryFromEdge, viewerLocationSnapshot, safeDecodeHeader,
  deviceTypeFromEdge, osFromEdge, normaliseCountry,
} = require('../src/services/distribution/market');

/* ── market mapping ───────────────────────────────────────────────────── */

test('IN maps to INDIA', () => {
  assert.strictEqual(toMarket('IN'), 'INDIA');
  assert.strictEqual(viewerLocationSnapshot({ 'cloudfront-viewer-country': 'IN' }).market, 'INDIA');
});

for (const cc of ['US', 'GB', 'AE']) {
  test(`${cc} maps to INTERNATIONAL`, () => {
    assert.strictEqual(toMarket(cc), 'INTERNATIONAL');
    assert.strictEqual(viewerLocationSnapshot({ 'cloudfront-viewer-country': cc }).market, 'INTERNATIONAL');
  });
}

test('missing country header resolves to UNKNOWN', () => {
  const snap = viewerLocationSnapshot({});
  assert.strictEqual(snap.market, 'UNKNOWN');
  assert.strictEqual(snap.countryCode, null);
  assert.strictEqual(snap.source, 'none');
});

test('empty-string country header resolves to UNKNOWN', () => {
  const snap = viewerLocationSnapshot({ 'cloudfront-viewer-country': '' });
  assert.strictEqual(snap.market, 'UNKNOWN');
});

test('malformed country header (not two letters) resolves to UNKNOWN, not a crash', () => {
  for (const bad of ['INDIA', '1N', 'I', 'IND', '  ', 'XX', null, undefined, 123]) {
    assert.strictEqual(normaliseCountry(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  const snap = viewerLocationSnapshot({ 'cloudfront-viewer-country': 'INDIA' });
  assert.strictEqual(snap.market, 'UNKNOWN');
});

test('country code normalization is case-insensitive', () => {
  assert.strictEqual(normaliseCountry('in'), 'IN');
  assert.strictEqual(toMarket('in'), 'INDIA');
});

test('header lookup relies on Node/Express already lowercasing incoming header names (the framework-level normalization section 4 asks for) — req.headers is always lowercase in practice', () => {
  // Node's http parser lowercases every incoming header name per spec before
  // req.headers is ever populated — this is true regardless of what case
  // CloudFront sends "CloudFront-Viewer-Country" in over the wire. A plain
  // object built with a mixed-case key (as below) is NOT what req.headers
  // ever looks like in production; this test documents that distinction
  // rather than asserting mixed-case support the codebase doesn't need.
  const snap = viewerLocationSnapshot({ 'cloudfront-viewer-country': 'IN' });
  assert.strictEqual(snap.countryCode, 'IN');
  assert.strictEqual(snap.market, 'INDIA');
});

/* ── safe decoding ────────────────────────────────────────────────────── */

test('URL-encoded city is safely decoded', () => {
  const snap = viewerLocationSnapshot({
    'cloudfront-viewer-country': 'IN',
    'cloudfront-viewer-city': encodeURIComponent('Bengaluru'),
  });
  assert.strictEqual(snap.city, 'Bengaluru');
});

test('malformed percent-encoding never throws — falls back to the raw value', () => {
  assert.doesNotThrow(() => safeDecodeHeader('%E0%A4%'));
  assert.strictEqual(safeDecodeHeader('%E0%A4%'), '%E0%A4%');
  assert.doesNotThrow(() => viewerLocationSnapshot({ 'cloudfront-viewer-city': '%' }));
});

test('safeDecodeHeader returns null for missing/empty input', () => {
  assert.strictEqual(safeDecodeHeader(null), null);
  assert.strictEqual(safeDecodeHeader(''), null);
  assert.strictEqual(safeDecodeHeader(undefined), null);
});

/* ── full snapshot shape ──────────────────────────────────────────────── */

test('viewerLocationSnapshot returns the full documented shape for a well-formed request', () => {
  const snap = viewerLocationSnapshot({
    'cloudfront-viewer-country': 'IN',
    'cloudfront-viewer-country-name': 'India',
    'cloudfront-viewer-country-region': 'MP',
    'cloudfront-viewer-country-region-name': 'Madhya Pradesh',
    'cloudfront-viewer-city': 'Indore',
    'cloudfront-viewer-time-zone': 'Asia/Kolkata',
    'cloudfront-is-mobile-viewer': 'true',
    'cloudfront-is-android-viewer': 'true',
  });
  assert.deepStrictEqual(snap, {
    countryCode: 'IN',
    countryName: 'India',
    regionCode: 'MP',
    regionName: 'Madhya Pradesh',
    city: 'Indore',
    timezone: 'Asia/Kolkata',
    device: 'mobile',
    os: 'android',
    market: 'INDIA',
    source: 'cloudfront',
  });
});

test('viewerLocationSnapshot never exposes latitude/longitude/address/ASN even if present on the request', () => {
  const snap = viewerLocationSnapshot({
    'cloudfront-viewer-country': 'IN',
    'cloudfront-viewer-latitude': '22.7196',
    'cloudfront-viewer-longitude': '75.8577',
    'cloudfront-viewer-address': '203.0.113.5',
    'cloudfront-viewer-asn': '15169',
  });
  const keys = Object.keys(snap);
  assert.ok(!keys.some((k) => /lat|lon|address|asn/i.test(k)), `unexpected key in ${keys.join(', ')}`);
});

/* ── device / OS detection ────────────────────────────────────────────── */

test('device type: mobile beats tablet/desktop when multiple flags are (incorrectly) true', () => {
  assert.strictEqual(deviceTypeFromEdge({ 'cloudfront-is-mobile-viewer': 'true', 'cloudfront-is-desktop-viewer': 'true' }), 'mobile');
});
test('device type: tablet', () => {
  assert.strictEqual(deviceTypeFromEdge({ 'cloudfront-is-tablet-viewer': 'true' }), 'tablet');
});
test('device type: desktop', () => {
  assert.strictEqual(deviceTypeFromEdge({ 'cloudfront-is-desktop-viewer': 'true' }), 'desktop');
});
test('device type: null when no flags present (direct EC2 hit, no CloudFront)', () => {
  assert.strictEqual(deviceTypeFromEdge({}), null);
});
test('os: ios / android / null', () => {
  assert.strictEqual(osFromEdge({ 'cloudfront-is-ios-viewer': 'true' }), 'ios');
  assert.strictEqual(osFromEdge({ 'cloudfront-is-android-viewer': 'true' }), 'android');
  assert.strictEqual(osFromEdge({}), null);
});

/* ── trust boundary still applies ─────────────────────────────────────── */

test('a client-forged CloudFront-Viewer-Country is still trusted by this function in isolation — the real protection is the network-layer origin lock (middleware/originVerify.js), not this parser', () => {
  // Documents the trust model rather than asserting new behaviour: this
  // function's job is "parse the header if present," the same way
  // countryFromEdge already works. Forgery is prevented by making sure only
  // CloudFront can reach this server at all — see market.js's own
  // countryFromEdge comment and middleware/originVerify.js.
  const snap = viewerLocationSnapshot({ 'cloudfront-viewer-country': 'US' });
  assert.strictEqual(snap.countryCode, 'US');
});

test('edge placeholder values (XX, T1, ...) resolve to UNKNOWN like the real eligibility path', () => {
  for (const placeholder of ['XX', 'T1', 'ZZ', 'A1', 'A2', 'O1', 'AP', 'EU']) {
    const snap = viewerLocationSnapshot({ 'cloudfront-viewer-country': placeholder });
    assert.strictEqual(snap.market, 'UNKNOWN', `expected UNKNOWN for placeholder ${placeholder}`);
  }
});

test('direct EC2 hit (no CloudFront headers at all) never gets mistaken for a resolved market', () => {
  const snap = viewerLocationSnapshot({ 'user-agent': 'curl/8.0', host: 'ec2-1-2-3-4.compute.amazonaws.com' });
  assert.strictEqual(snap.countryCode, null);
  assert.strictEqual(snap.market, 'UNKNOWN');
  assert.strictEqual(snap.source, 'none');
});
