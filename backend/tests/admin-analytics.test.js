// Scales rate-limit ceilings up (never removes them) — see
// middleware/security.js's TEST_RATE_LIMIT_SCALE. Must be set before
// requiring app.js, which registers the actual limiter instances.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { request, auth, makeDevotee, makePandit, superQuery, withAdminContext } = require('./helpers');
const usersRepo = require('../src/repositories/admin/users.repository');
const panditsRepo = require('../src/repositories/admin/pandits.repository');
const { logActivityEvent, recentlyLogged } = require('../src/utils/activityLog');
const { adminSecretPath } = require('../src/config/env');

test('Admin role separation, activity tracking and Pandit analytics', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  await t.test('the Users list contains only role=devotee — never a Pandit, never an admin', async () => {
    const { pandit } = await makePandit();
    const { userId: devoteeId } = await makeDevotee(server);

    const { data } = await withAdminContext((q) => usersRepo.list(q, { page: 1, perPage: 500 }));

    assert.ok(data.every((u) => u.role === 'devotee'), 'every row must be role=devotee');
    // The Pandit's OWN users-row id must never appear in the devotee list.
    const { rows: panditUserRow } = await superQuery('SELECT user_id FROM pandits WHERE id = $1', [pandit.id]);
    assert.ok(!data.some((u) => u.id === panditUserRow[0].user_id), "a Pandit's account leaked into the Users list");
    assert.ok(data.some((u) => u.id === devoteeId), 'the real devotee fixture must appear');
  });

  await t.test('the admin-users list contains only admin/super_admin, never a devotee or Pandit', async () => {
    const { data } = await withAdminContext((q) => usersRepo.listAdmins(q, { page: 1, perPage: 500 }));
    assert.ok(data.every((u) => ['admin', 'super_admin'].includes(u.role)));
  });

  await t.test('the Pandits list is unaffected — still pandit-only (regression guard)', async () => {
    const { pandit, slug } = await makePandit();
    const { data } = await withAdminContext((q) => panditsRepo.list(q, { page: 1, perPage: 500 }));
    assert.ok(data.some((p) => p.slug === slug), 'the fixture pandit must appear');
  });

  await t.test('getById on the Users repository refuses to return a Pandit or admin by id', async () => {
    const { pandit } = await makePandit();
    const { rows } = await superQuery('SELECT user_id FROM pandits WHERE id = $1', [pandit.id]);
    const result = await withAdminContext((q) => usersRepo.getById(q, rows[0].user_id));
    assert.equal(result, null, 'a Pandit\'s user_id must not resolve through the devotee-only getById');
  });

  await t.test('non-admin requests to the admin API are rejected', async () => {
    const { token } = await makeDevotee(server);
    const base = `/api/${adminSecretPath}`;
    const asDevotee = await request(server, 'GET', `${base}/users`, null, auth(token));
    assert.equal(asDevotee.status, 401);
    const anonymous = await request(server, 'GET', `${base}/users`);
    assert.equal(anonymous.status, 401);
    const panditAnalytics = await request(server, 'GET', `${base}/pandits/some-id/analytics`, null, auth(token));
    assert.equal(panditAnalytics.status, 401);
  });

  await t.test('verified logged-in user: profile view + Chat click are tracked as activity events', async () => {
    const { pandit, slug } = await makePandit();
    const { token, userId } = await makeDevotee(server, { verified: true });

    await request(server, 'POST', `/api/pandits/${slug}/view`, { sk: 'sess-a' });
    await new Promise((r) => setTimeout(r, 300)); // fire-and-forget write

    const chatRes = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp', source: 'pandit_profile' }, auth(token));
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.body.qualifiedLead, true, 'a verified active devotee\'s Chat click must qualify');
    await new Promise((r) => setTimeout(r, 300)); // fire-and-forget write

    const { rows: events } = await superQuery(
      `SELECT event_type, source_surface, user_id, qualified_lead_id FROM user_activity_events
        WHERE pandit_id = $1 ORDER BY created_at`,
      [pandit.id],
    );
    const types = events.map((e) => e.event_type);
    assert.ok(types.includes('PANDIT_PROFILE_VIEW'), 'profile view must be tracked');
    assert.ok(types.includes('PANDIT_CHAT_CLICK'), 'chat click must be tracked');
    const chatEvent = events.find((e) => e.event_type === 'PANDIT_CHAT_CLICK');
    assert.equal(chatEvent.user_id, userId);
    assert.ok(chatEvent.qualified_lead_id, 'the tracked click must carry the real qualified_lead_id, not a guess');
    assert.equal(chatEvent.source_surface, 'PANDIT_PROFILE');
  });

  await t.test('unverified user: click is tracked, but stays a non-qualified lead with the real reason', async () => {
    const { slug, pandit } = await makePandit();
    const { token } = await makeDevotee(server, { verified: false });

    const res = await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'phone_call', source: 'pandit_profile' }, auth(token));
    assert.equal(res.body.qualifiedLead, false);
    assert.equal(res.body.reason, 'user_not_verified');

    await new Promise((r) => setTimeout(r, 300));
    const { rows: events } = await superQuery(
      `SELECT metadata FROM user_activity_events WHERE pandit_id = $1 AND event_type = 'PANDIT_CALL_CLICK'`,
      [pandit.id],
    );
    assert.equal(events.length, 1, 'the click is still tracked even though it did not qualify');
    assert.equal(events[0].metadata.qualified, false);
    assert.equal(events[0].metadata.reason, 'user_not_verified');
  });

  await t.test('profile-view activity logging is deduped within the window — a reload does not spam the timeline', async () => {
    const { pandit } = await makePandit();
    const first = await recentlyLogged({ panditId: pandit.id, eventType: 'PANDIT_PROFILE_VIEW', userId: null, sessionKey: 'dedup-test-session' });
    assert.equal(first, false, 'nothing logged yet');
    await logActivityEvent({ panditId: pandit.id, eventType: 'PANDIT_PROFILE_VIEW', sessionKey: 'dedup-test-session', sourceSurface: 'PANDIT_PROFILE' });
    const second = await recentlyLogged({ panditId: pandit.id, eventType: 'PANDIT_PROFILE_VIEW', userId: null, sessionKey: 'dedup-test-session' });
    assert.equal(second, true, 'the same session viewing the same pandit again within the window must be recognised as a duplicate');
  });

  await t.test('Pandit analytics: exact numbers from known, seeded activity', async () => {
    const { pandit, slug } = await makePandit();
    const devotees = await Promise.all([1, 2, 3].map(() => makeDevotee(server, { verified: true })));

    // 3 profile views (from 3 different guest sessions — no dedup collision).
    for (let i = 0; i < 3; i += 1) {
      await request(server, 'POST', `/api/pandits/${slug}/view`, { sk: `view-session-${i}` });
    }
    // 2 qualified chat leads (2 different verified devotees) + 1 qualified call lead.
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp', source: 'pandit_profile' }, auth(devotees[0].token));
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp', source: 'pandit_profile' }, auth(devotees[1].token));
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'phone_call', source: 'pandit_profile' }, auth(devotees[2].token));
    await new Promise((r) => setTimeout(r, 400));

    const analytics = await withAdminContext((q) => panditsRepo.analytics(q, pandit.id, { range: '30d' }));
    assert.equal(analytics.summary.qualifiedLeadsTotal, 3, 'exactly 3 qualified leads, not fuzzy');
    assert.equal(analytics.summary.chatClicks, 2);
    assert.equal(analytics.summary.callClicks, 1);
    assert.equal(analytics.funnel.qualifiedLeads, 3);
    assert.equal(analytics.funnel.ctaClicks, 3);
  });

  await t.test('Pandit analytics: date ranges return correct, different counts', async () => {
    const { pandit } = await makePandit();
    // Backdate one lead to 40 days ago (outside 7d/30d, inside "total").
    await superQuery(
      `INSERT INTO qualified_leads (pandit_id, user_id, first_contact_method, last_contact_method, dedup_window_ends_at, created_at)
       SELECT $1, id, 'whatsapp', 'whatsapp', NOW() - interval '39 days', NOW() - interval '40 days'
         FROM users WHERE role = 'devotee' LIMIT 1`,
      [pandit.id],
    );
    // A fresh lead, today.
    const { userId } = await makeDevotee(server, { verified: true });
    await superQuery(
      `INSERT INTO qualified_leads (pandit_id, user_id, first_contact_method, last_contact_method, dedup_window_ends_at, created_at)
       VALUES ($1, $2, 'phone_call', 'phone_call', NOW() + interval '1 day', NOW())`,
      [pandit.id, userId],
    );

    const result7d = await withAdminContext((q) => panditsRepo.analytics(q, pandit.id, { range: '7d' }));
    const result30d = await withAdminContext((q) => panditsRepo.analytics(q, pandit.id, { range: '30d' }));
    assert.equal(result7d.summary.qualifiedLeadsLast7Days, 1, 'the 40-day-old lead must not count in a 7-day window');
    assert.equal(result30d.summary.qualifiedLeadsLast30Days, 1, 'the 40-day-old lead must not count in a 30-day window either');
    assert.equal(result30d.summary.qualifiedLeadsTotal, 2, 'total is lifetime and must include both');
  });

  await t.test('Pandit analytics: location breakdown aggregates real city/state data exactly', async () => {
    const { pandit } = await makePandit();
    const cities = [['Indore', 'Madhya Pradesh'], ['Indore', 'Madhya Pradesh'], ['Bhopal', 'Madhya Pradesh']];
    for (const [city, state] of cities) {
      const { userId } = await makeDevotee(server, { verified: true });
      await superQuery('UPDATE users SET city = $2, state = $3 WHERE id = $1', [userId, city, state]);
      await superQuery(
        `INSERT INTO qualified_leads (pandit_id, user_id, first_contact_method, last_contact_method, dedup_window_ends_at, market)
         VALUES ($1, $2, 'whatsapp', 'whatsapp', NOW() + interval '1 day', 'INDIA')`,
        [pandit.id, userId],
      );
    }
    const analytics = await withAdminContext((q) => panditsRepo.analytics(q, pandit.id, { range: '30d' }));
    const indore = analytics.locations.byCity.find((c) => c.city === 'Indore');
    const bhopal = analytics.locations.byCity.find((c) => c.city === 'Bhopal');
    assert.equal(indore.leads, 2, 'exactly 2 leads from Indore');
    assert.equal(bhopal.leads, 1, 'exactly 1 lead from Bhopal');
    const india = analytics.locations.byMarket.find((m) => m.market === 'INDIA');
    assert.equal(india.leads, 3);
  });

  await t.test('Pandit A cannot see Pandit B leads (unchanged ownership rule)', async () => {
    const a = await makePandit();
    const b = await makePandit();
    const { userId } = await makeDevotee(server, { verified: true });
    await superQuery(
      `INSERT INTO qualified_leads (pandit_id, user_id, first_contact_method, last_contact_method, dedup_window_ends_at)
       VALUES ($1, $2, 'whatsapp', 'whatsapp', NOW() + interval '1 day')`,
      [a.pandit.id, userId],
    );
    const loginA = await request(server, 'POST', '/api/auth/pandit/login', { email: a.email, password: a.password });
    const loginB = await request(server, 'POST', '/api/auth/pandit/login', { email: b.email, password: b.password });
    const leadsForB = await request(server, 'GET', '/api/me/leads', null, auth(loginB.body.token));
    assert.equal(leadsForB.body.meta.total, 0, "Pandit B must see zero of Pandit A's leads");
    const leadsForA = await request(server, 'GET', '/api/me/leads', null, auth(loginA.body.token));
    assert.equal(leadsForA.body.meta.total, 1);
  });

  await t.test('Public Pandit API leaks no user PII (mobile, lead identity, activity)', async () => {
    const { slug } = await makePandit();
    const res = await request(server, 'GET', `/api/pandits/${slug}`);
    const body = JSON.stringify(res.body);
    assert.ok(!/qualified_lead|contact_phone|user_activity_events/.test(body), 'public pandit response must not embed lead/user internals');
  });

  await t.test('User activity timeline: summary numbers match the timeline\'s own underlying data', async () => {
    const { pandit, slug } = await makePandit();
    const { token, userId } = await makeDevotee(server, { verified: true });
    await request(server, 'POST', `/api/pandits/${slug}/click`, { method: 'whatsapp', source: 'pandit_profile' }, auth(token));
    await new Promise((r) => setTimeout(r, 300));

    const result = await withAdminContext((q) => usersRepo.activity(q, userId, { page: 1, perPage: 10 }));
    assert.equal(result.summary.chatClicks, 1);
    assert.ok(result.timeline.some((e) => e.eventType === 'PANDIT_CHAT_CLICK' && e.pandit?.slug === slug));
  });
});
