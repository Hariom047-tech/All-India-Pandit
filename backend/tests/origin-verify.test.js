/**
 * middleware/originVerify.js — the CloudFront-custom-header trust gate.
 * Pure middleware logic, no database, no network.
 *
 *   npm run test:media
 */

const test = require('node:test');
const assert = require('node:assert');

const { verifyOrigin } = require('../src/middleware/originVerify');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('no-op when ORIGIN_SHARED_SECRET is unset — every request passes through (local dev default)', () => {
  delete process.env.ORIGIN_SHARED_SECRET;
  let called = false;
  verifyOrigin({ headers: {} }, fakeRes(), () => { called = true; });
  assert.strictEqual(called, true);
});

test('rejects a request with no X-Origin-Verify header when the secret is configured', () => {
  process.env.ORIGIN_SHARED_SECRET = 'super-secret-value';
  try {
    let called = false;
    const res = fakeRes();
    verifyOrigin({ headers: {} }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
  } finally {
    delete process.env.ORIGIN_SHARED_SECRET;
  }
});

test('rejects a request with the wrong header value', () => {
  process.env.ORIGIN_SHARED_SECRET = 'super-secret-value';
  try {
    let called = false;
    const res = fakeRes();
    verifyOrigin({ headers: { 'x-origin-verify': 'guessed-wrong' } }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
  } finally {
    delete process.env.ORIGIN_SHARED_SECRET;
  }
});

test('rejects a value of different length without throwing (timingSafeEqual requires equal lengths)', () => {
  process.env.ORIGIN_SHARED_SECRET = 'super-secret-value';
  try {
    const res = fakeRes();
    assert.doesNotThrow(() => {
      verifyOrigin({ headers: { 'x-origin-verify': 'short' } }, res, () => {});
    });
    assert.strictEqual(res.statusCode, 403);
  } finally {
    delete process.env.ORIGIN_SHARED_SECRET;
  }
});

test('allows a request with the exact matching header value', () => {
  process.env.ORIGIN_SHARED_SECRET = 'super-secret-value';
  try {
    let called = false;
    const res = fakeRes();
    verifyOrigin({ headers: { 'x-origin-verify': 'super-secret-value' } }, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res.statusCode, null);
  } finally {
    delete process.env.ORIGIN_SHARED_SECRET;
  }
});
