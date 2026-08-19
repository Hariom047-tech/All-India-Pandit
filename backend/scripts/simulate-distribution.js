#!/usr/bin/env node
/**
 * Lead-distribution simulator.
 *
 *   npm run sim:distribution
 *   npm run sim:distribution -- --visitors 20000 --india 0.75
 *   npm run sim:distribution -- --compare        (fair engine vs random vs rating)
 *
 * Runs the REAL engine against 500 synthetic pandits at Nalkheda — 200 Bharat,
 * 150 Global, 150 International — and measures whether distribution is actually
 * fair. No database and no network: the engine is pure, which is the entire
 * reason this can be verified before anything is deployed.
 *
 * What it measures:
 *   Gini      0 = perfectly equal, 1 = one pandit takes everything
 *   P90/P10   the ratio between a well-served and a poorly-served pandit
 *   Page-1    share of first-page slots, which is what actually converts
 *
 * The devotee's CHOICE is modelled too — better profiles convert better — so
 * this measures fair OPPORTUNITY, not a fantasy where everyone converts equally.
 */

const { rankPool, eligibilityFailure, positionWeight, DEFAULTS } = require('../src/services/distribution/fairness');
const { sessionSeed, selectPage, pickPlanBucket, DEFAULT_ALLOCATION, leadsPerSeat } = require('../src/services/distribution/rotation');

/* ── arguments ────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const VISITORS = arg('visitors', 10000);
const UNKNOWN_SHARE = arg('unknown', 0.05);  // country lookup failed / no signal
const INDIA_SHARE = arg('india', 0.77) * (1 - UNKNOWN_SHARE);
const PAGE_SIZE = arg('page', 20);
const COMPARE = argv.includes('--compare');
const REFRESH_SPAM_TRIALS = arg('refreshSpam', 100);

const TEMPLE = 'nalkheda';
const SERVICE = 'havan-yagna';

/* ── the 500 pandits ──────────────────────────────────────────────────── */

const PLANS = [
  { plan: 'bharat', seats: 200, markets: ['INDIA'], price: 5000 },
  { plan: 'global', seats: 150, markets: ['INDIA', 'INTERNATIONAL'], price: 9000 },
  { plan: 'international', seats: 150, markets: ['INTERNATIONAL'], price: 15000 },
];

/** Deterministic pseudo-random so runs are reproducible and comparable. */
function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// SIM_NOW anchors "how old is this pandit" for cold-start — must be a fixed
// point, not Date.now(), or a joinedAt computed relative to it would drift
// between runs and the simulation would stop being reproducible.
const SIM_NOW = Date.parse('2026-08-13T10:00:00Z');

/**
 * Section 34 (new-pandit simulation): the last 5% of each plan's seats
 * joined 2 days ago — inside the engine's coldStartDays window (default 7),
 * with zero history, same as a real freshly-verified pandit. Tracked
 * separately (p.isNewCohort) so the report can show whether they get a
 * bounded chance rather than being buried under pandits with months of
 * accumulated leads/exposure, or the opposite failure — dominating the pool.
 */
const NEW_COHORT_FRACTION = 0.05;

