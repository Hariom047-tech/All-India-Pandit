/**
 * Admin control over the v2 distribution engine.
 *
 * Everything the engine reads is settable here: pool mode, allocation weights,
 * priority order, seat caps, daily caps and every fairness knob.
 *
 * The design principle throughout: NO SETTING SAVES WITHOUT SHOWING ITS
 * CONSEQUENCE. The panel's job is not to expose sliders, it is to stop the
 * plan ladder inverting again — which it did last time precisely because
 * percentages look reasonable while the leads-per-seat maths does not.
 */

const repo = require('../../repositories/distributionAdmin.repository');
const distRepo = require('../../repositories/distribution.repository');
const { project } = require('../../services/distribution/projection');
const { TIER_TO_PLAN } = require('../../services/distribution/engine');
const { POOL_MODE } = require('../../services/distribution/rotation');
const { logAdminAction } = require('../../utils/adminLog');

/** Default projection horizon when the platform has no lead history yet. */
const ASSUMED_MONTHLY = { INDIA: 10000, INTERNATIONAL: 3000 };

/**
 * GET /admin/distribution
 *
 * Everything the panel needs in one call: knobs with their bounds, the
 * entitlement grid, real seat usage, observed lead volume, and the projection
 * for the CURRENT settings.
 */
async function overview(req, res) {
  const q = req.db;
  const [config, entitlements, seats, observed, audit] = await Promise.all([
    repo.getConfigWithBounds(q),
    repo.getEntitlementRows(q),
    repo.getSeatUsage(q),
    repo.getMarketVolumes(30, q),
    repo.getAuditLog(25, q),
  ]);

  const mode = config.find((c) => c.key === 'pool_mode')?.value ?? POOL_MODE.WEIGHTED;

  /*
   * Which volumes to project against.
   *
   * Real observed traffic is always preferable, but a brand-new platform has
   * zero leads, and projecting ₹/lead against zero produces nothing useful.
   * Falling back to a stated assumption — and labelling it as one — lets the
   * admin reason about the ladder on day one rather than waiting a month.
   */
  const usingObserved = observed.INDIA + observed.INTERNATIONAL > 0;
  const volumes = usingObserved ? observed : ASSUMED_MONTHLY;

  res.json({
    config,
    entitlements,
    seats,
    volumes: {
      values: volumes,
      source: usingObserved ? 'observed_30d' : 'assumed',
      observed,
    },
    projection: project({
      entitlements: nest(entitlements),
      seats,
      volumes,
      mode,
      tierToPlan: TIER_TO_PLAN,
    }),
    audit,
  });
}

/**
 * POST /admin/distribution/preview
 *
 * "If I saved this, what would happen?" Changes nothing.
 *
 * The panel calls this on every edit so the ₹/lead table updates live. It is a
 * POST because the proposed settings are a body, not because it mutates —
 * nothing here touches the database.
 */
async function preview(req, res) {
  const q = req.db;
  const { entitlements, mode, volumes } = req.body || {};

  if (!Array.isArray(entitlements)) {
    return res.status(400).json({ error: 'entitlements[] is required' });
  }

  const seats = await repo.getSeatUsage(q);
  const observed = await repo.getMarketVolumes(30, q);
  const usingObserved = observed.INDIA + observed.INTERNATIONAL > 0;

  const vol = volumes && Number(volumes.INDIA) >= 0 && Number(volumes.INTERNATIONAL) >= 0
    ? { INDIA: Number(volumes.INDIA), INTERNATIONAL: Number(volumes.INTERNATIONAL) }
    : (usingObserved ? observed : ASSUMED_MONTHLY);

  res.json({
    projection: project({
      entitlements: nest(entitlements),
      seats,
      volumes: vol,
      mode: mode ?? POOL_MODE.WEIGHTED,
      tierToPlan: TIER_TO_PLAN,
    }),
    seats,
    volumes: { values: vol, source: usingObserved ? 'observed_30d' : 'assumed', observed },
  });
}

/**
 * PUT /admin/distribution/config
 *
 * Saves config keys. Partial by design — the panel sends only what changed, so
 * two admins editing different knobs do not overwrite each other.
 */
async function saveConfig(req, res) {
  const q = req.db;
  const updates = req.body?.updates;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates object is required' });
  }

  const results = [];
  for (const [key, raw] of Object.entries(updates)) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return res.status(400).json({ error: `${key}: value must be a number` });
    }
    try {
      results.push(await repo.setConfig(key, value, req.adminUser.id, q));
    } catch (err) {
      /*
       * Surface the database's own message. It names the key and the bound it
       * violated ("fairness_strength must be at most 1"), which is far more
       * useful than a generic 400 — and it proves the bound is enforced where
       * it matters rather than only in the form.
       */
      return res.status(400).json({ error: err.message, key });
    }
  }

  const changed = results.filter((r) => r.changed);
  if (changed.length) {
    await logAdminAction({
      adminUserId: req.adminUser.id,
      action: 'DISTRIBUTION_CONFIG_UPDATED',
      details: changed,
      ip: req.ip,
    });
  }
  res.json({ saved: results.length, changed: changed.length, results });
}

