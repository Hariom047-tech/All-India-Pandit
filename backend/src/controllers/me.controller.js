const social = require('../repositories/social.repository');
const dashboard = require('../repositories/dashboard.repository');
const authRepo = require('../repositories/auth.repository');
const qualifiedLeads = require('../repositories/qualifiedLeads.repository');
const payments = require('../repositories/payments.repository');
const { withUserContext } = require('../config/db');
const { readPaging, paginationEnvelope } = require('../utils/paginate');
const { QUALIFIED_LEAD_DEDUP_HOURS, LEAD_REPORTING_TIMEZONE } = require('../config/leads');
const { countryFromPhone } = require('../services/distribution/market');

const listSavedPandits = async (req, res) => res.json(await social.savedPandits(req.user.id));
const listSavedTemples = async (req, res) => res.json(await social.savedTemples(req.user.id));

async function addSavedPandit(req, res) {
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!(await social.savePandit(req.user.id, slug))) return res.status(404).json({ error: 'Pandit not found' });
  res.status(201).json({ ok: true });
}

async function removeSavedPandit(req, res) {
  await social.unsavePandit(req.user.id, req.params.slug);
  res.json({ ok: true });
}

async function addSavedTemple(req, res) {
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!(await social.saveTemple(req.user.id, slug))) return res.status(404).json({ error: 'Temple not found' });
  res.status(201).json({ ok: true });
}

async function removeSavedTemple(req, res) {
  await social.unsaveTemple(req.user.id, req.params.slug);
  res.json({ ok: true });
}

async function listNotifications(req, res) {
  const data = await withUserContext(req.user.id, (q) => social.notifications(req.user.id, { unreadOnly: req.query.unread === 'true' }, q));
  res.json(data);
}

async function readNotification(req, res) {
  const ok = await withUserContext(req.user.id, (q) => social.markNotificationRead(req.user.id, req.params.id, q));
  if (!ok) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
}

/** Pandit's own enquiry inbox (POST /api/temples|pandits/:id/inquiry lands here). */
async function inbox(req, res) {
  const data = await withUserContext(req.user.id, (q) => dashboard.inboxForPandit(req.user.id, q));
  res.json(data);
}

async function updateInquiry(req, res) {
  const { status } = req.body || {};
  const allowed = ['new', 'seen', 'replied', 'completed', 'expired'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  const ok = await withUserContext(req.user.id, (q) => dashboard.updateInquiryStatus(req.user.id, req.params.id, status, q));
  if (!ok) return res.status(404).json({ error: 'Inquiry not found' });
  res.json({ ok: true });
}

/**
 * GET /api/me/dashboard — the pandit's own dashboard.
 *
 * Every number here is a real aggregate. There are no illustrative values.
 *
 * The four analytics figures are kept strictly separate and are never summed
 * into each other: profile views (anyone, including guests) is a different
 * quantity from CTA clicks (anyone who pressed a button), which is different
 * from verified interactions (a logged-in devotee pressed it), which is
 * different from qualified leads (de-duplicated verified intent). Presenting
 * a CTA click as a lead is the specific misrepresentation this endpoint
 * exists to prevent.
 *
 * Views are reported as COUNTS ONLY — no viewer identity is collected or
 * exposed, because a profile view is anonymous by nature and the pandit has
 * no legitimate need to know who merely looked. Identity appears only on
 * qualified leads (see listLeads), where the devotee has actively chosen to
 * make contact and has been told their details may be shared.
 */
async function panditDashboard(req, res) {
  const payload = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;

    // Sequential, not Promise.all: `q` is a single client bound by
    // withUserContext and one pg connection cannot run overlapping queries.
    const legacy = await dashboard.forPandit(req.user.id, q);
    const counts = await qualifiedLeads.countsForPandit(pandit.id, q);
    const analytics = await qualifiedLeads.analyticsForPandit(pandit.id, q);
    const subscription = await dashboard.subscriptionForPandit(pandit.id, pandit.current_tier, q);
    const recentLeads = await qualifiedLeads.recentForPandit(pandit.id, 5, q);

    return {
      pandit: {
        name: pandit.full_name,
        profileSlug: pandit.slug,
        verificationStatus: pandit.verification_status,
        isAvailable: pandit.is_available,
        isPaused: pandit.is_paused,
        pausedReason: pandit.paused_reason,
        pausedAt: pandit.paused_at,
      },
      plan: {
        tier: pandit.current_tier,
        name: subscription?.name || (pandit.current_tier === 'free' ? 'Free' : pandit.current_tier),
        status: subscription?.is_active ? 'active' : (pandit.current_tier === 'free' ? 'free' : 'inactive'),
        billingCycle: subscription?.billing_cycle || null,
        startedAt: subscription?.starts_at || null,
        expiresAt: pandit.subscription_expires_at || null,
        autoRenew: subscription?.auto_renew ?? null,
      },
      qualifiedLeads: {
        today: counts.today,
        week: counts.week,
        month: counts.month,
        total: counts.total,
      },
      // Anonymous, aggregate-only. Deliberately no viewer list.
      views: {
        today: analytics.viewsToday,
        week: analytics.viewsWeek,
        month: analytics.viewsMonth,
        total: analytics.profileViews,
      },
      analytics,
      recentLeads,
      meta: {
        dedupWindowHours: QUALIFIED_LEAD_DEDUP_HOURS,
        reportingTimezone: LEAD_REPORTING_TIMEZONE,
        pendingInquiries: Number(legacy?.pending_inquiries || 0),
      },
    };
  });

  if (!payload) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json(payload);
}