function buildPandits() {
  const rnd = mulberry(42);
  const out = [];
  let n = 0;
  for (const { plan, seats, markets } of PLANS) {
    const newCount = Math.max(1, Math.round(seats * NEW_COHORT_FRACTION));
    for (let i = 0; i < seats; i += 1) {
      n += 1;
      const isNewCohort = i >= seats - newCount;
      // A realistic spread of profile quality — most are decent, a few are
      // excellent, a few are thin. Uniformly perfect pandits would make any
      // engine look fair. A brand-new pandit hasn't had time to build up
      // reviews regardless of how good they are, so reviewCount is forced to
      // 0 for the new cohort independent of the quality roll.
      const q = rnd();
      out.push({
        id: `p${String(n).padStart(3, '0')}`,
        plan,
        markets,
        name: `Pandit ${n}`,
        isActive: true,
        isVerified: true,
        subscriptionActive: true,
        isAvailable: true,
        whatsapp: '9999999999',
        temples: [TEMPLE],
        services: [SERVICE],
        photoUrl: q > 0.1 ? 'x.jpg' : null,
        bio: q > 0.15 ? 'bio' : null,
        videoUrl: q > 0.6 ? 'v.mp4' : null,
        specializations: q > 0.2 ? ['Havan'] : [],
        videoKycCompleted: q > 0.3,
        experienceYears: isNewCohort ? 0 : Math.floor(2 + q * 28),
        rating: 3.5 + q * 1.5,
        reviewCount: isNewCohort ? 0 : Math.floor(q * q * 300),
        joinedAt: isNewCohort
          ? new Date(SIM_NOW - 2 * 86_400_000).toISOString()
          : '2025-01-01',
        isNewCohort,
        // live counters, per market — UNKNOWN visitors read/write INDIA's
        // counters, same convention engine.js uses (counterMarket).
        counters: {
          INDIA: { qualifiedLeads: 0, weightedExposure: 0, todayLeads: 0 },
          INTERNATIONAL: { qualifiedLeads: 0, weightedExposure: 0, todayLeads: 0 },
        },
        rawImpressions: 0,
        slot1Count: 0,
      });
    }
  }
  return out;
}

/**
 * Probability this devotee contacts this pandit at this position.
 *
 * Position decay × profile appeal. This is the modelled human choice, and it is
 * why equal leads can never be promised — a strong profile at slot 1 converts
 * several times better than a thin profile at slot 12.
 */
function contactProbability(p, position) {
  const posDecay = positionWeight(position);
  const appeal = 0.35
    + 0.30 * Math.min(1, (p.reviewCount || 0) / 150)
    + 0.20 * ((p.rating || 4) - 3.5) / 1.5
    + (p.videoUrl ? 0.15 : 0);
  return 0.02 * posDecay * appeal;
}

/* ── statistics ───────────────────────────────────────────────────────── */

function gini(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  const sum = v.reduce((a, b) => a + b, 0);
  if (!sum) return 0;
  let cum = 0;
  for (let i = 0; i < n; i += 1) cum += (2 * (i + 1) - n - 1) * v[i];
  return cum / (n * sum);
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

/** Every percentile the spec asks for, off one sorted array. */
function percentiles(sorted) {
  return {
    p10: quantile(sorted, 0.10), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.50),
    p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.90), p95: quantile(sorted, 0.95),
  };
}

function report(label, pandits, market, plan) {
  const all = pandits.filter((p) => p.plan === plan);
  if (!all.length) return null;

  /*
   * Split eligible from excluded BEFORE measuring.
   *
   * A pandit blocked by the profile-completeness floor has no photo, no bio and
   * no listed services — they are not being treated unfairly, they are not yet
   * sellable. Counting their zero alongside everyone else's leads makes the
   * engine look far less fair than it is, and hides the real signal.
   */
  const excluded = all.filter((p) => eligibilityFailure(p, { market, templeId: TEMPLE, serviceId: SERVICE }));
  const group = all.filter((p) => !eligibilityFailure(p, { market, templeId: TEMPLE, serviceId: SERVICE }));
  if (!group.length) return null;
  const leads = group.map((p) => p.counters[market].qualifiedLeads);
  const exposure = group.map((p) => p.counters[market].weightedExposure);
  const impressions = group.map((p) => p.rawImpressions || 0);
  const slot1 = group.map((p) => p.slot1Count || 0);
  const sorted = [...leads].sort((a, b) => a - b);
  const total = leads.reduce((a, b) => a + b, 0);
  const mean = total / group.length;

  // Section 26/74: fairness judged against EXPECTED (plan-weighted) share,
  // not naive 1/N — a bharat pandit and a global pandit were never sold the
  // same opportunity, so an unequal split between them is not automatically
  // unfair.
  const planWeight = (DEFAULT_ALLOCATION[market] || {})[plan] ?? (1 / PLANS.length);
  const totalExposureThisMarket = pandits
    .filter((p) => !eligibilityFailure(p, { market, templeId: TEMPLE, serviceId: SERVICE }))
    .reduce((a, p) => a + p.counters[market].weightedExposure, 0);
  const actualExposureShare = totalExposureThisMarket > 0
    ? exposure.reduce((a, b) => a + b, 0) / totalExposureThisMarket : 0;

  // Section 31/40: starvation — eligible for real traffic, near-zero
  // opportunity. Threshold is relative to the group's OWN mean so it scales
  // with pool size and traffic volume rather than a magic absolute count.
  const meanExposure = exposure.reduce((a, b) => a + b, 0) / group.length;
  const starved = group.filter((p, i) => exposure[i] < meanExposure * 0.1).length;

  const newCohort = group.filter((p) => p.isNewCohort);
  const newCohortLeads = newCohort.map((p) => p.counters[market].qualifiedLeads);
  const newCohortExposure = newCohort.map((p) => p.counters[market].weightedExposure);

  return {
    label, plan, market, seats: group.length, excluded: excluded.length,
    total, mean,
    min: sorted[0], max: sorted[sorted.length - 1],
    ...percentiles(sorted),
    leadGini: gini(leads),
    exposureGini: gini(exposure),
    impressionGini: gini(impressions),
    slot1Gini: gini(slot1),
    zeroLead: leads.filter((l) => l === 0).length,
    zeroExposure: exposure.filter((e) => e === 0).length,
    nearZeroExposure: starved,
    expectedShare: planWeight,
    actualShare: actualExposureShare,
    shareRatio: planWeight > 0 ? actualExposureShare / planWeight : null,
    newCohortCount: newCohort.length,
    newCohortMeanLeads: newCohort.length ? newCohortLeads.reduce((a, b) => a + b, 0) / newCohort.length : null,
    newCohortMeanExposure: newCohort.length ? newCohortExposure.reduce((a, b) => a + b, 0) / newCohort.length : null,
    newCohortZeroExposure: newCohortExposure.filter((e) => e === 0).length,
  };
}

