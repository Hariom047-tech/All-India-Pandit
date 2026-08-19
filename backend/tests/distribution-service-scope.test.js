// Scales rate-limit ceilings up (never removes them) — see
// middleware/security.js's TEST_RATE_LIMIT_SCALE. Must be set before
// requiring app.js, which registers the actual limiter instances.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { query } = require('../src/config/db');
const { request } = require('./helpers');

/**
 * Regression coverage for a bug found while verifying Phase 3.2's tab-
 * persistence fix: distribution.repository.js's fetchCandidates() built each
 * candidate's `services` array out of SERVICE SLUGS, but
 * fairness.js's eligibilityFailure() compares it against ctx.serviceId — a
 * resolved UUID (see pandits.controller.js's resolveServiceId). A slug can
 * never equal a UUID, so every service-scoped distribution-order /
 * distributed request silently found zero eligible candidates, for every
 * service, since this endpoint existed. It failed soft (falls back to a
 * plain rating sort — see useFairRanking's docstring), which is exactly why
 * nobody noticed: the Pandits tab on a Service page still showed pandits,
 * just never rotated.
 *
 * Fixed by selecting service IDs into that array instead — the same shape
 * `temples` already used correctly.
 */
test('distribution engine: service-scoped requests find eligible candidates', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  // A real service with a meaningful pool, from the seeded Nalkheda data —
  // no synthetic fixture needed, this is exercising the actual SQL shape.
  const { rows: services } = await query(
    `SELECT sv.id, sv.slug, COUNT(*)::int AS pandit_count
       FROM services sv
       JOIN pandit_services ps ON ps.service_id = sv.id AND ps.is_active
      GROUP BY sv.id, sv.slug
      HAVING COUNT(*) >= 10
      ORDER BY pandit_count DESC
      LIMIT 1`,
  );
  if (!services.length) {
    t.skip('no seeded service with >=10 pandits — nothing to verify against');
    return;
  }
  const { slug, pandit_count: panditCount } = services[0];

  await t.test('distribution-order?service=<slug> returns a non-empty, market-eligible order', async () => {
    const res = await request(
      server, 'GET',
      `/api/pandits/distribution-order?sk=service-scope-test&service=${slug}&country=IN`,
    );
    assert.equal(res.status, 200);
    assert.ok(
      res.body.order.length > 0,
      `expected a non-empty order for service "${slug}" (${panditCount} pandits offer it) — got 0, `
      + 'which is exactly the slug/UUID eligibility bug reappearing',
    );
  });

  await t.test('two different refresh generations produce different orderings for a large enough pool', async () => {
    const a = await request(server, 'GET', `/api/pandits/distribution-order?sk=service-scope-rotation&rg=0&service=${slug}&country=IN`);
    const b = await request(server, 'GET', `/api/pandits/distribution-order?sk=service-scope-rotation&rg=1&service=${slug}&country=IN`);
    assert.ok(a.body.order.length > 0 && b.body.order.length > 0, 'both requests must find eligible candidates');
    if (panditCount < 15) {
      // A small pool can legitimately fail to produce distinct orderings —
      // not this test's concern (see Phase 3.1's small-pool guidance).
      return;
    }
    const orderA = a.body.order.map((o) => o.slug).join(',');
    const orderB = b.body.order.map((o) => o.slug).join(',');
    assert.notEqual(orderA, orderB, 'a large service pool should show rotation across refresh generations');
  });
});
