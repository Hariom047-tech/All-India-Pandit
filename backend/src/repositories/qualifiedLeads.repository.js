const { pool, query } = require('../config/db');
const { QUALIFIED_LEAD_DEDUP_HOURS, LEAD_REPORTING_TIMEZONE } = require('../config/leads');
const { COUNTRY_NAMES } = require('../config/countryNames');
const { countryFromPhone } = require('../services/distribution/market');

/**
 * Every CTA press is recorded as a contact_click (raw funnel analytics),
 * and — only when it qualifies — rolled up into a qualified_lead.
 *
 * Both happen inside ONE explicit transaction so that:
 *   1. the transaction-scoped advisory lock taken by record_qualified_lead()
 *      is held until COMMIT, not released the instant the function returns,
 *      which is what actually makes parallel double-taps safe; and
 *   2. a click can never be persisted pointing at a lead that got rolled
 *      back, or vice versa.
 *
 * Guest clicks (userId = null) skip the lead path entirely and just record
 * the click — they are analytics, never leads.
 */
/*
 * templeId/serviceId are the POOL the contact happened in, not a claim about
 * the lead's validity. They let the fairness engine count a lead against the
 * right temple — without them every lead lands in the global bucket and a
 * per-temple deficit can never be computed. Optional: a contact from a bare
 * profile page legitimately has no pool.
 */
