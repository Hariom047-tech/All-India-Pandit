/**
 * Admin reads and writes for the distribution engine.
 *
 * Kept separate from distribution.repository.js on purpose. That file is on the
 * REQUEST path — every listing calls it, and it swallows errors so a database
 * hiccup degrades the ranking rather than blanking the page. This file is on
 * the ADMIN path, where the opposite is right: a failed save must be loud, and
 * a silently-ignored setting is the worst possible outcome.
 *
 * Writes go through the SECURITY DEFINER functions from migration 18, not
 * direct UPDATEs, because migration 17 deliberately left these tables
 * non-writable to the application role.
 */

const { query } = require('../config/db');

/** Every knob, with the bounds the UI should render and the setter enforces. */
async function getConfigWithBounds(q = query) {
  const { rows } = await q(`SELECT * FROM distribution_config ORDER BY key`);
  return rows.map((r) => ({
    key: r.key,
    value: Number(r.value),
    label: r.label || r.key,
    description: r.description,
    min: r.min_value == null ? null : Number(r.min_value),
    max: r.max_value == null ? null : Number(r.max_value),
    step: r.step == null ? 0.01 : Number(r.step),
    updatedAt: r.updated_at,
  }));
}

/** Entitlements as rows, for the admin grid. */
async function getEntitlementRows(q = query) {
  const { rows } = await q(
    `SELECT tier::text, market::text, allocation_weight, daily_lead_cap,
            priority_order, seat_cap, plan_price_inr, is_active, updated_at
       FROM plan_market_entitlements
      ORDER BY priority_order, tier, market`);
  return rows.map((r) => ({
    tier: r.tier,
    market: r.market,
    weight: Number(r.allocation_weight),
    dailyCap: Number(r.daily_lead_cap),
    priority: r.priority_order == null ? null : Number(r.priority_order),
    seatCap: r.seat_cap == null ? null : Number(r.seat_cap),
    priceInr: r.plan_price_inr == null ? null : Number(r.plan_price_inr),
    isActive: r.is_active,
    updatedAt: r.updated_at,
  }));
}

/**
 * How many pandits actually hold each tier right now.
 *
 * Counts real, live subscriptions — not seat caps. The gap between the two is
 * the whole point: it tells the admin whether a plan is undersold (room to
 * sell) or oversold (stop selling, but keep serving everyone who paid).
 */
async function getSeatUsage(q = query) {
  const { rows } = await q(
    `SELECT p.current_tier::text AS tier, COUNT(*)::int AS held
       FROM pandits p
       JOIN users u ON u.id = p.user_id
      WHERE p.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.status = 'active'
        AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at > NOW())
      GROUP BY p.current_tier`);
  const out = {};
  for (const r of rows) out[r.tier] = Number(r.held);
  return out;
}

/**
 * Observed qualified-lead volume per market over a window.
 *
 * Used as the default input to the projection, so the ₹/lead figures reflect
 * THIS platform's traffic rather than a made-up number. When there is no
 * history yet the caller supplies its own estimate — better an explicit
 * assumption the admin can change than a confident-looking zero.
 */
async function getMarketVolumes(windowDays = 30, q = query) {
  const { rows } = await q(
    `SELECT market::text, COUNT(*)::int AS n
       FROM qualified_leads
      WHERE market IS NOT NULL
        AND created_at > NOW() - ($1 || ' days')::interval
      GROUP BY market`,
    [String(windowDays)]);
  const out = { INDIA: 0, INTERNATIONAL: 0 };
  for (const r of rows) out[r.market] = Number(r.n);
  return out;
}

/** Recent changes, so a disputed share can be traced to a decision. */
async function getAuditLog(limit = 50, q = query) {
  const { rows } = await q(
    `SELECT a.scope, a.target, a.old_value, a.new_value, a.changed_at,
            u.full_name AS changed_by
       FROM distribution_config_audit a
       LEFT JOIN users u ON u.id = a.changed_by
      ORDER BY a.changed_at DESC
      LIMIT $1`, [Math.min(200, Math.max(1, limit))]);
  return rows.map((r) => ({
    scope: r.scope,
    target: r.target,
    from: r.old_value,
    to: r.new_value,
    by: r.changed_by || 'system',
    at: r.changed_at,
  }));
}

/**
 * Save one config key.
 *
 * Bounds are checked by the database function, not here. Duplicating them in
 * JavaScript would mean two sources of truth that drift — and the one that
 * matters is the one closest to the data.
 */
async function setConfig(key, value, adminId, q = query) {
  const { rows } = await q(
    `SELECT * FROM set_distribution_config($1, $2, $3)`, [key, value, adminId]);
  return rows[0];
}

async function setEntitlement(e, adminId, q = query) {
  const { rows } = await q(
    `SELECT * FROM set_plan_entitlement($1::subscription_tier, $2::lead_market,
                                        $3, $4, $5, $6, $7, $8, $9)`,
    [e.tier, e.market, e.weight, e.dailyCap, e.priority,
      e.seatCap ?? null, e.priceInr ?? null, e.isActive !== false, adminId]);
  return rows[0];
}

module.exports = {
  getConfigWithBounds,
  getEntitlementRows,
  getSeatUsage,
  getMarketVolumes,
  getAuditLog,
  setConfig,
  setEntitlement,
};
