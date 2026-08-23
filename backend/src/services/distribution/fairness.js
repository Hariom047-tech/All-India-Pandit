/**
 * Lead Distribution — the fairness engine.
 *
 * PURE. No database, no clock, no randomness that is not seeded. Every input
 * arrives as an argument, which is what makes it possible to simulate 500
 * pandits over 10,000 searches and actually measure whether the distribution is
 * fair — see scripts/simulate-distribution.js.
 *
 * The rule this exists to enforce:
 *
 *   Fair OPPORTUNITY, not equal leads.
 *
 * We cannot promise equal leads, because the devotee chooses. Two pandits given
 * identical exposure will not receive identical contacts if one has 100 reviews
 * and a video and the other has an empty profile. What we can promise, and must
 * measure, is that within one comparable pool every pandit gets a comparable
 * share of the chances.
 *
 * Two counters, not one — this is the core insight:
 *
 *   weightedExposure   how much VISIBILITY they were given (position-weighted)
 *   qualifiedLeads     how many verified devotees actually made contact
 *
 * Ranking on leads alone is unfair to a pandit who has been shown 500 times and
 * converted nobody: they look "under-served" and get boosted forever, when in
 * fact they have had every chance. Ranking on exposure alone ignores the thing
 * the pandit is actually paying for. Both are needed.
 */

/* ── configuration ────────────────────────────────────────────────────── */

/**
 * Defaults. Every one of these is meant to live in the database and be tunable
 * from the admin panel — hard-coding a marketplace's balance means a deploy
 * every time the mix changes.
 */
const DEFAULTS = {
  // Rolling window. Lifetime totals would punish a pandit for an old good month
  // forever; a window lets the system forgive.
  windowDays: 14,

  // How hard fairness pushes. 0 = pure quality ranking (winner takes all),
  // 1 = pure fairness (a bad profile can top the page).
  fairnessStrength: 0.75,
  qualityWeight: 0.25,

  // Split of the fairness push between the two counters. Exposure is weighted
  // higher because it is what we actually control — leads are the devotee's
  // decision, and over-correcting on them punishes low conversion twice.
  leadDeficitWeight: 0.55,
  exposureDeficitWeight: 0.45,

  // A pandit taking more than this multiple of their fair share is throttled.
  maxShareMultiplier: 3,

  // Hard stop per pandit per day, per market. Prevents one pandit absorbing a
  // traffic spike.
  dailyLeadCap: 5,

  // New pandits start with zero of everything, so a pure deficit model would
  // rank them top forever until they caught up — flooding them. Bounded boost.
  coldStartDays: 7,
  coldStartBoost: 0.15,
  coldStartMaxExposure: 200,   // boost stops once they have had a real chance

  // Small deterministic jitter so identical scores do not always resolve the
  // same way. NOT the distribution mechanism — see rotation.js.
  rotationNoise: 0.02,

  // Below this, a pandit is not eligible for paid distribution at all.
  minProfileCompleteness: 0.5,
};

/**
 * Position weights. Slot 1 is worth far more than slot 10, so counting raw
 * impressions treats them as equal and quietly lets whoever sits at #1
 * accumulate real advantage while looking equally exposed.
 *
 * Roughly the shape of observed click-through decay on a list.
 */
function positionWeight(position) {
  if (!Number.isFinite(position) || position < 1) return 0;
  if (position > 40) return 0.05;
  return Math.max(0.05, 1 / (1 + 0.35 * (position - 1)));
}

/* ── helpers ──────────────────────────────────────────────────────────── */

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Deterministic 0..1 from a string. FNV-1a — fast, no dependency, and stable
 * across processes, which matters because two backend instances must produce
 * the same ordering for the same visitor.
 */
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Profile quality, 0..1.
 *
 * Deliberately NOT rating-driven. Rating measures how a pandit's past devotees
 * felt; completeness measures whether the next devotee has enough to decide on.
 * Ranking by rating alone is the "winner takes all" trap the whole engine
 * exists to avoid, so rating contributes only a quarter of this.
 */