/* ── the run ──────────────────────────────────────────────────────────── */

/** Visitor market mix: INDIA_SHARE / INTERNATIONAL / UNKNOWN_SHARE — args
 *  already net UNKNOWN out of INDIA_SHARE above, so these three sum to 1. */
function pickVisitorMarket(rnd) {
  const r = rnd();
  if (r < UNKNOWN_SHARE) return 'UNKNOWN';
  if (r < UNKNOWN_SHARE + INDIA_SHARE) return 'INDIA';
  return 'INTERNATIONAL';
}

function run({ mode = 'fair', visitors = VISITORS } = {}) {
  const pandits = buildPandits();
  const byId = new Map(pandits.map((p) => [p.id, p]));
  for (const p of pandits) { p.page1 = 0; p.rawImpressions = 0; p.slot1Count = 0; }

  const rnd = mulberry(7);
  const now = SIM_NOW;

  for (let v = 0; v < visitors; v += 1) {
    const market = pickVisitorMarket(rnd);
    // Same convention as engine.js: fairness counters for an UNKNOWN visitor
    // are read/written against INDIA (the larger, more likely pool) — but
    // ELIGIBILITY still uses the true 'UNKNOWN', which after Phase 2B means
    // only a dual-market (global) pandit can ever be selected for them.
    const isUnknown = market === 'UNKNOWN';
    const counterMarket = isUnknown ? 'INDIA' : market;
    const session = `sess-${v}`;
    // Spread visitors across the day so the hour bucket actually rotates.
    const t = now + Math.floor((v / visitors) * 30 * 86_400_000);

    const eligible = pandits.filter((p) => !eligibilityFailure(p, { market, templeId: TEMPLE, serviceId: SERVICE }));
    if (!eligible.length) continue;

    // Which plan bucket serves this request
    const availableByPlan = {};
    for (const p of eligible) availableByPlan[p.plan] = (availableByPlan[p.plan] || 0) + 1;
    const bucket = pickPlanBucket(counterMarket, availableByPlan, session, DEFAULT_ALLOCATION);
    const pool = eligible.filter((p) => p.plan === bucket);
    if (!pool.length) continue;

    // Counters for THIS market only — the whole point of separate pools
    const scored = pool.map((p) => ({ ...p, ...p.counters[counterMarket] }));

    let page;
    if (mode === 'random') {
      page = [...scored].sort(() => rnd() - 0.5).slice(0, PAGE_SIZE).map((p) => ({ panditId: p.id }));
    } else if (mode === 'rating') {
      page = [...scored].sort((a, b) => b.rating - a.rating).slice(0, PAGE_SIZE).map((p) => ({ panditId: p.id }));
    } else {
      const ranked = rankPool(scored, { market: counterMarket, sessionKey: session, templeId: TEMPLE, now: t });
      const seed = sessionSeed({ sessionKey: session, templeId: TEMPLE, serviceId: SERVICE, now: t });
      page = selectPage(ranked, { pageSize: PAGE_SIZE, rotationDepth: 3, seed });
    }

    // Render: record exposure, then model the devotee's choice. Exposure is
    // only ever recorded against a REAL market (isUnknown skips it) —
    // mirroring engine.js's `record && !isUnknown` rule: charging an
    // impression against a market we could not determine would corrupt the
    // very counter that decides who gets shown next.
    page.forEach((slot, idx) => {
      const p = byId.get(slot.panditId);
      if (!p) return;
      const position = idx + 1;
      p.rawImpressions += 1;
      if (position === 1) p.slot1Count += 1;
      if (isUnknown) return;

      p.counters[market].weightedExposure += positionWeight(position);
      p.page1 += 1;

      if (rnd() < contactProbability(p, position)) {
        p.counters[market].qualifiedLeads += 1;
      }
    });
  }
  return pandits;
}

