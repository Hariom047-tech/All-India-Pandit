/**
 * The distribution engine — orchestrator.
 *
 * Ties the pure scoring (fairness.js), the pure rotation (rotation.js) and the
 * database reads (distribution.repository.js) into one call the pandit listing
 * can use.
 *
 * Flow, in the order it must happen:
 *
 *   market → eligibility gates → plan bucket → fairness ranking
 *          → session-stable rotation → page → record exposure
 *
 * The ordering is not incidental. Eligibility runs BEFORE scoring, so no score
 * can surface an unverified or market-ineligible pandit. Bucket selection runs
 * before ranking, so fairness is computed inside one comparable pool rather
 * than across plans that are not comparable.
 */

const { rankPool, eligibilityFailure, positionWeight, DEFAULTS } = require('./fairness');
const {
  selectBucket, sessionSeed, rotationSeed, clampRefreshGeneration, selectOrder, selectPage,
  DEFAULT_ALLOCATION, POOL_MODE, computeBlockQuotas, interleaveByQuota,
} = require('./rotation');
const repo = require('../../repositories/distribution.repository');

/**
 * Maps the subscription_tier enum onto the plan names the allocation config
 * uses. Kept in one place: the tiers are a legacy enum
 * (free/silver/gold/diamond) and the product names are what the business talks
 * about, so translating at every call site would guarantee they drift.
 */
const TIER_TO_PLAN = {
  silver: 'bharat',
  gold: 'global',
  diamond: 'international',
};

/** Config keys are snake_case in the DB and camelCase in the pure engine. */
function toEngineConfig(dbConfig = {}) {
  const map = {
    window_days: 'windowDays',
    fairness_strength: 'fairnessStrength',
    quality_weight: 'qualityWeight',
    lead_deficit_weight: 'leadDeficitWeight',
    exposure_deficit_weight: 'exposureDeficitWeight',
    max_share_multiplier: 'maxShareMultiplier',
    cold_start_days: 'coldStartDays',
    cold_start_boost: 'coldStartBoost',
    cold_start_max_exposure: 'coldStartMaxExposure',
    rotation_noise: 'rotationNoise',
    min_profile_completeness: 'minProfileCompleteness',
  };
  const out = {};
  for (const [dbKey, engineKey] of Object.entries(map)) {
    if (dbConfig[dbKey] !== undefined) out[engineKey] = dbConfig[dbKey];
  }
  return out;
}

/**
 * Priority order per plan, for PRIORITY mode.
 *
 * Flattened across markets: a plan's priority is a property of the plan, not of
 * the market it is being served in. If the same plan ever needs different
 * priorities per market this must become market-keyed — the entitlement table
 * already stores it per row, so only this function would change.
 */
function toPriorities(entitlements = {}) {
  const out = {};
  for (const tiers of Object.values(entitlements)) {
    for (const [tier, e] of Object.entries(tiers)) {
      const plan = TIER_TO_PLAN[tier];
      if (plan && e.priority != null) out[plan] = Math.min(out[plan] ?? Infinity, e.priority);
    }
  }
  return out;
}

/** Allocation weights from the DB, falling back to the documented defaults. */
function toAllocation(entitlements = {}) {
  const out = {};
  for (const [market, tiers] of Object.entries(entitlements)) {
    out[market] = {};
    for (const [tier, e] of Object.entries(tiers)) {
      const plan = TIER_TO_PLAN[tier];
      if (plan) out[market][plan] = e.weight;
    }
  }
  return Object.keys(out).length ? out : DEFAULT_ALLOCATION;
}

/**
 * Attach each pandit's OWN tier's daily cap (from plan_market_entitlements)
 * before scoring.
 *
 * fairness.js's DEFAULTS.dailyLeadCap is a single global number — silver,
 * gold and diamond are seeded at 5, 5 and 3 respectively, and an admin can
 * edit any one of them independently via /distribution/entitlements. Without
 * this, every pandit is scored against the same hardcoded 5 regardless of
 * their plan, and an admin's per-tier change has no effect on ranking.
 *
 * A pandit whose tier has no entitlement row for this market (should not
 * happen — eligibilityFailure already excluded them — but this stays
 * defensive) is left untouched, so scorePandit falls back to cfg.dailyLeadCap.
 */
function attachDailyCaps(pool, entitlements = {}, market) {
  return pool.map((p) => {
    const dailyLeadCap = entitlements[market]?.[p.tier]?.dailyCap;
    return Number.isFinite(dailyLeadCap) ? { ...p, dailyLeadCap } : p;
  });
}