function profileQuality(p) {
  const checks = [
    Boolean(p.photoUrl),
    Boolean(p.bio),
    Boolean(p.videoUrl),
    Array.isArray(p.specializations) && p.specializations.length > 0,
    Boolean(p.videoKycCompleted),
    num(p.experienceYears) > 0,
    Boolean(p.whatsapp || p.phone),
  ];
  const completeness = checks.filter(Boolean).length / checks.length;

  // Bayesian, so 5.0 from two reviews does not beat 4.8 from three hundred.
  const v = num(p.reviewCount);
  const adjusted = v > 0 ? (v * num(p.rating) + 20 * 4.3) / (v + 20) : 4.3;
  const ratingScore = clamp01((adjusted - 1) / 4);

  return { completeness, score: clamp01(0.75 * completeness + 0.25 * ratingScore) };
}

/* ── eligibility ──────────────────────────────────────────────────────── */

/**
 * Every real market a pandit's plan is entitled to. 'UNKNOWN' is never a
 * value in p.markets — it is never guessed at, only resolved.
 */
const REAL_MARKETS = ['INDIA', 'INTERNATIONAL'];

/**
 * Is this pandit's plan entitled in EVERY real market — today, INDIA and
 * INTERNATIONAL both?
 *
 * This is the UNKNOWN-market policy: we still never guess INDIA or
 * INTERNATIONAL for a visitor we could not resolve, but "show them everyone"
 * was never actually safe — a real international visitor whose country
 * lookup failed could be handed an India-only pandit's contact details, and
 * (going the other way) an India-only pandit could be exposed, and billed
 * leads, from a market their plan never covered. The conservative fallback
 * is the INTERSECTION: only a plan that would pass the gate in every real
 * market is safe to show when we do not know which one is true. Today that
 * is exactly the dual-market ("global"/gold) tier — silver (India-only) and
 * diamond (international-only) both fail this, correctly.
 */
function isEligibleInEveryMarket(p) {
  return Array.isArray(p.markets) && REAL_MARKETS.every((m) => p.markets.includes(m));
}

/**
 * Hard gates. Not weights — no score passes an ineligible pandit.
 *
 * Order matters for the returned reason: the FIRST failure is what an admin
 * needs to see, and "not verified" is more actionable than "profile 40% done".
 */
function eligibilityFailure(p, ctx, config = DEFAULTS) {
  if (p.isPaused) return 'paused';
  if (!p.isActive) return 'inactive';
  if (!p.isVerified) return 'unverified';
  if (!p.subscriptionActive) return 'subscription_expired';
  if (!p.isAvailable) return 'unavailable';
  if (!(p.whatsapp || p.phone)) return 'no_contact';

  // Market entitlement — the whole point of the plan ladder. A ₹5k Bharat
  // pandit is simply not in an international visitor's pool. For an
  // unresolved visitor, see isEligibleInEveryMarket() above — we still never
  // guess, we just no longer treat "unknown" as "unrestricted".
  const isUnknownVisitor = !ctx.market || ctx.market === 'UNKNOWN';
  const marketOk = isUnknownVisitor
    ? isEligibleInEveryMarket(p)
    : Array.isArray(p.markets) && p.markets.includes(ctx.market);
  if (!marketOk) return 'market_not_entitled';

  if (ctx.serviceId && !(p.services || []).includes(ctx.serviceId)) return 'service_not_offered';
  if (ctx.templeId && !(p.temples || []).includes(ctx.templeId)) return 'temple_not_served';

  const { completeness } = profileQuality(p);
  if (completeness < (config.minProfileCompleteness ?? DEFAULTS.minProfileCompleteness)) {
    return 'profile_incomplete';
  }
  return null;
}

/* ── the score ────────────────────────────────────────────────────────── */

/**
 * Score one pandit inside one pool.
 *
 * `pool` carries the totals for the comparable set — total leads and total
 * weighted exposure across everyone in the same temple + market + plan. Fair
 * share is 1/N of that, and the deficit is how far below it this pandit sits.
 *
 * @param {object} p        pandit row + their counters for THIS pool
 * @param {object} pool     { size, totalLeads, totalExposure }
 * @param {object} ctx      { market, sessionKey, templeId, now }
 * @param {object} config
 */
