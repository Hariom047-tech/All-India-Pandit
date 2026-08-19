/**
 * middleware/security.js's authLimiter, tested directly against a minimal
 * Express app — not the full backend — so this is fast and isolated from
 * unrelated setup (no DB, no fixtures).
 *
 * Phase 2C — this is the "make the limiter testable" half of the fix. The
 * other half (qualified-leads.test.js's dedup/concurrency suites, which
 * exercise the SAME authLimiter(60) on /pandits/:id/click through the real
 * app, at volumes only possible because NODE_ENV=test scales the ceiling —
 * see security.js's TEST_RATE_LIMIT_SCALE) is the actual proof that scaling
 * the ceiling up doesn't touch what the limiter does with real abuse.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

function buildApp(max) {
  // Re-requiring after each process.env.NODE_ENV mutation below picks up a
  // fresh module — Node caches the module, not the function's closed-over
  // env read, and authLimiter reads process.env.NODE_ENV at CALL time (when
  // the route below is registered), so this alone is enough; no cache-bust
  // needed. Kept as its own require so this file never touches the real app.
  delete require.cache[require.resolve('../src/middleware/security')];
  const { authLimiter } = require('../src/middleware/security');
  const app = express();
  app.use(express.json());
  app.post('/probe', authLimiter(max), (req, res) => res.json({ ok: true }));
  return app;
}

function request(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST' }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('rate limiter', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  t.after(() => { process.env.NODE_ENV = originalEnv; });

  await t.test('normal valid traffic, under the ceiling, all succeed', async () => {
    process.env.NODE_ENV = 'production';
    const server = buildApp(10).listen(0);
    try {
      for (let i = 0; i < 5; i++) {
        assert.equal(await request(server, '/probe'), 200);
      }
    } finally {
      server.close();
    }
  });

  await t.test('production-like: abusive traffic past the real ceiling is rejected', async () => {
    process.env.NODE_ENV = 'production';
    const server = buildApp(10).listen(0);
    try {
      let last;
      for (let i = 0; i < 15; i++) last = await request(server, '/probe');
      assert.equal(last, 429, 'the 11th+ request must be rejected in production');
    } finally {
      server.close();
    }
  });

  await t.test('unset NODE_ENV behaves like production, not like test', async () => {
    delete process.env.NODE_ENV;
    const server = buildApp(10).listen(0);
    try {
      let last;
      for (let i = 0; i < 15; i++) last = await request(server, '/probe');
      assert.equal(last, 429, 'only NODE_ENV=test scales the ceiling — an unset env must not');
    } finally {
      server.close();
    }
  });

  await t.test('test environment: the same volume that would 429 in production succeeds', async () => {
    process.env.NODE_ENV = 'test';
    const server = buildApp(10).listen(0);
    try {
      for (let i = 0; i < 15; i++) {
        assert.equal(await request(server, '/probe'), 200,
          '15 requests must all succeed under the test-scaled ceiling (10 * TEST_RATE_LIMIT_SCALE)');
      }
    } finally {
      server.close();
    }
  });

  await t.test('test environment still has a finite ceiling — it scales the limit, it does not remove it', async () => {
    process.env.NODE_ENV = 'test';
    const { TEST_RATE_LIMIT_SCALE } = require('../src/middleware/security');
    const server = buildApp(2).listen(0);
    try {
      let last;
      const attempts = 2 * TEST_RATE_LIMIT_SCALE + 5;
      for (let i = 0; i < attempts; i++) last = await request(server, '/probe');
      assert.equal(last, 429, 'even the scaled ceiling must eventually reject — this is not a bypass');
    } finally {
      server.close();
    }
  });
});

// Dedup/concurrency correctness under the scaled test ceiling is covered by
// qualified-leads.test.js — "20 repeated clicks from the same user = ONE
// lead", "10 PARALLEL clicks create exactly one lead", and "parallel clicks
// from DIFFERENT users are not blocked by each other" all run at volumes
// that only clear because of TEST_RATE_LIMIT_SCALE, and all assert exact
// lead counts — so a regression that let the limiter interfere with dedup,
// or let it silently drop requests instead of 429ing, would show up there
// as a wrong count, not as a timeout.
