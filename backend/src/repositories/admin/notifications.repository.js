async function send(q, userId, { type, title, body, actionUrl }) {
  const { rows } = await q(
    `INSERT INTO notifications (user_id, type, title, body, action_url) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, type, title, body, actionUrl || null],
  );
  return rows[0].id;
}

async function broadcast(q, { type, title, body, targetRole, targetCity, targetState }) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (targetRole && targetRole !== 'all') { params.push(targetRole); where.push(`role = $${params.length}`); }
  if (targetCity) { params.push(targetCity); where.push(`city = $${params.length}`); }
  if (targetState) { params.push(targetState); where.push(`state = $${params.length}`); }

  params.push(type, title, body);
  const { rows } = await q(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT id, $${params.length - 2}, $${params.length - 1}, $${params.length} FROM users WHERE ${where.join(' AND ')}
     RETURNING id`,
    params,
  );
  return rows.length;
}

async function history(q, { page, perPage }) {
  const { rows } = await q(
    'SELECT id, user_id, type, title, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [perPage, (page - 1) * perPage],
  );
  const { rows: countRows } = await q('SELECT COUNT(*)::int AS total FROM notifications');
  return { data: rows, total: countRows[0].total };
}

module.exports = { send, broadcast, history };