function scorePandit(p, pool, ctx, config = DEFAULTS) {
  const cfg = { ...DEFAULTS, ...config };
  const size = Math.max(1, pool.size);
  const fairShare = 1 / size;

  /* Lead deficit — positive means under-served. */
  const leads = num(p.qualifiedLeads);
  const actualLeadShare = pool.totalLeads > 0 ? leads / pool.totalLeads : fairShare;
  const leadDeficit = fairShare - actualLeadShare;

  /* Exposure deficit — the counter that makes this honest. A pandit shown 500
     times with no leads has NOT been under-served, whatever their lead count
     says, and this is what stops the engine boosting them forever. */
  const exposure = num(p.weightedExposure);
  const actualExposureShare = pool.totalExposure > 0 ? exposure / pool.totalExposure : fairShare;
  const exposureDeficit = fairShare - actualExposureShare;

  /* Normalised so the numbers mean the same thing whether the pool has 20
     pandits or 500. Without this, a big pool has tiny deficits and fairness
     silently stops working at scale. */
  const normLead = leadDeficit / fairShare;          // -1 .. +1 typically
  const normExposure = exposureDeficit / fairShare;

  const fairnessPush = cfg.fairnessStrength * (
    cfg.leadDeficitWeight * normLead
    + cfg.exposureDeficitWeight * normExposure
  );

  /* Over-service throttle. Someone at 3x their fair share is pushed down hard
     rather than merely ranked lower — a linear deficit alone is too gentle
     against a pandit who is genuinely running away with the pool. */
  const overServed = pool.totalLeads > 0 && actualLeadShare > fairShare * cfg.maxShareMultiplier;
  const overExposed = pool.totalExposure > 0
    && actualExposureShare > fairShare * cfg.maxShareMultiplier;
  const overPenalty = (overServed ? 0.35 : 0) + (overExposed ? 0.25 : 0);

  /* Daily cap — a hard exclusion, not a nudge. Expressed as a huge negative so
     a capped pandit sorts below every uncapped one regardless of quality.
     Per-pandit p.dailyLeadCap (from that tier's plan_market_entitlements row)
     wins when the caller supplied it; cfg.dailyLeadCap is only the fallback
     for when entitlements could not be loaded (pre-migration DB, DB outage). */
  const dailyCap = Number.isFinite(p.dailyLeadCap) ? p.dailyLeadCap : cfg.dailyLeadCap;
  const dailyCapped = num(p.todayLeads) >= dailyCap;

  /* Cold start, bounded twice: by days AND by exposure received. A new pandit
     needs a chance, not a flood — and once they have had 200 weighted
     impressions they have had their chance and compete normally. */
  const ageDays = p.joinedAt ? (ctx.now - new Date(p.joinedAt).getTime()) / 86_400_000 : 999;
  const isNew = ageDays <= cfg.coldStartDays && exposure < cfg.coldStartMaxExposure;
  const coldStart = isNew ? cfg.coldStartBoost : 0;

  const { score: quality } = profileQuality(p);

  /* Deterministic jitter. Seeded on the session so it is stable for a refresh
     but different between visitors — real randomness would reshuffle the page
     under someone's thumb. */
  const noise = cfg.rotationNoise * hash01(`${ctx.sessionKey || ''}:${p.id}`);

  const score = cfg.qualityWeight * quality
    + fairnessPush
    + coldStart
    - overPenalty
    + noise;

  return {
    panditId: p.id,
    score: dailyCapped ? score - 1000 : score,
    dailyCapped,
    factors: {
      quality,
      leadDeficit: normLead,
      exposureDeficit: normExposure,
      fairnessPush,
      coldStart,
      overPenalty,
      noise,
    },
  };
}

/**
 * Rank one pool.
 *
 * Returns EVERY pandit scored and sorted, not just the top N — the caller
 * decides how many to render, and the simulation needs the full ordering to
 * measure first-page share.
 */
function rankPool(pandits, ctx, config = DEFAULTS) {
  const pool = {
    size: pandits.length,
    totalLeads: pandits.reduce((a, p) => a + num(p.qualifiedLeads), 0),
    totalExposure: pandits.reduce((a, p) => a + num(p.weightedExposure), 0),
  };
  return pandits
    .map((p) => scorePandit(p, pool, ctx, config))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  DEFAULTS,
  positionWeight,
  profileQuality,
  eligibilityFailure,
  isEligibleInEveryMarket,
  REAL_MARKETS,
  scorePandit,
  rankPool,
  hash01,
};
