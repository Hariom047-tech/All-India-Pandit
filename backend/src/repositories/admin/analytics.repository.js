async function overview(q, days = 30) {
  const newUsers = (await q(`SELECT COUNT(*)::int AS c FROM users WHERE created_at >= NOW() - ($1 || ' days')::interval`, [days])).rows[0].c;
  const newPandits = (await q(`SELECT COUNT(*)::int AS c FROM pandits WHERE created_at >= NOW() - ($1 || ' days')::interval`, [days])).rows[0].c;
  const newReviews = (await q(`SELECT COUNT(*)::int AS c FROM reviews WHERE created_at >= NOW() - ($1 || ' days')::interval`, [days])).rows[0].c;
  const newInquiries = (await q(`SELECT COUNT(*)::int AS c FROM inquiries WHERE created_at >= NOW() - ($1 || ' days')::interval`, [days])).rows[0].c;
  const totalProfileViews = (await q('SELECT COALESCE(SUM(total_profile_views), 0)::bigint AS c FROM pandits')).rows[0].c;
  const totalContactClicks = (await q('SELECT COALESCE(SUM(total_contact_clicks), 0)::bigint AS c FROM pandits')).rows[0].c;
  const totalTempleViews = (await q('SELECT COALESCE(SUM(total_views), 0)::bigint AS c FROM temples')).rows[0].c;
  return { period: `${days}d`, newUsers, newPandits, newReviews, newInquiries, totalProfileViews, totalContactClicks, totalTempleViews };
}

async function topPandits(q, limit = 10) {
  const { rows } = await q(
    `SELECT p.slug, u.full_name AS name, p.avg_rating, p.review_count, p.total_profile_views, p.rank_score
     FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL ORDER BY p.rank_score DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

async function topTemples(q, limit = 10) {
  const { rows } = await q(
    `SELECT slug, name, avg_rating, review_count, total_views FROM temples
     WHERE deleted_at IS NULL ORDER BY total_views DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

async function topServices(q, limit = 10) {
  const { rows } = await q(
    `SELECT s.slug, s.name, COUNT(ps.pandit_id)::int AS pandit_count
     FROM services s LEFT JOIN pandit_services ps ON ps.service_id = s.id AND ps.is_active = TRUE
     GROUP BY s.id ORDER BY pandit_count DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

async function topCities(q, limit = 10) {
  const { rows } = await q(
    `SELECT city, COUNT(*)::int AS pandit_count FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL AND u.city IS NOT NULL GROUP BY u.city ORDER BY pandit_count DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

async function funnel(q) {
  const totalProfileViews = (await q('SELECT COALESCE(SUM(total_profile_views), 0)::bigint AS c FROM pandits')).rows[0].c;
  const totalContactClicks = (await q('SELECT COALESCE(SUM(total_contact_clicks), 0)::bigint AS c FROM pandits')).rows[0].c;
  const totalInquiries = (await q('SELECT COUNT(*)::int AS c FROM inquiries')).rows[0].c;
  const conversionRate = totalProfileViews > 0 ? Number((totalInquiries / totalProfileViews).toFixed(4)) : 0;
  return { profileViews: totalProfileViews, contactClicks: totalContactClicks, inquiriesSent: totalInquiries, conversionRate };
}

module.exports = { overview, topPandits, topTemples, topServices, topCities, funnel };
