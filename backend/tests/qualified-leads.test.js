// Scales rate-limit ceilings up (never removes them) — see
// middleware/security.js's TEST_RATE_LIMIT_SCALE. Must be set before
// requiring app.js, which registers the actual limiter instances.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { query } = require('../src/config/db');
const { request, auth, makeDevotee, makePandit, countLeads, superQuery } = require('./helpers');

test('Qualified Lead rules', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('guest Call click records an interaction but NO qualified lead', async () => {
    const { pandit, slug } = await makePandit();
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' });
    assert.equal(res.status, 200);
    assert.equal(res.body.interactionRecorded, true);
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(res.body.reason, 'not_authenticated');
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('guest WhatsApp click records no qualified lead', async () => {
    const { pandit, slug } = await makePandit();
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp' });
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('logged-in but UNVERIFIED user produces no qualified lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server, { verified: false });
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(res.body.reason, 'user_not_verified');
    assert.equal(res.body.contactAllowed, false);
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('verified active user DOES produce a qualified lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    assert.equal(res.body.qualifiedLead, true);
    assert.ok(res.body.leadId);
    assert.equal(await countLeads(pandit.id), 1);
  });

  await t.test('suspended user produces no qualified lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server, { status: 'suspended' });
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(res.body.reason, 'user_not_active');
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('pandit contacting THEMSELVES produces no qualified lead', async () => {
    const p = await makePandit();
    // superQuery: the app pool's RLS makes a bare UPDATE here a silent no-op.
    await superQuery('UPDATE users SET phone_verified = TRUE, status = $2 WHERE id = $1', [p.user.id, 'active']);
    const login = await request(server, 'POST', '/api/auth/pandit/login', { email: p.email, password: p.password });
    assert.equal(login.status, 200);
    const res = await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(login.body.token));
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(res.body.reason, 'self_contact');
    assert.equal(await countLeads(p.pandit.id), 0);
  });

  await t.test('a userId supplied in the body is ignored — identity comes from the session', async () => {
    const { pandit, slug } = await makePandit();
    const victim = await makeDevotee(server);
    const attacker = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${slug}/click`,
      { method: 'call', userId: victim.userId }, auth(attacker.token));
    // superQuery: qualified_leads RLS scopes SELECT to the owning pandit's session.
    const { rows } = await superQuery('SELECT user_id FROM qualified_leads WHERE pandit_id = $1', [pandit.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, attacker.userId, 'lead must be attributed to the session owner');
  });

  await t.test('expired/invalid token is treated as a guest', async () => {
    const { pandit, slug } = await makePandit();
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth('not-a-real-token'));
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('profile view never creates a lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${slug}/view`, {}, auth(devotee.token));
    assert.equal(await countLeads(pandit.id), 0);
  });

  await t.test('invalid contact method is rejected', async () => {
    const { slug } = await makePandit();
    const devotee = await makeDevotee(server);
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'telepathy' }, auth(devotee.token));
    assert.equal(res.status, 400);
  });
});

test('Qualified Lead deduplication', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('20 repeated clicks from the same user = ONE lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    for (let i = 0; i < 20; i++) {
      await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    }
    assert.equal(await countLeads(pandit.id), 1);
    const { rows } = await superQuery('SELECT interaction_count FROM qualified_leads WHERE pandit_id = $1', [pandit.id]);
    assert.equal(rows[0].interaction_count, 20, 'interactions accumulate on the single lead');
  });

  await t.test('Call then WhatsApp from the same user = ONE lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    const first = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    const second = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp' }, auth(devotee.token));
    assert.equal(first.body.qualifiedLead, true);
    assert.equal(second.body.qualifiedLead, false);
    assert.equal(second.body.reason, 'duplicate_window');
    assert.equal(second.body.contactAllowed, true, 'a duplicate still allows the call to proceed');
    assert.equal(await countLeads(pandit.id), 1);
  });

  await t.test('two DIFFERENT users on the same pandit = two leads', async () => {
    const { pandit, slug } = await makePandit();
    const a = await makeDevotee(server);
    const b = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(a.token));
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(b.token));
    assert.equal(await countLeads(pandit.id), 2);
  });

  await t.test('once the window expires, the same user can create a new lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    // Age the window rather than waiting 24h. superQuery: qleads_update_own_pandit
    // RLS scopes writes to a session belonging to that pandit — a bare query
    // here has no such context and would update 0 rows.
    await superQuery('UPDATE qualified_leads SET dedup_window_ends_at = NOW() - INTERVAL \'1 minute\' WHERE pandit_id = $1', [pandit.id]);
    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token));
    assert.equal(res.body.qualifiedLead, true);
    assert.equal(await countLeads(pandit.id), 2);
  });
});

test('Qualified Lead concurrency', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('10 PARALLEL clicks create exactly one lead', async () => {
    const { pandit, slug } = await makePandit();
    const devotee = await makeDevotee(server);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' }, auth(devotee.token))),
    );
    const created = results.filter((r) => r.body?.qualifiedLead === true);
    assert.equal(created.length, 1, 'exactly one request may win the advisory lock');
    assert.equal(await countLeads(pandit.id), 1);
  });

  await t.test('parallel clicks from DIFFERENT users are not blocked by each other', async () => {
    const { pandit, slug } = await makePandit();
    const users = await Promise.all([makeDevotee(server), makeDevotee(server), makeDevotee(server)]);
    await Promise.all(users.map((u) =>
      request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp' }, auth(u.token))));
    assert.equal(await countLeads(pandit.id), 3);
  });
});

test('Fairness engine consumes qualified leads only', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('100 guest clicks do not change a pandit lead count', async () => {
    const { pandit, slug } = await makePandit({ planTier: 'gold' });
    for (let i = 0; i < 20; i++) {
      await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'call' });
    }
    const { rows } = await query(
      `SELECT window_leads FROM get_pandit_lead_counts(NOW() - INTERVAL '14 days', date_trunc('day', NOW()))
        WHERE pandit_id = $1`, [pandit.id]);
    assert.equal(rows.length, 0, 'a pandit with only guest clicks has no lead rows at all');
  });

  await t.test('two gold pandits with equal qualified leads rank equally despite unequal guest traffic', async () => {
    const a = await makePandit({ planTier: 'gold' });
    const b = await makePandit({ planTier: 'gold' });

    // A gets a flood of anonymous noise; B gets none.
    for (let i = 0; i < 25; i++) {
      await request(server, 'POST', `/api/pandits/${a.slug}/click`, { method: 'call' });
    }
    // Both get exactly 2 genuine leads.
    for (const p of [a, b]) {
      for (let i = 0; i < 2; i++) {
        const d = await makeDevotee(server);
        await request(server, 'POST', `/api/pandits/${p.slug}/click`, { method: 'call' }, auth(d.token));
      }
    }

    const { rows } = await query(
      `SELECT pandit_id, window_leads FROM get_pandit_lead_counts(NOW() - INTERVAL '14 days', date_trunc('day', NOW()))
        WHERE pandit_id = ANY($1)`, [[a.pandit.id, b.pandit.id]]);
    const byId = Object.fromEntries(rows.map((r) => [r.pandit_id, Number(r.window_leads)]));
    assert.equal(byId[a.pandit.id], 2, 'guest traffic must contribute zero');
    assert.equal(byId[b.pandit.id], 2);
  });
});
