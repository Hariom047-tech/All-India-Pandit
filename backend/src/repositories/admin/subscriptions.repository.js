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

/**
 * Manual complimentary/override grant. Deactivates any other active
 * subscription first (same "one active entitlement" rule as a real
 * purchase — see activateSubscription in payments.repository.js), then
 * routes the actual current_tier/subscription_expires_at write through
 * activate_pandit_subscription() (migration 29) instead of a plain UPDATE.
 *
 * This isn't just consistency for its own sake: that SECURITY DEFINER
 * function also sets app.allow_seat_overflow for its own transaction —
 * exactly the "admin has a genuine reason to oversell" escape hatch
 * trg_enforce_seat_cap's own comment describes (migration 19). Before this,
 * an admin grant to a tier that's already at its seat cap would simply fail
 * with 'seat_cap_reached', with no way to deliberately override short of
 * hand-written SQL — this is that override's actual caller.
 */
async function grantSubscription(q, panditId, tier, durationDays) {
  const plan = await q('SELECT id FROM subscription_plans WHERE tier = $1', [tier]);
  if (!plan.rows[0]) return null;
  const { rows } = await q(
    `INSERT INTO pandit_subscriptions (pandit_id, plan_id, billing_cycle, starts_at, expires_at, is_active)
     VALUES ($1, $2, 'manual', NOW(), NOW() + ($3 || ' days')::interval, TRUE) RETURNING id, expires_at`,
    [panditId, plan.rows[0].id, durationDays || 30],
  );
  await q(
    `UPDATE pandit_subscriptions SET is_active = FALSE WHERE pandit_id = $1 AND id <> $2 AND is_active = TRUE`,
    [panditId, rows[0].id],
  );
  await q('SELECT activate_pandit_subscription($1, $2::subscription_tier, $3)', [panditId, tier, rows[0].expires_at]);
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

async function refund(q, id, amount, reason, gatewayRefundId) {
  const { rows } = await q(
    `UPDATE payment_transactions
        SET status = 'refunded', refunded_at = NOW(), refund_amount = $2,
            gateway_refund_id = COALESCE($4, gateway_refund_id),
            description = COALESCE(description, '') || $3
      WHERE id = $1 AND status = 'completed' RETURNING *`,
    [id, amount, reason ? ` | refund reason: ${reason}` : '', gatewayRefundId || null],
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

  // Live headcount per tier — "how many pandits are ON silver/gold/diamond
  // right now", distinct from byTier's all-time PAYMENT revenue above (a
  // pandit who paid twice counts once here, twice there — different questions).
  const subscribersByTier = (await q(
    `SELECT current_tier AS tier, COUNT(*)::int AS count
       FROM pandits WHERE deleted_at IS NULL AND current_tier <> 'free'
      GROUP BY current_tier`,
  )).rows;

  return { today, month, year, byTier, activeSubscriptions, expiringThisWeek, subscribersByTier };
}

/**
 * Renewal / retention report — for every pandit who has ever purchased a
 * plan, how many times they purchased and whether they're currently
 * covered. "Renewed" deliberately includes a plan CHANGE (silver -> gold is
 * still the pandit coming back to buy again), not just a same-tier repeat —
 * matching how the admin actually thinks about "did this pandit return".
 */
async function renewalSummary(q) {
  const { rows } = await q(`
    WITH per_pandit AS (
      SELECT ps.pandit_id, COUNT(*)::int AS purchase_count,
             BOOL_OR(ps.is_active AND ps.expires_at > NOW()) AS has_active_now
        FROM pandit_subscriptions ps
       GROUP BY ps.pandit_id
    )
    SELECT
      COUNT(*) FILTER (WHERE purchase_count >= 2)::int AS renewed_count,
      COUNT(*) FILTER (WHERE purchase_count = 1 AND has_active_now)::int AS one_time_active_count,
      COUNT(*) FILTER (WHERE purchase_count = 1 AND NOT has_active_now)::int AS churned_count,
      COUNT(*)::int AS total_count
    FROM per_pandit
  `);
  return rows[0];
}

async function renewals(q, { status, page = 1, perPage = 25 } = {}) {
  const statusExpr = `CASE WHEN pp.purchase_count >= 2 THEN 'renewed'
                           WHEN pp.has_active_now THEN 'one_time_active'
                           ELSE 'churned' END`;
  const params = status ? [perPage, (page - 1) * perPage, status] : [perPage, (page - 1) * perPage];

  const { rows } = await q(`
    WITH per_pandit AS (
      SELECT ps.pandit_id, COUNT(*)::int AS purchase_count,
             MIN(ps.created_at) AS first_purchase_at,
             MAX(ps.created_at) AS last_purchase_at,
             (ARRAY_AGG(sp.tier ORDER BY ps.created_at ASC))[1] AS first_tier,
             (ARRAY_AGG(sp.tier ORDER BY ps.created_at DESC))[1] AS latest_tier,
             BOOL_OR(ps.is_active AND ps.expires_at > NOW()) AS has_active_now
        FROM pandit_subscriptions ps
        JOIN subscription_plans sp ON sp.id = ps.plan_id
       GROUP BY ps.pandit_id
    )
    SELECT p.slug, u.full_name, pp.purchase_count, pp.first_tier, pp.latest_tier,
           pp.first_purchase_at, pp.last_purchase_at, pp.has_active_now,
           ${statusExpr} AS renewal_status
      FROM per_pandit pp
      JOIN pandits p ON p.id = pp.pandit_id
      JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL ${status ? `AND ${statusExpr} = $3` : ''}
     ORDER BY pp.last_purchase_at DESC
     LIMIT $1 OFFSET $2
  `, params);

  const { rows: countRows } = await q(`
    WITH per_pandit AS (
      SELECT ps.pandit_id, COUNT(*)::int AS purchase_count,
             BOOL_OR(ps.is_active AND ps.expires_at > NOW()) AS has_active_now
        FROM pandit_subscriptions ps GROUP BY ps.pandit_id
    )
    SELECT COUNT(*)::int AS total
      FROM per_pandit pp JOIN pandits p ON p.id = pp.pandit_id
     WHERE p.deleted_at IS NULL ${status ? `AND ${statusExpr} = $1` : ''}
  `, status ? [status] : []);

  return { data: rows, total: countRows[0].total };
}

module.exports = {
  listPlans, createPlan, updatePlan, listSubscriptions, grantSubscription,
  listPayments, getPayment, refund, revenueOverview, renewalSummary, renewals,
};
