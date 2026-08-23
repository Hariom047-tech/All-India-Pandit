/**
 * Calendar-aware billing-period arithmetic.
 *
 * Deliberately NOT `days * 24 * 60 * 60 * 1000` — a "month" and a "year" are
 * calendar concepts, not fixed durations, and the difference is visible at
 * exactly the edges that matter for a subscription business: a 31 Jan
 * purchase must renew on 28/29 Feb (there is no 31 Feb), never silently
 * drift into March.
 *
 * All arithmetic is done in UTC (Date's own UTC accessors), matching the
 * rest of this codebase's "store timestamps in UTC, only render them in a
 * local zone" convention (see LEAD_REPORTING_TIMEZONE usage elsewhere).
 */

const VALID_CYCLES = ['monthly', 'quarterly', 'yearly'];

/** Last valid day-of-month for (year, monthIndex) — monthIndex is 0-based. */
function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Add whole calendar months, clamping the day-of-month to the target
 * month's last day when the original day doesn't exist there (31 Jan + 1
 * month = 28 or 29 Feb, never 3 Mar).
 */
function addCalendarMonths(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(
    targetYear, targetMonth, clampedDay,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds(),
  ));
}

/** Add whole calendar years, clamping 29 Feb to 28 Feb in a non-leap target year. */
function addCalendarYears(date, years) {
  const targetYear = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, month));
  return new Date(Date.UTC(
    targetYear, month, day,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds(),
  ));
}

/** date + one billing period for `cycle` ('monthly' | 'quarterly' | 'yearly'). */
function addBillingPeriod(date, cycle) {
  if (cycle === 'monthly') return addCalendarMonths(date, 1);
  if (cycle === 'quarterly') return addCalendarMonths(date, 3);
  if (cycle === 'yearly') return addCalendarYears(date, 1);
  throw new Error(`Unknown billing cycle: ${cycle}`);
}

module.exports = { addBillingPeriod, addCalendarMonths, addCalendarYears, VALID_CYCLES };
