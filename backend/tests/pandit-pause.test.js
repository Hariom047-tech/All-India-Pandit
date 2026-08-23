process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../src/app');
const { adminSecretPath } = require('../src/config/env');
const publicPanditsRepo = require('../src/repositories/pandits.repository');
const adminPanditsRepo = require('../src/repositories/admin/pandits.repository');
const distributionRepo = require('../src/repositories/distribution.repository');
const { eligibilityFailure } = require('../src/services/distribution/fairness');
const { request, auth, makePandit, superQuery, withAdminContext, uniq } = require('./helpers');

const A = `/api/${adminSecretPath}`;

/** Mints a real admin bearer token via a direct admin_sessions insert — the
 *  same shape a real login's second step produces, without driving the TOTP
 *  flow (see tests/admin.test.js) this file isn't testing. */
async function adminBearerToken() {
  const email = `pause-admin-${uniq()}@test.local`;
  const { rows } = await superQuery(
    `INSERT INTO users (email, password_hash, full_name, role, status)
     VALUES ($1, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu', 'Fixture Admin', 'admin', 'active')
     RETURNING id`,
    [email],
  );
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await superQuery(
    `INSERT INTO admin_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')`,
    [rows[0].id, tokenHash],
  );
  return raw;
}

test('pandit pause — public visibility (migration 32)', async (t) => {
  await t.test('a paused pandit disappears from public list() and getBySlug()', async () => {
    const p = await makePandit();
    assert.ok(await publicPanditsRepo.getBySlug(p.slug), 'visible before pausing');

    await withAdminContext((q) => adminPanditsRepo.setPaused(q, p.pandit.id, true, 'test pause'));

    assert.equal(await publicPanditsRepo.getBySlug(p.slug), null);
    assert.equal(await publicPanditsRepo.findIdBySlug(p.slug), null);
    const { data } = await publicPanditsRepo.list({ page: 1, perPage: 50 });
    assert.ok(!data.some((r) => r.slug === p.slug), 'must not appear in the public list either');
  });

  await t.test('unpausing restores visibility', async () => {
    const p = await makePandit();
    await withAdminContext((q) => adminPanditsRepo.setPaused(q, p.pandit.id, true, 'test pause'));
    assert.equal(await publicPanditsRepo.getBySlug(p.slug), null);

    await withAdminContext((q) => adminPanditsRepo.setPaused(q, p.pandit.id, false));
    assert.ok(await publicPanditsRepo.getBySlug(p.slug));
  });
});

test('pandit pause — admin HTTP endpoint', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const token = await adminBearerToken();

  await t.test('pausing without a reason is rejected', async () => {
    const p = await makePandit();
    const res = await request(server, 'POST', `${A}/pandits/${p.slug}/pause`, { paused: true }, auth(token));
    assert.equal(res.status, 400);
  });

  await t.test('pause then unpause round-trips through the real route', async () => {
    const p = await makePandit();
    const pauseRes = await request(
      server, 'POST', `${A}/pandits/${p.slug}/pause`,
      { paused: true, reason: 'policy violation' }, auth(token),
    );
    assert.equal(pauseRes.status, 200);
    assert.equal(await publicPanditsRepo.getBySlug(p.slug), null);

    const unpauseRes = await request(server, 'POST', `${A}/pandits/${p.slug}/pause`, { paused: false }, auth(token));
    assert.equal(unpauseRes.status, 200);
    assert.ok(await publicPanditsRepo.getBySlug(p.slug));
  });

  await t.test('unknown pandit 404s', async () => {
    const res = await request(server, 'POST', `${A}/pandits/does-not-exist/pause`, { paused: true, reason: 'x' }, auth(token));
    assert.equal(res.status, 404);
  });
});