const LEAD_STATUSES = ['new', 'viewed', 'contacted', 'completed', 'not_reachable'];
const LEAD_PERIODS = ['today', '7d', '30d', '90d', 'all'];
const LEAD_METHODS = { call: 'phone_call', phone_call: 'phone_call', whatsapp: 'whatsapp' };

/**
 * GET /api/me/leads — the pandit's qualified leads, paginated.
 *
 * There is no panditId parameter, by design: it is resolved from the bearer
 * session. Combined with the qleads_select_own_pandit RLS policy this is
 * enforced twice — once in the WHERE clause and once by Postgres itself.
 */
async function listLeads(req, res) {
  const paging = readPaging(req.query, 20, 100);
  const { period, method, status } = req.query;

  if (period && !LEAD_PERIODS.includes(period)) {
    return res.status(400).json({ error: `period must be one of: ${LEAD_PERIODS.join(', ')}` });
  }
  if (status && !LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${LEAD_STATUSES.join(', ')}` });
  }
  if (method && !LEAD_METHODS[method]) {
    return res.status(400).json({ error: 'method must be call or whatsapp' });
  }

  const result = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;
    return qualifiedLeads.listForPandit(pandit.id, {
      page: paging.page,
      limit: paging.perPage,
      period: period === 'all' ? undefined : period,
      method: method ? LEAD_METHODS[method] : undefined,
      status,
    }, q);
  });

  if (!result) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json(paginationEnvelope(result.data, paging, result.total));
}

/**
 * PATCH /api/me/leads/:id — pandit re-statuses one of their own leads.
 *
 * Only `status` is writable. The lead itself is never deleted and its
 * timestamps are never rewritten: it is the pandit's billing evidence and it
 * is an input to the fairness engine, so marking a lead "completed" must not
 * remove it from either.
 */
async function updateLeadStatus(req, res) {
  const { status } = req.body || {};
  if (!LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${LEAD_STATUSES.join(', ')}` });
  }

  const outcome = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return 'no_profile';
    const ok = await qualifiedLeads.updateStatus(pandit.id, req.params.id, status, q);
    return ok ? 'ok' : 'not_found';
  });

  if (outcome === 'no_profile') return res.status(404).json({ error: 'No pandit profile for this account' });
  // A lead belonging to another pandit is indistinguishable from one that
  // does not exist — no cross-tenant existence oracle.
  if (outcome === 'not_found') return res.status(404).json({ error: 'Lead not found' });
  res.json({ ok: true, status });
}

/** GET /api/me/export — "right to data portability": everything this
 *  account owns, as one JSON document. */
async function exportData(req, res) {
  const data = await withUserContext(req.user.id, (q) => authRepo.exportAccountData(req.user.id, q));
  res.json(data);
}

/** DELETE /api/me — "right to erasure": soft-delete + anonymize (see
 *  authRepo.softDeleteAccount for why not a hard DELETE) and revoke every
 *  session, including the one making this request. */
async function deleteAccount(req, res) {
  await withUserContext(req.user.id, (q) => authRepo.softDeleteAccount(req.user.id, q));
  res.json({ ok: true });
}

/** GET /api/me/pandit-profile — the pandit's own editable profile. */
async function getOwnPanditProfile(req, res) {
  const data = await withUserContext(req.user.id, (q) => dashboard.ownProfile(req.user.id, q));
  if (!data) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json(data);
}

/**
 * PUT /api/me/pandit-profile — self-service edit, allow-listed.
 *
 * Any field not in dashboard.PANDIT_EDITABLE is silently ignored rather than
 * rejected, so a client sending a whole profile object (including
 * verification_status or current_tier) simply has those parts dropped instead
 * of the whole save failing. The important half is that they are never
 * written.
 */
async function updateOwnPanditProfile(req, res) {
  const body = req.body || {};
  if (body.experienceYears !== undefined) {
    const n = Number(body.experienceYears);
    if (!Number.isInteger(n) || n < 0 || n > 90) {
      return res.status(400).json({ error: 'experienceYears must be a whole number between 0 and 90' });
    }
    body.experienceYears = n;
  }
  if (body.bio !== undefined && String(body.bio).length > 5000) {
    return res.status(400).json({ error: 'bio is too long' });
  }
  if (body.specializations !== undefined && !Array.isArray(body.specializations)) {
    return res.status(400).json({ error: 'specializations must be an array' });
  }

  const updated = await withUserContext(req.user.id, (q) => dashboard.updateOwnProfile(req.user.id, body, q));
  if (!updated) return res.status(400).json({ error: 'Koi valid field update ke liye nahi mila.' });
  res.json(updated);
}

