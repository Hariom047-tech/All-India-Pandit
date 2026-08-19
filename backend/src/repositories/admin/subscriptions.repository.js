async function listPlans(q) {
  const { rows } = await q('SELECT * FROM subscription_plans ORDER BY display_order');
  return rows;
}

/**
 * `features` is the plan's inclusion list — the bullet points a pandit sees
 * on the plan card ("Verified badge", "Priority listing", ...). Stored as a
 * JSON ARRAY, not an object: it is an ordered list for display, and the old
 * `|| {}` default silently produced `{}` which rendered as nothing.
 */
function normalizeFeatures(features) {
  if (Array.isArray(features)) {
    return features.map((f) => String(f).trim()).filter(Boolean).slice(0, 40);
  }
  // Tolerates the legacy object shape so existing seeded rows keep working.
  if (features && typeof features === 'object') {
    return Object.entries(features).filter(([, v]) => v).map(([k]) => k);
  }
  return [];
}

async function createPlan(q, p) {
  const { rows } = await q(
    `INSERT INTO subscription_plans
       (name, tier, price_monthly, price_quarterly, price_yearly, features,
        description, tagline, lead_credits_monthly,
        max_temple_listings, max_service_listings, max_photos,
        is_popular, display_order, is_active)
     VALUES ($1, $2::subscription_tier, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
     RETURNING *`,
    [p.name, p.tier, p.priceMonthly, p.priceQuarterly || null, p.priceYearly || null,
      JSON.stringify(normalizeFeatures(p.features)),
      p.description || null, p.tagline || null,
      p.leadCreditsMonthly ?? null,
      p.maxTempleListings ?? 1, p.maxServiceListings ?? 5, p.maxPhotos ?? 5,
      !!p.isPopular, p.displayOrder || 0],
  );
  return rows[0];
}

async function updatePlan(q, id, fields) {
  // `tier` is deliberately NOT updatable: it is the join key the pandits
  // table, the ranking function and the fairness engine all key off, and
  // silently repointing it would rewrite history for every subscriber.
  const { rows } = await q(
    `UPDATE subscription_plans SET
       name                 = COALESCE($2, name),
       price_monthly        = COALESCE($3, price_monthly),
       price_quarterly      = COALESCE($4, price_quarterly),
       price_yearly         = COALESCE($5, price_yearly),
       features             = COALESCE($6::jsonb, features),
       description          = COALESCE($7, description),
       tagline              = COALESCE($8, tagline),
       lead_credits_monthly = COALESCE($9, lead_credits_monthly),
       max_temple_listings  = COALESCE($10, max_temple_listings),
       max_service_listings = COALESCE($11, max_service_listings),
       max_photos           = COALESCE($12, max_photos),
       is_popular           = COALESCE($13, is_popular),
       display_order        = COALESCE($14, display_order),
       is_active            = COALESCE($15, is_active)
     WHERE id = $1 RETURNING *`,
    [id, fields.name, fields.priceMonthly, fields.priceQuarterly, fields.priceYearly,
      fields.features === undefined ? null : JSON.stringify(normalizeFeatures(fields.features)),
      fields.description, fields.tagline, fields.leadCreditsMonthly,
      fields.maxTempleListings, fields.maxServiceListings, fields.maxPhotos,
      fields.isPopular, fields.displayOrder, fields.isActive],
  );
  return rows[0] || null;
}

