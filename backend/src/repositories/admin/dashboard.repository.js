// Every function here takes `q` = req.db (see middleware/admin.js's
// adminHandler) — sequential awaits, not Promise.all: q is bound to one
// shared transactional client, which can't run overlapping queries.
async function stats(q) {
  const totalUsers = (await q('SELECT COUNT(*)::int AS c FROM users WHERE deleted_at IS NULL')).rows[0].c;
  const totalPandits = (await q('SELECT COUNT(*)::int AS c FROM pandits WHERE deleted_at IS NULL')).rows[0].c;
  const totalTemples = (await q('SELECT COUNT(*)::int AS c FROM temples WHERE deleted_at IS NULL')).rows[0].c;
  const pendingVerifications = (await q(
    `SELECT COUNT(*)::int AS c FROM pandits WHERE verification_status IN ('documents_submitted', 'under_review') AND deleted_at IS NULL`,
  )).rows[0].c;
  const flaggedReviews = (await q('SELECT COUNT(*)::int AS c FROM reviews WHERE is_flagged = TRUE AND deleted_at IS NULL')).rows[0].c;
  const todayInquiries = (await q('SELECT COUNT(*)::int AS c FROM inquiries WHERE created_at >= CURRENT_DATE')).rows[0].c;
  const pendingInquiries = (await q(`SELECT COUNT(*)::int AS c FROM inquiries WHERE status = 'new'`)).rows[0].c;
  const monthRevenue = (await q(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS c FROM payment_transactions
     WHERE status = 'completed' AND paid_at >= date_trunc('month', CURRENT_DATE)`,
  )).rows[0].c;
  const activeSubscriptions = (await q(
    'SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE is_active = TRUE AND expires_at > NOW()',
  )).rows[0].c;
  const todaySignups = (await q('SELECT COUNT(*)::int AS c FROM users WHERE created_at >= CURRENT_DATE')).rows[0].c;

  return {
    totalUsers, totalPandits, totalTemples, pendingVerifications, flaggedReviews,
    todayInquiries, pendingInquiries, monthRevenue, activeSubscriptions, todaySignups,
  };
}

async function recentActivity(q, limit = 20) {
  const { rows } = await q(
    `SELECT al.action, al.target_type, al.target_id, al.details, al.created_at, u.full_name AS admin_name
     FROM admin_activity_log al JOIN users u ON u.id = al.admin_user_id
     ORDER BY al.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

module.exports = { stats, recentActivity };