const { COUNTRY_NAMES } = require('../config/countryNames');

/**
 * GET /api/me/leads/trend?days=7|30|90 — daily leads + views for a chart.
 * Same ownership pattern as listLeads: panditId is always resolved from the
 * session, never accepted from the client.
 */
async function leadsTrend(req, res) {
  const days = Number(req.query.days) || 30;
  if (!qualifiedLeads.TREND_DAYS_ALLOWED.includes(days)) {
    return res.status(400).json({ error: `days must be one of: ${qualifiedLeads.TREND_DAYS_ALLOWED.join(', ')}` });
  }

  const points = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;
    return qualifiedLeads.trendForPandit(pandit.id, days, q);
  });

  if (points === null) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json({ days, points });
}

/**
 * GET /api/me/leads/geo?period=today|7d|30d|all — where qualified leads are
 * coming from. Country is derived from the devotee's verified phone (the
 * same evidence record_qualified_lead() required to create the lead in the
 * first place); city/state is whatever the devotee put in their own profile.
 *
 * Deliberately NOT available for profile views — a view is anonymous by
 * design (see panditDashboard above) and stays that way here too.
 */
async function leadsGeo(req, res) {
  const period = req.query.period;
  if (period && !LEAD_PERIODS.includes(period)) {
    return res.status(400).json({ error: `period must be one of: ${LEAD_PERIODS.join(', ')}` });
  }

  const rows = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;
    return qualifiedLeads.geoForPandit(pandit.id, period === 'all' ? undefined : period, q);
  });

  if (rows === null) return res.status(404).json({ error: 'No pandit profile for this account' });

  const countryCounts = new Map();
  const cityCounts = new Map();
  let unresolved = 0;

  for (const row of rows) {
    const code = countryFromPhone(row.phone);
    if (code) countryCounts.set(code, (countryCounts.get(code) || 0) + 1);
    else unresolved += 1;

    const city = (row.city || '').trim();
    if (city) {
      const key = `${city}|${row.state || ''}`;
      const entry = cityCounts.get(key) || { city, state: row.state || null, count: 0 };
      entry.count += 1;
      cityCounts.set(key, entry);
    }
  }

  const countries = [...countryCounts.entries()]
    .map(([code, count]) => ({ code, name: COUNTRY_NAMES[code] || code, count }))
    .sort((a, b) => b.count - a.count);

  const cities = [...cityCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({ total: rows.length, unresolved, countries, cities });
}

/**
 * GET /api/me/analytics/detail?period=today|7d|30d|90d|all — row-level
 * qualified-lead facts for the Analytics page's "Lead Explorer": pick any
 * field for X, any measure for Y, and re-aggregate client-side, the way a
 * PowerBI visual lets you swap fields. Same ownership pattern as every other
 * /me/* route (panditId resolved from session) and the same country-from-
 * phone derivation leadsGeo already does — the phone number itself never
 * reaches the client, only the country it resolves to.
 */
async function analyticsDetail(req, res) {
  const period = req.query.period;
  if (period && !LEAD_PERIODS.includes(period)) {
    return res.status(400).json({ error: `period must be one of: ${LEAD_PERIODS.join(', ')}` });
  }

  const rows = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;
    return qualifiedLeads.detailForPandit(pandit.id, period === 'all' ? undefined : period, q);
  });

  if (rows === null) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json({ rows: rows.map(qualifiedLeads.mapDetailRow) });
}

/**
 * GET /api/me/payments — the pandit's own billing/payment history.
 *
 * Same ownership pattern as listLeads/leadsTrend/leadsGeo: the pandit id is
 * always resolved from the session, never accepted from the client, and the
 * repository query additionally scopes by pandit_id itself (belt-and-braces
 * alongside RLS).
 */
async function listMyPayments(req, res) {
  const paging = readPaging(req.query, 20, 100);

  const result = await withUserContext(req.user.id, async (q) => {
    const pandit = await dashboard.panditForUser(req.user.id, q);
    if (!pandit) return null;
    return payments.listPaymentsForPandit(pandit.id, { page: paging.page, limit: paging.perPage }, q);
  });

  if (!result) return res.status(404).json({ error: 'No pandit profile for this account' });
  res.json(paginationEnvelope(result.data, paging, result.total));
}

module.exports = {
  listSavedPandits, listSavedTemples, addSavedPandit, removeSavedPandit, addSavedTemple, removeSavedTemple,
  listNotifications, readNotification, inbox, updateInquiry, panditDashboard, exportData, deleteAccount,
  listLeads, updateLeadStatus, getOwnPanditProfile, updateOwnPanditProfile,
  leadsTrend, leadsGeo, analyticsDetail, listMyPayments,
};