async function listSubscriptions(q, { tier, activeOnly, page, perPage }) {
  const where = [];
  const params = [];
  if (tier) { params.push(tier); where.push(`sp.tier = $${params.length}`); }
  if (activeOnly === 'true') where.push('ps.is_active = TRUE');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT ps.id, p.slug AS pandit_slug, u.full_name AS pandit_name, sp.name AS plan, ps.billing_cycle,
            ps.starts_at, ps.expires_at, ps.is_active
     FROM pandit_subscriptions ps
     JOIN pandits p ON p.id = ps.pandit_id JOIN users u ON u.id = p.user_id
     JOIN subscription_plans sp ON sp.id = ps.plan_id
     ${whereSql} ORDER BY ps.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM pandit_subscriptions ps JOIN subscription_plans sp ON sp.id = ps.plan_id ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function grantSubscription(q, panditId, tier, durationDays) {
  const plan = await q('SELECT id FROM subscription_plans WHERE tier = $1', [tier]);
  if (!plan.rows[0]) return null;
  const { rows } = await q(
    `INSERT INTO pandit_subscriptions (pandit_id, plan_id, billing_cycle, starts_at, expires_at, is_active)
     VALUES ($1, $2, 'manual', NOW(), NOW() + ($3 || ' days')::interval, TRUE) RETURNING id, expires_at`,
    [panditId, plan.rows[0].id, durationDays || 30],
  );
  await q('UPDATE pandits SET current_tier = $2, subscription_expires_at = $3 WHERE id = $1', [panditId, tier, rows[0].expires_at]);
  await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [panditId]);
  return rows[0];
}

async function listPayments(q, { status, gateway, page, perPage }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`pt.status = $${params.length}`); }
  if (gateway) { params.push(gateway); where.push(`pt.gateway = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT pt.id, p.slug AS pandit_slug, u.full_name AS pandit_name, pt.amount, pt.currency, pt.status,
            pt.gateway, pt.invoice_number, pt.paid_at, pt.created_at
     FROM payment_transactions pt JOIN pandits p ON p.id = pt.pandit_id JOIN users u ON u.id = p.user_id
     ${whereSql} ORDER BY pt.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM payment_transactions pt ${whereSql}`, params.slice(0, params.length - 2));
  return { data: rows, total: countRows[0].total };
}

async function getPayment(q, id) {
  const { rows } = await q('SELECT * FROM payment_transactions WHERE id = $1', [id]);
  return rows[0] || null;
}

async function refund(q, id, amount, reason) {
  const { rows } = await q(
    `UPDATE payment_transactions SET status = 'refunded', refunded_at = NOW(), refund_amount = $2, description = COALESCE(description, '') || $3
     WHERE id = $1 AND status = 'completed' RETURNING *`,
    [id, amount, reason ? ` | refund reason: ${reason}` : ''],
  );
  return rows[0] || null;
}

async function revenueOverview(q) {
  const today = (await q(`SELECT COALESCE(SUM(amount),0)::numeric AS c FROM payment_transactions WHERE status='completed' AND paid_at >= CURRENT_DATE`)).rows[0].c;
  const month = (await q(`SELECT COALESCE(SUM(amount),0)::numeric AS c FROM payment_transactions WHERE status='completed' AND paid_at >= date_trunc('month', CURRENT_DATE)`)).rows[0].c;
  const year = (await q(`SELECT COALESCE(SUM(amount),0)::numeric AS c FROM payment_transactions WHERE status='completed' AND paid_at >= date_trunc('year', CURRENT_DATE)`)).rows[0].c;
  const byTier = (await q(
    `SELECT sp.tier, COALESCE(SUM(pt.amount), 0)::numeric AS revenue
     FROM payment_transactions pt JOIN subscription_plans sp ON sp.id = pt.plan_id
     WHERE pt.status = 'completed' GROUP BY sp.tier`,
  )).rows;
  const activeSubscriptions = (await q(`SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE is_active = TRUE AND expires_at > NOW()`)).rows[0].c;
  const expiringThisWeek = (await q(`SELECT COUNT(*)::int AS c FROM pandit_subscriptions WHERE is_active = TRUE AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`)).rows[0].c;
  return { today, month, year, byTier, activeSubscriptions, expiringThisWeek };
}

module.exports = {
  listPlans, createPlan, updatePlan, listSubscriptions, grantSubscription,
  listPayments, getPayment, refund, revenueOverview,
};