/**
 * PUT /admin/distribution/entitlements
 *
 * Saves the plan grid: weights, priority, seat caps, daily caps, prices.
 */
async function saveEntitlements(req, res) {
  const q = req.db;
  const rows = req.body?.entitlements;
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'entitlements[] is required' });
  }

  /*
   * Weights within a market should total 1.0.
   *
   * A warning, not a rejection. The engine normalises whatever it is given, so
   * 0.5/0.5/0.5 behaves identically to 0.33/0.33/0.33 — but an admin who typed
   * those numbers believes something different is happening, and that gap is
   * how settings drift from intent. Better to tell them than to silently fix it.
   */
  const byMarket = {};
  for (const r of rows) {
    if (r.isActive === false) continue;
    byMarket[r.market] = (byMarket[r.market] || 0) + (Number(r.weight) || 0);
  }
  const weightWarnings = Object.entries(byMarket)
    .filter(([, total]) => Math.abs(total - 1) > 0.001)
    .map(([market, total]) => ({
      level: 'warn',
      code: 'weights_not_normalised',
      message: `${market} weights total ${total.toFixed(2)}, not 1.00. The engine normalises them, so the effective split may not be what you typed.`,
    }));

  const saved = [];
  for (const r of rows) {
    if (!r.tier || !r.market) {
      return res.status(400).json({ error: 'each entitlement needs tier and market' });
    }
    try {
      saved.push(await repo.setEntitlement({
        tier: r.tier,
        market: r.market,
        weight: Number(r.weight) || 0,
        dailyCap: Math.max(0, parseInt(r.dailyCap, 10) || 0),
        priority: parseInt(r.priority, 10) || 100,
        seatCap: r.seatCap === null || r.seatCap === '' ? null : parseInt(r.seatCap, 10),
        priceInr: r.priceInr === null || r.priceInr === '' ? null : parseInt(r.priceInr, 10),
        isActive: r.isActive !== false,
      }, req.adminUser.id, q));
    } catch (err) {
      return res.status(400).json({ error: err.message, tier: r.tier, market: r.market });
    }
  }

  await logAdminAction({
    adminUserId: req.adminUser.id,
    action: 'DISTRIBUTION_ENTITLEMENTS_UPDATED',
    details: saved,
    ip: req.ip,
  });

  res.json({ saved: saved.length, warnings: weightWarnings });
}

/**
 * GET /admin/distribution/seats
 *
 * Seats held vs sold-out, per tier. Read by the panel so "47 seats left" is
 * visible at the moment of pricing, not discovered when a sale fails.
 */
async function seats(req, res) {
  const q = req.db;
  const { rows } = await q(
    `SELECT s.* FROM plan_market_entitlements e,
            LATERAL seat_usage(e.tier) s
      WHERE e.is_active
      GROUP BY s.tier, s.seat_cap, s.held, s.available`);
  res.json({
    seats: rows.map((r) => ({
      tier: r.tier,
      seatCap: r.seat_cap == null ? null : Number(r.seat_cap),
      held: Number(r.held),
      available: r.available == null ? null : Number(r.available),
      full: r.available != null && Number(r.available) === 0,
      // Over cap is possible and is NOT corrected — those pandits paid.
      oversold: r.seat_cap != null && Number(r.held) > Number(r.seat_cap),
    })),
  });
}

/**
 * GET /admin/distribution/pools
 *
 * What the engine is doing right now, per market and tier. The reality check
 * against the projection: if these disagree badly, the settings are not doing
 * what the panel claims.
 */
async function pools(req, res) {
  const windowDays = Math.min(180, Math.max(1, parseInt(req.query.windowDays, 10) || 14));
  const out = {};
  for (const market of ['INDIA', 'INTERNATIONAL']) {
    out[market] = await distRepo.poolStats({ market, windowDays });
  }
  res.json({ windowDays, pools: out });
}

/** entitlement rows → market → tier → {...}, the shape the projection wants. */
function nest(rows) {
  const out = {};
  for (const r of rows) {
    if (r.isActive === false) continue;
    out[r.market] = out[r.market] || {};
    out[r.market][r.tier] = {
      weight: Number(r.weight) || 0,
      priority: r.priority == null ? null : Number(r.priority),
      seatCap: r.seatCap == null ? null : Number(r.seatCap),
      priceInr: r.priceInr == null ? null : Number(r.priceInr),
    };
  }
  return out;
}

module.exports = { overview, preview, saveConfig, saveEntitlements, pools, seats };
