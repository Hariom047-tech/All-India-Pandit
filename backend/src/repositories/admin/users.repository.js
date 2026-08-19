/**
 * Devotee/customer accounts ONLY — role is hardcoded, not a caller-supplied
 * filter. This is the fix for the actual role-separation bug: the previous
 * version took `role` as an optional query param and defaulted to no filter
 * at all, so /admin/users silently mixed devotees, pandits, temple_admins,
 * admins and super_admins in one list. `temple_admin` is excluded too — it
 * is an elevated/staff role, not a customer account, even though it isn't
 * `admin`/`super_admin` either; see listAdmins() for the separate screen
 * those roles belong on.
 */
async function list(q, { search, status, city, state, page, perPage }) {
  const where = ["deleted_at IS NULL", "role = 'devotee'"];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (city) { params.push(city); where.push(`city = $${params.length}`); }
  if (state) { params.push(state); where.push(`state = $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT id, email, phone, full_name, role, status, city, state, country, email_verified, phone_verified,
            last_login_at, created_at
     FROM users ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

/**
 * Admin/super_admin accounts — the "separate Admin Users screen" the spec
 * allows in place of mixing them into the devotee list. Same shape as
 * list() minus the pandit-adjacent columns that don't apply here.
 */
async function listAdmins(q, { search, page, perPage }) {
  const where = ["deleted_at IS NULL", "role IN ('admin', 'super_admin')"];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT id, email, full_name, role, status, last_login_at, created_at
     FROM users ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

/** Devotee only, by id — mirrors list()'s role restriction so
 *  /admin/users/:id cannot be used to pull up a pandit's or admin's row
 *  through the devotee detail view just because the id happens to resolve. */
async function getById(q, id) {
  const { rows } = await q(
    `SELECT id, email, phone, full_name, role, status, city, state, country, pincode, email_verified, phone_verified,
            last_login_at, login_count, created_at, updated_at
     FROM users WHERE id = $1 AND deleted_at IS NULL AND role = 'devotee'`,
    [id],
  );
  if (!rows[0]) return null;
  const user = rows[0];

  const { rows: reviewCount } = await q('SELECT COUNT(*)::int AS c FROM reviews WHERE user_id = $1', [id]);
  const { rows: inquiryCount } = await q('SELECT COUNT(*)::int AS c FROM inquiries WHERE user_id = $1', [id]);

  return { ...user, reviewCount: reviewCount[0].c, inquiryCount: inquiryCount[0].c };
}

async function update(q, id, { fullName, phone, city, state, role }) {
  const { rows } = await q(
    `UPDATE users SET
       full_name = COALESCE($2, full_name), phone = COALESCE($3, phone),
       city = COALESCE($4, city), state = COALESCE($5, state),
       role = COALESCE($6, role)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, full_name, role, status, city, state`,
    [id, fullName, phone, city, state, role],
  );
  return rows[0] || null;
}

async function setStatus(q, id, status) {
  const { rowCount } = await q('UPDATE users SET status = $2 WHERE id = $1 AND deleted_at IS NULL', [id, status]);
  return rowCount > 0;
}

async function revokeAllSessions(q, id) {
  await q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
}

async function softDelete(q, id) {
  await q(
    `UPDATE users SET deleted_at = NOW(), email = 'deleted-' || id || '@panditconnect.invalid',
            phone = NULL, full_name = 'Deleted User'
     WHERE id = $1`,
    [id],
  );
  await q('UPDATE pandits SET deleted_at = NOW(), is_available = FALSE WHERE user_id = $1', [id]);
  await revokeAllSessions(q, id);
}

/**
 * One user's admin-visible engagement summary + activity timeline.
 *
 * Summary numbers are computed from their real source tables (qualified_leads,
 * contact_clicks, user_activity_events, reviews, inquiries, user_sessions) —
 * none of them come from the timeline itself, so the timeline can be
 * paginated/truncated without the summary silently going wrong (Section 118:
 * "no black-box counts" — every summary number here has an underlying,
 * independently-queryable dataset).
 */
async function activity(q, userId, { page = 1, perPage = 30 } = {}) {
  // Sequential, not Promise.all — q is a single client bound by
  // withUserContext (adminHandler), and one pg connection cannot run
  // overlapping queries (see me.controller.js's panditDashboard for the
  // same rule already established in this codebase).
  const summaryRows = await q(
    `SELECT
       (SELECT COUNT(*) FROM user_sessions WHERE user_id = $1)::int AS total_sessions,
       (SELECT COUNT(DISTINCT pandit_id) FROM user_activity_events
         WHERE user_id = $1 AND event_type = 'PANDIT_PROFILE_VIEW')::int AS pandit_profiles_viewed,
       (SELECT COUNT(*) FROM contact_clicks WHERE user_id = $1 AND contact_method = 'whatsapp')::int AS chat_clicks,
       (SELECT COUNT(*) FROM contact_clicks WHERE user_id = $1 AND contact_method = 'phone_call')::int AS call_clicks,
       (SELECT COUNT(*) FROM qualified_leads WHERE user_id = $1)::int AS qualified_leads,
       (SELECT COUNT(*) FROM inquiries WHERE user_id = $1)::int AS inquiries,
       (SELECT COUNT(*) FROM reviews WHERE user_id = $1)::int AS reviews,
       (SELECT COUNT(*) FROM user_activity_events
         WHERE user_id = $1 AND event_type = 'AI_RECOMMENDATION')::int AS ai_interactions`,
    [userId],
  );
  const timelineRows = await q(
    `SELECT e.id, e.event_type, e.source_surface, e.created_at, e.country, e.region, e.city, e.market,
            e.qualified_lead_id, e.device_type,
            p.slug AS pandit_slug, pu.full_name AS pandit_name,
            t.name AS temple_name, s.name AS service_name
       FROM user_activity_events e
       LEFT JOIN pandits p ON p.id = e.pandit_id
       LEFT JOIN users pu ON pu.id = p.user_id
       LEFT JOIN temples t ON t.id = e.temple_id
       LEFT JOIN services s ON s.id = e.service_id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, perPage, (page - 1) * perPage],
  );
  const countRows = await q(`SELECT COUNT(*)::int AS total FROM user_activity_events WHERE user_id = $1`, [userId]);

  const s = summaryRows.rows[0];
  return {
    summary: {
      totalSessions: s.total_sessions,
      panditProfilesViewed: s.pandit_profiles_viewed,
      chatClicks: s.chat_clicks,
      callClicks: s.call_clicks,
      qualifiedLeads: s.qualified_leads,
      inquiries: s.inquiries,
      reviews: s.reviews,
      aiInteractions: s.ai_interactions,
    },
    timeline: timelineRows.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      sourceSurface: r.source_surface,
      timestamp: r.created_at,
      pandit: r.pandit_slug ? { slug: r.pandit_slug, name: r.pandit_name } : null,
      temple: r.temple_name || null,
      service: r.service_name || null,
      location: { country: r.country, region: r.region, city: r.city, market: r.market },
      qualifiedLeadId: r.qualified_lead_id,
      deviceType: r.device_type,
    })),
    total: countRows.rows[0].total,
  };
}

module.exports = { list, listAdmins, getById, update, setStatus, revokeAllSessions, softDelete, activity };