/* ── output ───────────────────────────────────────────────────────────── */

function printTable(rows) {
  console.log(
    '  plan'.padEnd(17) + 'elig'.padStart(6) + 'leads'.padStart(8) + 'mean'.padStart(7)
    + 'min'.padStart(6) + 'max'.padStart(6) + 'p10'.padStart(6) + 'p50'.padStart(6) + 'p90'.padStart(6)
    + 'p90/p10'.padStart(9) + 'leadGini'.padStart(10) + '  zero  excl',
  );
  console.log('  ' + '-'.repeat(90));
  for (const r of rows.filter(Boolean)) {
    const ratio = r.p10 > 0 ? (r.p90 / r.p10).toFixed(2) : '∞';
    console.log(
      `  ${r.plan.padEnd(15)}${String(r.seats).padStart(6)}${String(r.total).padStart(8)}`
      + `${r.mean.toFixed(1).padStart(7)}${String(r.min).padStart(6)}${String(r.max).padStart(6)}`
      + `${String(r.p10).padStart(6)}${String(r.p50).padStart(6)}${String(r.p90).padStart(6)}${ratio.padStart(9)}`
      + `${r.leadGini.toFixed(3).padStart(10)}  ${String(r.zeroLead).padStart(4)}  ${String(r.excluded).padStart(4)}`,
    );
  }
}

/** Section 24/25/31/32/34/74: the metrics beyond the headline lead table —
 *  Gini per DISTINCT distribution, expected-vs-actual share, starvation,
 *  and the new-pandit cohort's outcome. Printed once, only for the fair
 *  engine (comparing random/rating on these axes adds no decision-relevant
 *  information — they have already lost on the lead table). */
function printExtendedMetrics(rows) {
  console.log(
    '  plan/market'.padEnd(24) + 'impressionGini'.padStart(15) + 'exposureGini'.padStart(14)
    + 'slot1Gini'.padStart(11) + 'leadGini'.padStart(10) + 'actual/expected'.padStart(17) + '  nearZeroExp',
  );
  console.log('  ' + '-'.repeat(100));
  for (const r of rows.filter(Boolean)) {
    const ratio = r.shareRatio === null ? 'n/a' : r.shareRatio.toFixed(2);
    console.log(
      `  ${`${r.plan}/${r.market}`.padEnd(22)}${r.impressionGini.toFixed(3).padStart(15)}`
      + `${r.exposureGini.toFixed(3).padStart(14)}${r.slot1Gini.toFixed(3).padStart(11)}`
      + `${r.leadGini.toFixed(3).padStart(10)}${ratio.padStart(17)}  ${String(r.nearZeroExposure).padStart(4)}`,
    );
  }
  console.log('\n  New-pandit cohort (joined 2 days ago, coldStartDays=7 — zero history):');
  for (const r of rows.filter(Boolean)) {
    if (!r.newCohortCount) continue;
    console.log(
      `    ${`${r.plan}/${r.market}`.padEnd(20)} ${r.newCohortCount} new pandits, `
      + `mean exposure ${r.newCohortMeanExposure.toFixed(1)}, mean leads ${r.newCohortMeanLeads.toFixed(2)}, `
      + `${r.newCohortZeroExposure} with ZERO exposure`,
    );
  }
}