test('pandit pause — subscription lifecycle', async (t) => {
  await t.test('an expired plan is auto-paused by revert_expired_pandit_tiers()', async () => {
    const p = await makePandit();
    // Seeded data already saturates every paid tier's seat cap (see
    // enforce_seat_cap(), migration 19) — set_config runs inside the
    // UPDATE's own FROM so it executes as part of the SAME single statement
    // (node-postgres' parameterized protocol rejects a literal
    // multi-statement string, and separate superQuery calls can land on
    // different pooled connections where a session-local setting wouldn't
    // carry over; an unreferenced CTE risks being planned away unexecuted,
    // FROM cannot be).
    await superQuery(
      `UPDATE pandits SET current_tier = 'gold', subscription_expires_at = NOW() - interval '1 day'
       FROM (SELECT set_config('app.allow_seat_overflow', 'on', false)) AS cfg
       WHERE id = $1`,
      [p.pandit.id],
    );

    await superQuery('SELECT revert_expired_pandit_tiers()');

    const { rows } = await superQuery(
      'SELECT current_tier, is_paused, paused_reason FROM pandits WHERE id = $1', [p.pandit.id],
    );
    assert.equal(rows[0].current_tier, 'free');
    assert.equal(rows[0].is_paused, true);
    assert.equal(rows[0].paused_reason, 'subscription_expired');
  });

  await t.test('a pandit with an unexpired subscription row is left alone (not auto-paused)', async () => {
    const p = await makePandit();
    await superQuery(
      `UPDATE pandits SET current_tier = 'gold', subscription_expires_at = NOW() + interval '10 days'
       FROM (SELECT set_config('app.allow_seat_overflow', 'on', false)) AS cfg
       WHERE id = $1`,
      [p.pandit.id],
    );
    await superQuery('SELECT revert_expired_pandit_tiers()');
    const { rows } = await superQuery('SELECT is_paused FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(rows[0].is_paused, false);
  });

  await t.test('activating a subscription clears any existing pause', async () => {
    const p = await makePandit();
    await withAdminContext((q) => adminPanditsRepo.setPaused(q, p.pandit.id, true, 'was paused'));
    const { rows: before } = await superQuery('SELECT is_paused FROM pandits WHERE id = $1', [p.pandit.id]);
    assert.equal(before[0].is_paused, true);

    await superQuery(
      `SELECT activate_pandit_subscription($1, 'silver'::subscription_tier, NOW() + interval '30 days')`,
      [p.pandit.id],
    );

    const { rows: after } = await superQuery(
      'SELECT is_paused, paused_reason, paused_at, current_tier FROM pandits WHERE id = $1', [p.pandit.id],
    );
    assert.equal(after[0].current_tier, 'silver');
    assert.equal(after[0].is_paused, false);
    assert.equal(after[0].paused_reason, null);
    assert.equal(after[0].paused_at, null);
  });
});

test('pandit pause — distribution engine', async (t) => {
  await t.test('eligibilityFailure hard-gates a paused pandit', () => {
    assert.equal(eligibilityFailure({ isPaused: true }, {}), 'paused');
  });

  await t.test('fetchCandidates maps pandits.is_paused into isPaused, and the gate catches it', async () => {
    const p = await makePandit();
    await withAdminContext((q) => adminPanditsRepo.setPaused(q, p.pandit.id, true, 'test'));

    // fetchCandidates has no LIMIT-bypassing "just this pandit" filter and
    // this dev DB has thousands of pandits — scope to a service with the
    // smallest real pool (linking this fixture in too) so the candidate is
    // guaranteed to survive the query's own LIMIT 2000, deterministically.
    const { rows: smallServices } = await superQuery(
      `SELECT sv.id FROM services sv JOIN pandit_services ps ON ps.service_id = sv.id AND ps.is_active
        GROUP BY sv.id ORDER BY COUNT(*) ASC LIMIT 1`,
    );
    const serviceId = smallServices[0].id;
    await superQuery(
      `INSERT INTO pandit_services (pandit_id, service_id, is_active) VALUES ($1, $2, TRUE)`,
      [p.pandit.id, serviceId],
    );

    const candidates = await distributionRepo.fetchCandidates({ market: 'INDIA', serviceId });
    const mine = candidates.find((c) => c.slug === p.slug);
    assert.ok(mine, 'still returned as a raw candidate row — filtering is the eligibility gate\'s job, not the query\'s');
    assert.equal(mine.isPaused, true);
    assert.equal(eligibilityFailure(mine, { market: 'INDIA' }), 'paused');
  });
});