/**
 * Rank and page the pandits for one search.
 *
 * @param {object} opts
 * @param {string} opts.market       INDIA | INTERNATIONAL | UNKNOWN
 * @param {string} [opts.templeId]
 * @param {string} [opts.serviceId]
 * @param {string} [opts.sessionKey] stable per visitor
 * @param {number} [opts.pageSize]
 * @param {boolean} [opts.record]    write exposure rows (false for previews)
 * @param {number} [opts.refreshGeneration] client-reported reload count for
 *        this session — presentation input only, clamped server-side (see
 *        rotation.js's clampRefreshGeneration). 0 (the default) reproduces
 *        exactly the pre-refresh-rotation ordering.
 */
async function distribute({
  market,
  templeId = null,
  serviceId = null,
  sessionKey = null,
  pageSize = 20,
  page = 1,
  record = true,
  now = Date.now(),
  refreshGeneration = 0,
}) {
  const [dbConfig, entitlements] = await Promise.all([repo.getConfig(), repo.getEntitlements()]);
  const config = { ...DEFAULTS, ...toEngineConfig(dbConfig) };
  const allocation = toAllocation(entitlements);

  /*
   * UNKNOWN market.
   *
   * We do not guess which real market this visitor is in. But "unknown" is no
   * longer "unrestricted" — see fairness.js's isEligibleInEveryMarket() for
   * the policy (a conservative intersection: only a plan entitled in every
   * real market is safe to show someone we cannot place in any one of them).
   * Fairness counters are still read against INDIA (the larger pool, and the
   * more likely truth for this platform), and NO exposure is recorded —
   * charging an impression against a market we could not determine would
   * corrupt exactly the counter that decides who gets shown next.
   */
  const isUnknown = !market || market === 'UNKNOWN';
  const counterMarket = isUnknown ? 'INDIA' : market;

  const candidates = await repo.fetchCandidates({
    templeId, serviceId, market: counterMarket, windowDays: config.windowDays,
  });

  // Hard gates. ctx.market carries the TRUE resolution (possibly 'UNKNOWN')
  // so eligibilityFailure applies the intersection policy itself rather than
  // this caller pre-deciding who counts as entitled.
  const eligible = candidates.filter((p) => !eligibilityFailure(
    p, { market: isUnknown ? 'UNKNOWN' : market, templeId, serviceId }, config,
  ));

  if (!eligible.length) {
    return { pandits: [], pool: null, market: counterMarket, eligible: 0, total: candidates.length };
  }

  // Which plan bucket(s) serve this request.
  const availableByPlan = {};
  for (const p of eligible) {
    const plan = TIER_TO_PLAN[p.tier];
    if (plan) availableByPlan[plan] = (availableByPlan[plan] || 0) + 1;
  }
  const seed = sessionSeed({ sessionKey, templeId, serviceId, now });
  const generation = clampRefreshGeneration(refreshGeneration);
  const rotSeed = rotationSeed({ sessionKey, templeId, serviceId, now, refreshGeneration: generation });
  const rotationDepth = dbConfig.rotation_depth || 3;
  const mode = Number(dbConfig.pool_mode ?? POOL_MODE.WEIGHTED);
  // Generation 0 (a first load) keeps the existing anti-starvation guarantee —
  // the single most under-served candidate is genuinely first. Later
  // generations let that candidate rotate too, same as everyone else in the
  // band, which is what produces the slot-1 diversity a refresh is meant to
  // add without ever taking away the guarantee generation 0 gave.
  const pinTop = generation === 0;

  let bucket;
  let pool;
  let ranked; // full ranked/rotated order this page is sliced from
  let blend;  // { plan: weight } — set only in BLENDED mode, for meta

  if (mode === POOL_MODE.BLENDED) {
    /*
     * Mix the entitled plans WITHIN one page instead of picking one bucket
     * for the whole visitor session. Each plan is still ranked and rotated
     * on its own (fairness stays comparable-pool-only, same reasoning as the
     * single-bucket path below) — BLENDED only changes how those per-plan
     * orders are merged into one sequence, in blocks sized by allocation_weight
     * and ordered by priority_order (see rotation.js's interleaveByQuota).
     */
    bucket = null;
    pool = eligible;
    const weights = allocation[counterMarket] || {};
    blend = weights;
    // Quotas are computed on a small ROUND, not the whole page/pool — the
    // block size interleaveByQuota actually repeats at. A quota sized to the
    // full page (e.g. 40) would hand every plan ONE block each — gold's whole
    // share first, then silver's — which reads exactly like the old
    // one-bucket-per-session behavior on a single page and defeats the point
    // of blending. Repeating a small round throughout the page/pool is what
    // makes every plan visible without scrolling past a wall of the other one.
    const ROUND_SIZE = Math.min(10, dbConfig.page_size || pageSize);
    const quotas = computeBlockQuotas(weights, ROUND_SIZE);
    const priorities = toPriorities(entitlements);
    const tierOrders = {};
    for (const plan of Object.keys(availableByPlan)) {
      if (!(weights[plan] > 0)) continue; // weight 0 → never shown, same as WEIGHTED's bucket never drawing it
      const planPool = eligible.filter((p) => TIER_TO_PLAN[p.tier] === plan);
      if (!planPool.length) continue;
      const planWithCaps = attachDailyCaps(planPool, entitlements, counterMarket);
      const planRanked = rankPool(planWithCaps, { market: counterMarket, sessionKey, templeId, now }, config);
      // Each plan's FULL rotated order, not just one round's worth — the
      // round-robin in interleaveByQuota below draws ROUND_SIZE-shaped
      // chunks from it across as many rounds as it takes to cover pageSize.
      tierOrders[plan] = selectOrder(planRanked, {
        pageSize,
        rotationDepth,
        seed: rotSeed,
        pinTop,
      });
    }
    ranked = interleaveByQuota(tierOrders, quotas, priorities);
  } else {
    bucket = selectBucket({
      market: counterMarket,
      availableByPlan,
      sessionSeed: seed,
      allocation,
      mode,
      priorities: toPriorities(entitlements),
    });

    // Fairness is computed INSIDE the bucket — comparing a ₹5k pandit's share
    // against a ₹15k pandit's would be meaningless, they are sold different
    // things.
    pool = bucket
      ? eligible.filter((p) => TIER_TO_PLAN[p.tier] === bucket)
      : eligible;
    if (!pool.length) {
      return { pandits: [], pool: bucket, market: counterMarket, eligible: eligible.length, total: candidates.length };
    }
    const withCaps = attachDailyCaps(pool, entitlements, counterMarket);
    ranked = rankPool(withCaps, { market: counterMarket, sessionKey, templeId, now }, config);
  }

  if (!pool.length || !ranked.length) {
    return { pandits: [], pool: bucket, market: counterMarket, eligible: eligible.length, total: candidates.length };
  }

  // Position is GLOBAL, not per-page. A card at the top of page 2 is slot 21,
  // and must be credited slot-21 exposure weight — not slot 1's.
  const offset = (Math.max(1, page) - 1) * pageSize;

  // BLENDED already produced the final merged, rotated order above — slicing
  // it again through selectPage would re-shuffle across plans and destroy the
  // block ordering. The single-bucket path still needs selectPage to do its
  // own rotation-band selection before slicing.
  const slots = mode === POOL_MODE.BLENDED
    ? ranked.slice(offset, offset + pageSize)
    : selectPage(ranked, { pageSize, rotationDepth, seed: rotSeed, page, pinTop });

  const byId = new Map(pool.map((p) => [p.id, p]));
  const pandits = slots.map((slot, i) => {
    const p = byId.get(slot.panditId);
    return {
      ...p,
      position: offset + i + 1,
      // Internal — the caller strips these before the wire.
      _score: slot.score,
      _factors: slot.factors,
    };
  });

  /*
   * Record exposure for what was actually rendered.
   *
   * Deliberately NOT awaited: the devotee should not wait on an analytics write
   * to see the page. Errors are swallowed inside the repository.
   */
  if (record && !isUnknown && pandits.length) {
    void repo.recordExposure(pandits.map((p) => ({
      panditId: p.id,
      templeId,
      serviceId,
      market: counterMarket,
      position: p.position,
      positionWeight: Number(positionWeight(p.position).toFixed(3)),
      sessionKey,
    })));
  }

  return {
    pandits,
    pool: bucket,
    // Which plans and shares BLENDED mixed this page from — undefined in the
    // other modes, where "pool" (the single bucket) already says it all.
    ...(blend ? { blend } : {}),
    market: counterMarket,
    marketWasUnknown: isUnknown,
    eligible: eligible.length,
    total: candidates.length,
    // Size of the ranked pool this page was cut from — the honest total for
    // pagination, which is the bucket (or the blended merge) not every
    // candidate the query returned.
    poolSize: ranked.length,
    page: Math.max(1, page),
    poolMode: mode === POOL_MODE.PRIORITY
      ? 'priority' : mode === POOL_MODE.BLENDED ? 'blended' : 'weighted',
    refreshGeneration: generation,
  };
}

/** Strip internals before anything reaches a client. */
function toPublic(pandits) {
  return pandits.map(({ _score, _factors, qualifiedLeads, todayLeads, weightedExposure, ...rest }) => rest);
}

module.exports = {
  distribute, toPublic, TIER_TO_PLAN, toEngineConfig, toAllocation, toPriorities, attachDailyCaps,
};