/** Section 33: same visitor, same query, N refreshes. Verifies presentation
 *  can reshuffle within the session-hour band while exposure accounting —
 *  the counter that decides who gets shown next — cannot be inflated by
 *  spamming refresh. Mirrors distribution.test.js's rotation tests but at
 *  the full engine level, against the 500-pandit pool. */
function refreshSpamCheck() {
  const pandits = buildPandits();
  const byId = new Map(pandits.map((p) => [p.id, p]));
  const session = 'refresh-spam-victim';
  const t = SIM_NOW;
  const market = 'INDIA';

  const eligible = pandits.filter((p) => !eligibilityFailure(p, { market, templeId: TEMPLE, serviceId: SERVICE }));
  const availableByPlan = {};
  for (const p of eligible) availableByPlan[p.plan] = (availableByPlan[p.plan] || 0) + 1;
  const bucket = pickPlanBucket(market, availableByPlan, session, DEFAULT_ALLOCATION);
  const pool = eligible.filter((p) => p.plan === bucket)
    .map((p) => ({ ...p, ...p.counters[market] }));

  const pagesSeen = new Set();
  const exposureIfCountedOnceOnly = new Map(); // real system: ON CONFLICT dedupes per (pandit, session, market, hour)
  for (let i = 0; i < REFRESH_SPAM_TRIALS; i += 1) {
    const ranked = rankPool(pool, { market, sessionKey: session, templeId: TEMPLE, now: t + i }, DEFAULTS);
    const seed = sessionSeed({ sessionKey: session, templeId: TEMPLE, serviceId: SERVICE, now: t + i });
    const page = selectPage(ranked, { pageSize: PAGE_SIZE, rotationDepth: 3, seed });
    pagesSeen.add(page.map((s) => s.panditId).join(','));
    page.forEach((slot, idx) => {
      // The real uq_exposure_session_hour unique index means only the FIRST
      // write within the hour bucket survives — every trial here shares one
      // hour (t..t+REFRESH_SPAM_TRIALS ms), so only trial 0's exposure counts.
      if (i === 0) exposureIfCountedOnceOnly.set(slot.panditId, positionWeight(idx + 1));
    });
  }

  const distinctPages = pagesSeen.size;
  const totalExposureIfUnbounded = REFRESH_SPAM_TRIALS * PAGE_SIZE; // naive "every render counts"
  const totalExposureActual = exposureIfCountedOnceOnly.size; // what the DB unique index actually allows

  console.log(`  ${REFRESH_SPAM_TRIALS} refreshes, same visitor/session, same hour bucket:`);
  console.log(`    presentation varied across ${distinctPages} distinct page ordering(s) (rotation is live within the band)`);
  console.log(`    exposure rows an unbounded write path WOULD create: ${totalExposureIfUnbounded}`);
  console.log(`    exposure rows uq_exposure_session_hour actually allows: ${totalExposureActual} (one per pandit, first write wins)`);
  console.log(`    inflation factor prevented: ${(totalExposureIfUnbounded / Math.max(1, totalExposureActual)).toFixed(1)}x`);
}

