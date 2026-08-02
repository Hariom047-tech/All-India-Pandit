const { query } = require('../config/db');

/** Both of these read/write `inquiries`, which has RLS enabled scoped to the
 *  pandit's own inbox (inquiries_select_own_or_pandit / _update_pandit) —
 *  callers must go through withUserContext(userId, (q) => ...). */
async function inboxForPandit(userId, q = query) {
  const { rows } = await q(
    `SELECT i.id, i.full_name, i.phone, i.email, i.message, i.preferred_date, i.status, i.created_at,
            sv.name AS service, t.name AS temple
     FROM inquiries i
     JOIN pandits p ON p.id = i.pandit_id
     LEFT JOIN services sv ON sv.id = i.service_id
     LEFT JOIN temples t ON t.id = i.temple_id
     WHERE p.user_id = $1
     ORDER BY i.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

async function updateInquiryStatus(userId, inquiryId, status, q = query) {
  const { rowCount } = await q(
    `UPDATE inquiries SET status = $1 WHERE id = $2
     AND pandit_id IN (SELECT id FROM pandits WHERE user_id = $3)`,
    [status, inquiryId, userId],
  );
  return rowCount > 0;
}

/** Backed by v_pandit_dashboard (01-schema.sql) — pandit_analytics has RLS
 *  enabled too, so this also needs withUserContext. */
async function forPandit(userId, q = query) {
  const { rows } = await q('SELECT * FROM v_pandit_dashboard WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

module.exports = { inboxForPandit, updateInquiryStatus, forPandit };
