const { query } = require('../../config/db');
const settingsRepo = require('../../repositories/admin/settings.repository');
const { LEAD_REPORTING_TIMEZONE } = require('../../config/leads');

/**
 * Default offsets match the spec's minimum set: 7/5/3/1 days before expiry,
 * on the day of expiry, and 3 days after. Admin-configurable via the SAME
 * generic platform_settings key/value store GST uses (see tax.js) — no new
 * settings plumbing, just a new key.
 */
const DEFAULT_REMINDERS = { enabled: true, offsets: [7, 5, 3, 1, 0, -3] };

async function getReminderSettings(q = query) {
  const value = await settingsRepo.getByKey(q, 'billing_reminders');
  return value && typeof value === 'object' ? { ...DEFAULT_REMINDERS, ...value } : DEFAULT_REMINDERS;
}

/** "Today (IST) + offsetDays" as a YYYY-MM-DD string — computed in Node so
 *  the SQL side only ever does a plain date equality, no date+interval
 *  arithmetic to get subtly wrong. */
function targetDateString(offsetDays) {
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: LEAD_REPORTING_TIMEZONE }));
  istNow.setDate(istNow.getDate() + offsetDays);
  const y = istNow.getFullYear();
  const m = String(istNow.getMonth() + 1).padStart(2, '0');
  const d = String(istNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function messageFor(offsetDays, planName, expiresLabel) {
  if (offsetDays > 0) {
    return {
      title: `Your ${planName} plan expires in ${offsetDays} din`,
      body: `Valid until ${expiresLabel}. Renew karein taaki profile visibility aur plan benefits mein koi rukawat na aaye.`,
    };
  }
  if (offsetDays === 0) {
    return {
      title: `Your ${planName} plan expires today`,
      body: `Renew karein taaki profile visibility aur plan benefits mein koi rukawat na aaye.`,
    };
  }
  return {
    title: `Your ${planName} plan has expired`,
    body: `${expiresLabel} ko expire ho gaya. Renew karke apne paid plan ke benefits wapas paayein.`,
  };
}

/**
 * One tick: for each configured offset, find active subscriptions expiring
 * on exactly that day (IST) that haven't already gotten THIS offset's
 * reminder (subscription_reminder_log, migration 31), write an in-app
 * notification using the notification_type the schema already defines
 * (subscription_expiring — no new enum value needed), and log it sent.
 *
 * In-app + dashboard banner satisfy the spec's MANDATORY channel. Email/SMS
 * are deliberately not attempted — no provider is configured anywhere in
 * this codebase (see the subscription-billing plan doc's audit), and faking
 * a "sent" email would violate "never fake delivery channels not configured".
 */
async function dispatchReminders() {
  const settings = await getReminderSettings();
  if (!settings.enabled) return 0;

  let sent = 0;
  for (const offsetDays of settings.offsets) {
    const targetDate = targetDateString(offsetDays);
    const { rows } = await query(
      `SELECT ps.id AS subscription_id, ps.expires_at, u.id AS user_id, sp.name AS plan_name
         FROM pandit_subscriptions ps
         JOIN pandits p ON p.id = ps.pandit_id
         JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
         JOIN subscription_plans sp ON sp.id = ps.plan_id
        WHERE ps.is_active = TRUE
          AND (ps.expires_at AT TIME ZONE $2)::date = $1::date
          AND NOT EXISTS (
            SELECT 1 FROM subscription_reminder_log l
             WHERE l.subscription_id = ps.id AND l.offset_days = $3
          )`,
      [targetDate, LEAD_REPORTING_TIMEZONE, offsetDays],
    );

    for (const row of rows) {
      const expiresLabel = new Date(row.expires_at).toLocaleDateString('en-IN', {
        timeZone: LEAD_REPORTING_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric',
      });
      const { title, body } = messageFor(offsetDays, row.plan_name, expiresLabel);
      await query(
        `INSERT INTO notifications (user_id, type, title, body, action_url)
         VALUES ($1, 'subscription_expiring', $2, $3, '/pandit/dashboard/plan')`,
        [row.user_id, title, body],
      );
      await query(
        `INSERT INTO subscription_reminder_log (subscription_id, offset_days) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [row.subscription_id, offsetDays],
      );
      sent += 1;
    }
  }
  if (sent) console.log(`[billing] dispatched ${sent} subscription expiry reminder(s)`);
  return sent;
}

/** Same shape as expiryScheduler.js's start/stop — an hourly tick is plenty
 *  for a once-a-day-granularity reminder; a day boundary crossing between
 *  ticks just means that offset's reminders go out within the same hour
 *  they would have anyway. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let timer = null;

function start() {
  if (timer) return;
  const runSafely = () => dispatchReminders().catch((err) => console.error('[billing] reminder dispatch failed:', err));
  runSafely();
  timer = setInterval(runSafely, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { dispatchReminders, getReminderSettings, DEFAULT_REMINDERS, targetDateString, start, stop };
