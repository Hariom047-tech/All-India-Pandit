const { query } = require('../config/db');
const { LEAD_REPORTING_TIMEZONE } = require('../config/leads');

const VALID_RANGES = ['today', 'yesterday', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'];

/**
 * Resolves a named (or custom) range into absolute UTC boundaries, computed
 * IN Postgres against LEAD_REPORTING_TIMEZONE — never in Node, and never
 * against the server process's own clock/zone. This is the same rule
 * qualifiedLeads.repository.js's countsForPandit() already follows (see its
 * comment: "Postgres weeks start Monday... AT TIME ZONE gives IST wall-clock").
 * One shared resolver so "today" means the same thing on the admin Pandit
 * analytics page as it does on the pandit's own dashboard (Section 65/126:
 * "avoid mixing local browser dates and UTC incorrectly... same timezone
 * boundaries as counts").
 *
 * Returns { from, to, range, label } — `to` is always "now" except for
 * yesterday/lastMonth, which are closed ranges.
 */
async function resolveRange({ range, from, to }, q = query) {
  const r = VALID_RANGES.includes(range) ? range : '30d';

  if (r === 'custom') {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (!fromDate || Number.isNaN(fromDate.getTime()) || !toDate || Number.isNaN(toDate.getTime())) {
      const err = new Error('custom range requires valid from/to (ISO date) params');
      err.status = 400;
      throw err;
    }
    if (fromDate > toDate) {
      const err = new Error('from must not be after to');
      err.status = 400;
      throw err;
    }
    // Inclusive of the whole `to` day.
    const toEnd = new Date(toDate);
    toEnd.setUTCHours(23, 59, 59, 999);
    return { from: fromDate, to: toEnd, range: 'custom', label: `${from} to ${to}` };
  }

  const sql = {
    today: `SELECT (date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS f, NOW() AS t`,
    yesterday: `SELECT
        (date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1) - interval '1 day' AS f,
        (date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS t`,
    // These two don't need the timezone for their own math (a rolling
    // N-day window is timezone-agnostic), but still take $1 so every branch
    // has an identical parameter signature — a query object built once above
    // and bound with the same params array regardless of which branch ran.
    '7d': `SELECT NOW() - interval '7 days' AS f, NOW() AS t WHERE $1::text IS NOT NULL OR TRUE`,
    '30d': `SELECT NOW() - interval '30 days' AS f, NOW() AS t WHERE $1::text IS NOT NULL OR TRUE`,
    thisMonth: `SELECT (date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS f, NOW() AS t`,
    lastMonth: `SELECT
        (date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1) - interval '1 month' AS f,
        (date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS t`,
  }[r];

  const { rows } = await q(sql, [LEAD_REPORTING_TIMEZONE]);
  return { from: rows[0].f, to: rows[0].t, range: r, label: r };
}

module.exports = { resolveRange, VALID_RANGES };