async function recordContact({ panditId, userId, method, source, ip, userAgent, templeId = null, serviceId = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let lead = { lead_id: null, was_created: false, reason: 'not_authenticated' };

    if (userId) {
      const { rows } = await client.query(
        `SELECT * FROM record_qualified_lead($1, $2, $3::contact_method, $4, $5, $6, $7)`,
        [panditId, userId, method, QUALIFIED_LEAD_DEDUP_HOURS, source || null,
         templeId || null, serviceId || null],
      );
      lead = rows[0];
    }

    await client.query(
      `INSERT INTO contact_clicks
         (pandit_id, user_id, contact_method, source_page, ip_address, user_agent,
          qualified_lead_id, created_qualified_lead)
       VALUES ($1, $2, $3::contact_method, $4, NULLIF($5,'')::inet, $6, $7, $8)`,
      [panditId, userId || null, method, source || null, ip || '', userAgent || null,
        lead.lead_id || null, Boolean(lead.was_created)],
    );

    // Keeps the denormalised counters on `pandits` (total_contact_clicks,
    // total_call_clicks, total_whatsapp_clicks) truthful. These are raw CTA
    // counters and intentionally still count guests — they are NOT leads.
    await client.query(`SELECT increment_pandit_stats($1, 'click', $2)`, [panditId, method]);

    // Daily rollup, so the dashboard can answer "this week" without scanning
    // every click row. pandit_analytics existed but nothing wrote to it, which
    // is why the old dashboard had no real time series to show.
    await client.query(
      `INSERT INTO pandit_analytics (pandit_id, date, whatsapp_clicks, call_clicks)
       VALUES ($1, (NOW() AT TIME ZONE $2)::date, $3, $4)
       ON CONFLICT (pandit_id, date) DO UPDATE
         SET whatsapp_clicks = pandit_analytics.whatsapp_clicks + EXCLUDED.whatsapp_clicks,
             call_clicks     = pandit_analytics.call_clicks     + EXCLUDED.call_clicks`,
      [panditId, LEAD_REPORTING_TIMEZONE, method === 'whatsapp' ? 1 : 0, method === 'phone_call' ? 1 : 0],
    );

    await client.query('COMMIT');
    return {
      leadId: lead.lead_id || null,
      qualifiedLead: Boolean(lead.was_created),
      reason: lead.reason,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * today / week / month qualified-lead counts for one pandit.
 *
 * Boundaries are computed in LEAD_REPORTING_TIMEZONE inside Postgres, not in
 * Node and not from the server clock's zone: `NOW() AT TIME ZONE 'Asia/Kolkata'`
 * gives IST wall-clock, date_trunc snaps it to the local day/week/month, and
 * the second AT TIME ZONE converts that local boundary back to an absolute
 * timestamptz for comparison. Postgres weeks start Monday.
 */
async function countsForPandit(panditId, q = query) {
  const { rows } = await q(
    `WITH b AS (
        SELECT
          (date_trunc('day',   NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS day_start,
          (date_trunc('week',  NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS week_start,
          (date_trunc('month', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS month_start
     )
     -- COUNT(ql.id), not COUNT(*): the LEFT JOIN still yields one all-NULL
     -- row for a pandit with zero leads, and COUNT(*) would score that as 1.
     SELECT
       COUNT(ql.id) FILTER (WHERE ql.created_at >= b.day_start)::int   AS today,
       COUNT(ql.id) FILTER (WHERE ql.created_at >= b.week_start)::int  AS week,
       COUNT(ql.id) FILTER (WHERE ql.created_at >= b.month_start)::int AS month,
       COUNT(ql.id)::int                                               AS total
     FROM b LEFT JOIN qualified_leads ql
       ON ql.pandit_id = $1
     GROUP BY b.day_start, b.week_start, b.month_start`,
    [panditId, LEAD_REPORTING_TIMEZONE],
  );
  return rows[0] || { today: 0, week: 0, month: 0, total: 0 };
}

/**
 * The funnel, as four strictly separate numbers. Mixing these is the exact
 * misrepresentation the spec forbids, so they are computed independently and
 * never summed:
 *   profileViews          — anyone, including guests and bots
 *   ctaClicks             — every Call/WhatsApp press, including guests
 *   verifiedInteractions  — CTA presses from a logged-in user
 *   qualifiedLeads        — de-duplicated verified intents
 */
async function analyticsForPandit(panditId, q = query) {
  const { rows } = await q(
    `SELECT
       (SELECT total_profile_views FROM pandits WHERE id = $1)::bigint            AS profile_views,
       (SELECT COUNT(*) FROM contact_clicks WHERE pandit_id = $1)::int            AS cta_clicks,
       (SELECT COUNT(*) FROM contact_clicks
         WHERE pandit_id = $1 AND contact_method = 'phone_call')::int             AS call_interactions,
       (SELECT COUNT(*) FROM contact_clicks
         WHERE pandit_id = $1 AND contact_method = 'whatsapp')::int               AS whatsapp_interactions,
       (SELECT COUNT(*) FROM contact_clicks
         WHERE pandit_id = $1 AND user_id IS NOT NULL)::int                       AS verified_interactions,
       (SELECT COUNT(*) FROM qualified_leads WHERE pandit_id = $1)::int           AS qualified_lead_count,
       -- Per-period profile views come from the pandit_analytics daily rollup
       -- (pandits.total_profile_views is a lifetime counter with no history).
       COALESCE((SELECT SUM(pa.profile_views) FROM pandit_analytics pa
                  WHERE pa.pandit_id = $1
                    AND pa.date = (NOW() AT TIME ZONE $2)::date), 0)::int          AS views_today,
       COALESCE((SELECT SUM(pa.profile_views) FROM pandit_analytics pa
                  WHERE pa.pandit_id = $1
                    AND pa.date >= (date_trunc('week', NOW() AT TIME ZONE $2))::date), 0)::int  AS views_week,
       COALESCE((SELECT SUM(pa.profile_views) FROM pandit_analytics pa
                  WHERE pa.pandit_id = $1
                    AND pa.date >= (date_trunc('month', NOW() AT TIME ZONE $2))::date), 0)::int AS views_month`,
    [panditId, LEAD_REPORTING_TIMEZONE],
  );
  const r = rows[0] || {};
  return {
    profileViews: Number(r.profile_views || 0),
    viewsToday: r.views_today || 0,
    viewsWeek: r.views_week || 0,
    viewsMonth: r.views_month || 0,
    ctaClicks: r.cta_clicks || 0,
    callInteractions: r.call_interactions || 0,
    whatsappInteractions: r.whatsapp_interactions || 0,
    verifiedInteractions: r.verified_interactions || 0,
    qualifiedLeadCount: r.qualified_lead_count || 0,
  };
}

const PERIOD_INTERVALS = { today: '1 day', '7d': '7 days', '30d': '30 days', '90d': '90 days' };

/**
 * Paginated lead list for ONE pandit.
 *
 * panditId is always resolved server-side from the authenticated session —
 * this function is never handed an id that came off the wire.
 *
 * The devotee's live name/phone is joined for freshness, but falls back to
 * the snapshot captured at lead time so a lead stays actionable even if the
 * devotee later deletes their account. Nothing else about the user is
 * selected: no email, no DOB, no address, no tokens.
 */
async function listForPandit(panditId, { page = 1, limit = 20, period, method, status }, q = query) {
  const where = ['ql.pandit_id = $1'];
  const params = [panditId];

  if (period && PERIOD_INTERVALS[period]) {
    if (period === 'today') {
      params.push(LEAD_REPORTING_TIMEZONE);
      where.push(`ql.created_at >= (date_trunc('day', NOW() AT TIME ZONE $${params.length}) AT TIME ZONE $${params.length})`);
    } else {
      params.push(PERIOD_INTERVALS[period]);
      where.push(`ql.created_at >= NOW() - $${params.length}::interval`);
    }
  }
  if (method) { params.push(method); where.push(`ql.first_contact_method = $${params.length}::contact_method`); }
  if (status) { params.push(status); where.push(`ql.status = $${params.length}::lead_status`); }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * limit;

  // One JOIN, not a per-row user lookup — this list is rendered 20 rows at a
  // time and an N+1 here would be 21 round trips per page load.
  params.push(limit, offset);
  const { rows } = await q(
    `SELECT ql.id, ql.first_contact_method, ql.last_contact_method, ql.interaction_count,
            ql.status, ql.created_at, ql.last_interaction_at,
            COALESCE(u.full_name, ql.contact_name_snapshot)  AS contact_name,
            COALESCE(u.phone,     ql.contact_phone_snapshot) AS contact_phone,
            COALESCE(u.city,  ql.contact_city_snapshot)  AS city,
            COALESCE(u.state, ql.contact_state_snapshot) AS state
       FROM qualified_leads ql
       LEFT JOIN users u ON u.id = ql.user_id AND u.deleted_at IS NULL
       ${whereSql}
      ORDER BY ql.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM qualified_leads ql ${whereSql}`,
    params.slice(0, params.length - 2),
  );

  return { data: rows, total: countRows[0].total };
}

async function recentForPandit(panditId, limit = 5, q = query) {
  const { data } = await listForPandit(panditId, { page: 1, limit }, q);
  return data;
}

/**
 * Status update, scoped by pandit_id in the WHERE clause as well as by RLS.
 * Belt and braces: RLS already prevents cross-pandit writes, but an explicit
 * predicate means a future RLS regression doesn't silently become an IDOR.
 * Only `status` is writable — the lead's identity, counts and timestamps are
 * historical record and feed billing/fairness.
 */
async function updateStatus(panditId, leadId, status, q = query) {
  const { rowCount } = await q(
    `UPDATE qualified_leads
        SET status = $3::lead_status, status_changed_at = NOW()
      WHERE id = $2 AND pandit_id = $1`,
    [panditId, leadId, status],
  );
  return rowCount > 0;
}

const TREND_DAYS_ALLOWED = [7, 30, 90];

/**
 * Day-by-day trend for the last `days` calendar days (in
 * LEAD_REPORTING_TIMEZONE), zero-filled so the chart never has to guess at a
 * gap. Leads come straight from qualified_leads; views/clicks come from the
 * pandit_analytics daily rollup (written by recordContact's INSERT ... ON
 * CONFLICT — see recordContact above). Both are bucketed by the SAME local
 * day the rest of the dashboard uses, so this can never disagree with the
 * today/week/month stat cards.
 */
async function trendForPandit(panditId, days, q = query) {
  if (!TREND_DAYS_ALLOWED.includes(days)) days = 30;
  const { rows } = await q(
    `WITH bounds AS (
        SELECT (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS today_start
     ),
     days AS (
        SELECT (b.today_start - (n || ' days')::interval) AS day_start
          FROM bounds b, generate_series(0, $3::int - 1) AS n
     ),
     lead_days AS (
        SELECT (date_trunc('day', created_at AT TIME ZONE $2) AT TIME ZONE $2) AS day_start,
               COUNT(*)::int AS leads
          FROM qualified_leads
         WHERE pandit_id = $1
         GROUP BY 1
     ),
     analytics_days AS (
        SELECT date, profile_views, call_clicks, whatsapp_clicks
          FROM pandit_analytics
         WHERE pandit_id = $1
     )
     SELECT to_char((d.day_start AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS date,
            COALESCE(ld.leads, 0)             AS leads,
            COALESCE(ad.profile_views, 0)     AS views,
            COALESCE(ad.call_clicks, 0)       AS call_clicks,
            COALESCE(ad.whatsapp_clicks, 0)   AS whatsapp_clicks
       FROM days d
       LEFT JOIN lead_days ld ON ld.day_start = d.day_start
       LEFT JOIN analytics_days ad ON ad.date = (d.day_start AT TIME ZONE $2)::date
      ORDER BY d.day_start`,
    [panditId, LEAD_REPORTING_TIMEZONE, days],
  );
  return rows;
}

/**
 * Raw material for the "where are my leads coming from" breakdown: one row
 * per qualified lead in the period, with just enough to derive a country
 * (from the verified phone — same evidence record_qualified_lead() already
 * required) and a city/state (from the devotee's own profile).
 *
 * Aggregation (country lookup via countryFromPhone, top-N cities) happens in
 * the controller, NOT here, so the phone→country table has exactly one
 * implementation on the Node side instead of a second copy in SQL — see
 * services/distribution/market.js.
 *
 * Nothing here is new exposure: contact_phone_snapshot/city/state are already
 * readable by this pandit for these same leads via listForPandit.
 */
async function geoForPandit(panditId, period, q = query) {
  const where = ['ql.pandit_id = $1'];
  const params = [panditId];

  if (period && PERIOD_INTERVALS[period]) {
    if (period === 'today') {
      params.push(LEAD_REPORTING_TIMEZONE);
      where.push(`ql.created_at >= (date_trunc('day', NOW() AT TIME ZONE $${params.length}) AT TIME ZONE $${params.length})`);
    } else {
      params.push(PERIOD_INTERVALS[period]);
      where.push(`ql.created_at >= NOW() - $${params.length}::interval`);
    }
  }

  const { rows } = await q(
    `SELECT COALESCE(u.phone, ql.contact_phone_snapshot) AS phone,
            COALESCE(u.city,  ql.contact_city_snapshot)  AS city,
            COALESCE(u.state, ql.contact_state_snapshot) AS state
       FROM qualified_leads ql
       LEFT JOIN users u ON u.id = ql.user_id AND u.deleted_at IS NULL
      WHERE ${where.join(' AND ')}`,
    params,
  );
  return rows;
}

/**
 * Row-level qualified-lead facts for client-side pivoting (the Analytics
 * "Lead Explorer" — pick any field for X, any measure for Y). Same
 * ownership/period pattern as geoForPandit, just selecting more columns:
 * status, contact method and interaction_count in addition to the
 * phone/city/state geoForPandit already exposes for THIS pandit's own leads.
 *
 * LIMIT 3000 is a defensive cap, not a real-world limiter — a single
 * pandit's lead volume is nowhere near that; it just bounds worst-case query
 * cost if it ever were.
 */
async function detailForPandit(panditId, period, q = query) {
  const where = ['ql.pandit_id = $1'];
  const params = [panditId];

  if (period && PERIOD_INTERVALS[period]) {
    if (period === 'today') {
      params.push(LEAD_REPORTING_TIMEZONE);
      where.push(`ql.created_at >= (date_trunc('day', NOW() AT TIME ZONE $${params.length}) AT TIME ZONE $${params.length})`);
    } else {
      params.push(PERIOD_INTERVALS[period]);
      where.push(`ql.created_at >= NOW() - $${params.length}::interval`);
    }
  }

  const { rows } = await q(
    `SELECT ql.created_at, ql.status, ql.first_contact_method, ql.interaction_count, ql.market::text AS market,
            COALESCE(u.phone, ql.contact_phone_snapshot) AS phone,
            COALESCE(u.city,  ql.contact_city_snapshot)  AS city,
            COALESCE(u.state, ql.contact_state_snapshot) AS state
       FROM qualified_leads ql
       LEFT JOIN users u ON u.id = ql.user_id AND u.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
      ORDER BY ql.created_at DESC
      LIMIT 3000`,
    params,
  );
  return rows;
}

/**
 * Maps one detailForPandit() row into the wire shape returned by both
 * /me/analytics/detail (the pandit's own Lead Explorer) and its admin
 * equivalent — one mapping, so a pandit's own numbers and the admin's view
 * of that same pandit can never disagree about what a "country" or "market"
 * label means. Country is derived from the phone the same way geoForPandit
 * derives it; the phone itself never appears in the output.
 */
function mapDetailRow(row) {
  const code = countryFromPhone(row.phone);
  return {
    date: row.created_at.toLocaleDateString('en-CA', { timeZone: LEAD_REPORTING_TIMEZONE }),
    createdAt: row.created_at,
    status: row.status,
    method: row.first_contact_method,
    interactionCount: row.interaction_count,
    market: row.market === 'INDIA' ? 'India' : row.market === 'INTERNATIONAL' ? 'International' : null,
    country: code ? (COUNTRY_NAMES[code] || code) : null,
    city: row.city || null,
    state: row.state || null,
  };
}

module.exports = {
  recordContact,
  countsForPandit,
  analyticsForPandit,
  listForPandit,
  recentForPandit,
  updateStatus,
  trendForPandit,
  geoForPandit,
  detailForPandit,
  mapDetailRow,
  TREND_DAYS_ALLOWED,
};
