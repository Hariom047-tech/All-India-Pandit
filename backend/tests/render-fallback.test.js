/**
 * render.controller.js's OTHER fail-safe path: the frontend container is
 * completely unreachable (down, DNS failure, connection refused). This must
 * return 502 so nginx's `error_page 500 502 503 504 = @spa_fallback`
 * (docker/nginx/*.conf, docs/SEO_ARCHITECTURE.md §9) can take over and serve
 * the static SPA shell directly — a visitor must never see a raw error page
 * because this feature had a bad day. Caught live during Phase 7
 * implementation as an actual infinite-proxy-loop bug before this test
 * existed; this is the regression test for that failure mode.
 *
 * Deliberately does NOT require ../src/app (indexHtmlCache.js reads
 * FRONTEND_INTERNAL_URL once at module load, and the full app is already
 * cached with a *working* stub URL in render.test.js's process — this file
 * runs in its own `node --test` child process, so setting the env var here
 * before any require is safe and isolated). Only the home route is
 * exercised: it needs no DB, keeping this a fast, narrow test of exactly the
 * failure path in question.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

// Nothing listens here — connection refused, fast and deterministic (no
// hanging on a routable-but-silent address).
process.env.FRONTEND_INTERNAL_URL = 'http://127.0.0.1:1';

function requestRaw(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('render.controller.js: frontend completely unreachable', async (t) => {
  const { home } = require('../src/controllers/render.controller');
  const app = express();
  app.get('/', home);
  const server = app.listen(0);
  t.after(() => server.close());

  const res = await requestRaw(server, '/');
  assert.equal(res.status, 502, 'must surface as a 5xx so nginx\'s error_page fallback takes over');
});