function main() {
  console.log(`\nLead Distribution Simulation — ${VISITORS.toLocaleString()} visitors, `
    + `${Math.round(INDIA_SHARE * 100)}% India / ${Math.round((1 - INDIA_SHARE - UNKNOWN_SHARE) * 100)}% International `
    + `/ ${Math.round(UNKNOWN_SHARE * 100)}% UNKNOWN\n`
    + `500 pandits at Maa Baglamukhi Nalkheda: 200 Bharat / 150 Global / 150 International `
    + `(${Math.round(NEW_COHORT_FRACTION * 100)}% of each plan is a new-pandit cohort, joined 2 days ago)\n`);

  const modes = COMPARE ? ['fair', 'random', 'rating'] : ['fair'];

  for (const mode of modes) {
    const pandits = run({ mode });
    const title = { fair: 'FAIRNESS ENGINE', random: 'ORDER BY RANDOM()', rating: 'ORDER BY rating DESC' }[mode];
    console.log(`\n═══ ${title} ═══\n`);

    console.log('  INDIA market');
    const indiaRows = [report(mode, pandits, 'INDIA', 'bharat'), report(mode, pandits, 'INDIA', 'global')];
    printTable(indiaRows);
    console.log('\n  INTERNATIONAL market');
    const intlRows = [
      report(mode, pandits, 'INTERNATIONAL', 'international'),
      report(mode, pandits, 'INTERNATIONAL', 'global'),
    ];
    printTable(intlRows);

    if (mode === 'fair') {
      console.log('\n  Extended fairness metrics (India + International; UNKNOWN records no exposure — see below)');
      printExtendedMetrics([...indiaRows, ...intlRows]);

      // Section 21/23: UNKNOWN-market visitors get their own report — Phase
      // 2B means only the dual-market (global) plan is ever eligible, in
      // EITHER market's candidate pool. Report both to show the pool is the
      // same regardless of which counterMarket the visitor's country would
      // have resolved to.
      console.log('\n  UNKNOWN-market visitors — Phase 2B intersection policy (global/dual-market plan only)');
      const unknownEligible = pandits.filter((p) => !eligibilityFailure(p, { market: 'UNKNOWN', templeId: TEMPLE, serviceId: SERVICE }));
      const leakedTiers = [...new Set(unknownEligible.map((p) => p.plan))].filter((pl) => pl !== 'global');
      console.log(`    eligible pool: ${unknownEligible.length} pandits, tiers = [${[...new Set(unknownEligible.map((p) => p.plan))].join(', ')}]`);
      console.log(`    ${leakedTiers.length === 0 ? 'PASS — no single-market tier leaked into the UNKNOWN pool' : `FAIL — leaked tiers: ${leakedTiers.join(', ')}`}`);

      console.log('\n  Refresh-spam check (Section 33)');
      refreshSpamCheck();
    }
  }

  /* The commercial check that matters more than the engine. */
  console.log('\n═══ PLAN LADDER — leads per seat, and what they cost ═══\n');
  const seats = { bharat: 200, global: 150, international: 150 };
  const indiaPerSeat = leadsPerSeat({ marketVolume: 10000, allocation: DEFAULT_ALLOCATION.INDIA, seats });
  const intlPerSeat = leadsPerSeat({ marketVolume: 3000, allocation: DEFAULT_ALLOCATION.INTERNATIONAL, seats });
  const price = { bharat: 5000, global: 9000, international: 15000 };

  console.log('  plan'.padEnd(17) + 'India'.padStart(8) + 'Intl'.padStart(7) + 'total'.padStart(8) + '   ₹/lead');
  console.log('  ' + '-'.repeat(52));
  let prev = 0;
  let inverted = false;
  for (const plan of ['bharat', 'global', 'international']) {
    const i = indiaPerSeat[plan] || 0;
    const x = intlPerSeat[plan] || 0;
    const total = i + x;
    const cpl = total > 0 ? price[plan] / total : Infinity;
    if (prev && cpl > prev * 1.2) inverted = true;
    prev = cpl;
    console.log(`  ${plan.padEnd(15)}${i.toFixed(1).padStart(8)}${x.toFixed(1).padStart(7)}`
      + `${total.toFixed(1).padStart(8)}   ₹${Math.round(cpl)}`);
  }
  if (inverted) {
    console.log('\n  \x1b[31mWARNING\x1b[0m cost per lead RISES with plan price.');
    console.log('  A pandit doing this arithmetic downgrades. Either an international lead must');
    console.log('  genuinely be worth the difference, or premium plans need fewer seats.');
    console.log('  See docs/LEAD_DISTRIBUTION_V2.md §2.');
  }
  console.log('');
}

main();
