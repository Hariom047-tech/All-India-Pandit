#!/usr/bin/env node
/**
 * Traces the distribution engine stage by stage, with real numbers.
 *
 *   npm run trace:distribution              all scenarios
 *   npm run trace:distribution -- --only 3  one scenario
 *   npm run trace:distribution -- --md      markdown, for the audit document
 *
 * WHY THIS EXISTS SEPARATELY FROM THE TESTS
 *
 * The 66 unit tests assert that the engine is correct. They do not SHOW what it
 * does. An auditor — or the person who has to defend a pandit's share to that
 * pandit — needs to see one request walk through every stage with the actual
 * arithmetic visible: which candidates were fetched, which were dropped and
 * why, what each score was made of, and which slot everyone landed in.
 *
 * Runs entirely on the pure functions with a fixed synthetic population, so it
 * needs no database and produces identical output on every machine. That
 * matters: an audit trace you cannot reproduce is an anecdote.
 */

const {
  DEFAULTS, positionWeight, profileQuality, eligibilityFailure, rankPool,
} = require('../src/services/distribution/fairness');
const {
  sessionSeed, selectPage, selectBucket, POOL_MODE, DEFAULT_ALLOCATION,
} = require('../src/services/distribution/rotation');

const argv = process.argv.slice(2);
const MD = argv.includes('--md');
const ONLY = argv.includes('--only') ? Number(argv[argv.indexOf('--only') + 1]) : null;

/* Fixed clock. Every number below is reproducible. */
const NOW = Date.parse('2026-08-14T10:00:00Z');
const DAY = 86_400_000;
const TIER_TO_PLAN = { silver: 'bharat', gold: 'global', diamond: 'international' };

/* ── output helpers ─────────────────────────────────────────────────────── */
const out = [];
const w = (s = '') => out.push(s);
const h1 = (s) => w(MD ? `\n## ${s}\n` : `\n${'═'.repeat(74)}\n${s}\n${'═'.repeat(74)}`);
const h2 = (s) => w(MD ? `\n### ${s}\n` : `\n── ${s} ${'─'.repeat(Math.max(0, 70 - s.length))}`);
const p = (s) => w(s);
const code = (lines) => {
  if (MD) { w('```'); lines.forEach((l) => w(l)); w('```'); } else lines.forEach((l) => w(l));
};
function table(headers, rows) {
  if (MD) {
    w(`| ${headers.join(' | ')} |`);
    w(`|${headers.map(() => '---').join('|')}|`);
    rows.forEach((r) => w(`| ${r.join(' | ')} |`));
    return;
  }
  const widths = headers.map((hd, i) =>
    Math.max(String(hd).length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  w(line(headers));
  w('  ' + widths.map((n) => '─'.repeat(n)).join('  '));
  rows.forEach((r) => w(line(r)));
}

/* ── the population ─────────────────────────────────────────────────────── */

/**
 * Ten pandits, built to exercise every branch rather than to look realistic:
 * one unverified, one expired, one with no contact number, one below the
 * profile floor, one brand new, one running away with the pool, one at its
 * daily cap. A uniformly healthy population would make any engine look correct.
 */
function population() {
  const base = (over) => ({
    isActive: true, isVerified: true, subscriptionActive: true, isAvailable: true,
    whatsapp: '9876500000', photoUrl: '/p.jpg', bio: 'Vedic pandit at Nalkheda',
    videoUrl: '/v.mp4', specializations: ['Havan'], videoKycCompleted: true,
    experienceYears: 12, rating: 4.5, reviewCount: 40,
    markets: ['INDIA'], services: ['havan'], temples: ['nalkheda'],
    joinedAt: new Date(NOW - 400 * DAY).toISOString(),
    qualifiedLeads: 0, todayLeads: 0, weightedExposure: 0,
    tier: 'silver',
    ...over,
  });

  return [
    // Healthy, mid-pack.
    base({ id: 'P1', name: 'Ramesh Sharma', qualifiedLeads: 8, weightedExposure: 42 }),
    base({ id: 'P2', name: 'Suresh Tiwari', qualifiedLeads: 7, weightedExposure: 39 }),

    // Starved: barely any exposure, no leads. Should rise.
    base({ id: 'P3', name: 'Mahesh Dubey', qualifiedLeads: 0, weightedExposure: 3 }),

    // Shown a lot, converted nobody. Leads-only ranking would call this pandit
    // "starving" and boost them forever. Exposure counter must stop that.
    base({ id: 'P4', name: 'Dinesh Mishra', qualifiedLeads: 0, weightedExposure: 96 }),

    // Running away with the pool — over 3× fair share on both counters.
    base({ id: 'P5', name: 'Rajesh Pandey', qualifiedLeads: 34, weightedExposure: 180 }),

    // At the daily cap.
    base({ id: 'P6', name: 'Mukesh Joshi', qualifiedLeads: 6, todayLeads: 5, weightedExposure: 35 }),

    // Joined 2 days ago.
    base({ id: 'P7', name: 'Naresh Bhatt', joinedAt: new Date(NOW - 2 * DAY).toISOString(), weightedExposure: 4 }),

    // ── ineligible, one reason each ──
    base({ id: 'X1', name: 'Umesh Vyas', isVerified: false }),
    base({ id: 'X2', name: 'Girish Dixit', subscriptionActive: false }),
    base({ id: 'X3', name: 'Harish Goswami', whatsapp: null, phone: null }),
    base({
      id: 'X4', name: 'Manish Purohit',
      photoUrl: null, bio: null, videoUrl: null, specializations: [],
      videoKycCompleted: false, experienceYears: 0,
    }),

    // ── other plans, for market and bucket scenarios ──
    base({ id: 'G1', name: 'Kailash Acharya', tier: 'gold', markets: ['INDIA', 'INTERNATIONAL'], qualifiedLeads: 4, weightedExposure: 20 }),
    base({ id: 'G2', name: 'Govind Trivedi', tier: 'gold', markets: ['INDIA', 'INTERNATIONAL'], qualifiedLeads: 3, weightedExposure: 17 }),
    base({ id: 'D1', name: 'Madhav Shastri', tier: 'diamond', markets: ['INTERNATIONAL'], qualifiedLeads: 2, weightedExposure: 11 }),
    base({ id: 'D2', name: 'Anand Chaturvedi', tier: 'diamond', markets: ['INTERNATIONAL'], qualifiedLeads: 1, weightedExposure: 9 }),
  ];
}

const nameOf = (all, id) => all.find((x) => x.id === id)?.name || id;
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 1 — one full request, every stage
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario1() {
  h1('Scenario 1 — one India request, every stage');
  const all = population();
  const ctx = { market: 'INDIA', templeId: 'nalkheda', serviceId: null };

  p('Request: a devotee in India opens the Maa Baglamukhi Nalkheda page.');
  p(`Session key \`visitor-A\`. Clock fixed at ${new Date(NOW).toISOString()}.`);

  h2('Stage 1 — candidates fetched');
  p(`${all.length} pandits are associated with this temple. No filtering has happened yet.`);

  h2('Stage 2 — eligibility gates (hard, before any scoring)');
  const rows = [];
  const eligible = [];
  for (const c of all) {
    const fail = eligibilityFailure(c, ctx, DEFAULTS);
    const { completeness } = profileQuality(c);
    rows.push([c.id, c.name, c.tier, `${Math.round(completeness * 100)}%`, fail || 'ELIGIBLE']);
    if (!fail) eligible.push(c);
  }
  table(['id', 'pandit', 'plan', 'profile', 'result'], rows);
  p('');
  p(`**${eligible.length} of ${all.length} eligible.** No score can rescue a pandit who fails a gate — `
    + 'these run before ranking for exactly that reason.');
  p('');
  p('`X4` fails on the profile floor: only 1 of 7 completeness checks passes (14%) — a contact '
    + 'number and nothing else. The floor is 50%. '
    + '`G1`/`G2` are eligible here because the Global plan is entitled to India too; `D1`/`D2` are not.');

  h2('Stage 3 — plan bucket');
  const availableByPlan = {};
  for (const c of eligible) {
    const plan = TIER_TO_PLAN[c.tier];
    availableByPlan[plan] = (availableByPlan[plan] || 0) + 1;
  }
  const seed = sessionSeed({ sessionKey: 'visitor-A', templeId: 'nalkheda', serviceId: null, now: NOW });
  const bucket = selectBucket({
    market: 'INDIA', availableByPlan, sessionSeed: seed, allocation: DEFAULT_ALLOCATION, mode: POOL_MODE.WEIGHTED,
  });
  code([
    `available by plan : ${JSON.stringify(availableByPlan)}`,
    `allocation (INDIA): ${JSON.stringify(DEFAULT_ALLOCATION.INDIA)}`,
    `session seed      : ${seed}`,
    `bucket chosen     : ${bucket}`,
  ]);
  p('');
  p('The bucket is drawn from a hash of the session, not a random number, so this visitor '
    + 'gets the same bucket on every refresh — while across many visitors the split converges '
    + 'on 70/30.');

  const pool = eligible.filter((c) => TIER_TO_PLAN[c.tier] === bucket);

  h2('Stage 4 — fairness scored INSIDE the bucket');
  const totals = {
    size: pool.length,
    totalLeads: pool.reduce((a, c) => a + c.qualifiedLeads, 0),
    totalExposure: pool.reduce((a, c) => a + c.weightedExposure, 0),
  };
  code([
    `pool size       : ${totals.size}`,
    `total leads     : ${totals.totalLeads}`,
    `total exposure  : ${f2(totals.totalExposure)}`,
    `fair share      : 1/${totals.size} = ${f3(1 / totals.size)}  (${f2(100 / totals.size)}% each)`,
  ]);
  p('');
  p('Fairness is computed within one plan, never across plans. Comparing a ₹5,000 pandit\'s '
    + 'share against a ₹15,000 pandit\'s would be meaningless — they bought different things.');

  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'visitor-A', templeId: 'nalkheda', now: NOW }, DEFAULTS);

  h2('Stage 5 — score breakdown');
  table(
    ['id', 'pandit', 'leads', 'expo', 'quality', 'leadDef', 'expoDef', 'push', 'cold', 'penalty', 'SCORE'],
    ranked.map((r) => {
      const c = pool.find((x) => x.id === r.panditId);
      const fx = r.factors;
      return [
        r.panditId, c.name, c.qualifiedLeads, f2(c.weightedExposure),
        f2(fx.quality), f2(fx.leadDeficit), f2(fx.exposureDeficit),
        f2(fx.fairnessPush), f2(fx.coldStart), f2(fx.overPenalty),
        r.dailyCapped ? `${f2(r.score)} CAPPED` : f2(r.score),
      ];
    }),
  );
  p('');
  p('Reading the columns:');
  p('');
  p('- `leadDef` / `expoDef` are deficits **normalised against fair share**, so +1.00 means '
    + '"received nothing" and −1.00 means "received double". Without normalising, a 500-pandit '
    + 'pool would have deficits so tiny that fairness would quietly stop working at scale.');
  p('- `push` = `fairnessStrength × (0.55 × leadDef + 0.45 × expoDef)`. Exposure is weighted '
    + 'slightly lower because leads are the devotee\'s decision, not ours.');
  p('- `penalty` fires above 3× fair share, and is a step, not a slope — a linear deficit alone '
    + 'is too gentle against someone genuinely running away with the pool.');
  p('- A `CAPPED` pandit is scored −1000, so they sort below every uncapped pandit regardless of '
    + 'quality. A hard exclusion, not a nudge.');

  h2('Stage 6 — rotation into slots');
  const page = selectPage(ranked, { pageSize: 5, rotationDepth: 3, seed, page: 1 });
  table(
    ['slot', 'id', 'pandit', 'rank by score', 'exposure credited'],
    page.map((s, i) => [
      i + 1, s.panditId, nameOf(all, s.panditId),
      ranked.findIndex((r) => r.panditId === s.panditId) + 1,
      f3(positionWeight(i + 1)),
    ]),
  );
  p('');
  p('Slot 1 is pinned to the top-ranked pandit; everything below rotates within a band of '
    + '`pageSize × rotationDepth`. Pure rotation would let the most under-served pandit land at '
    + 'slot 12, which would undo the correction just computed.');
  p('');
  p('Note the exposure weights: **slot 1 is worth 7.6× slot 20** (1.000 vs 0.131). Counting raw '
    + 'impressions would '
    + 'treat them as equal and let whoever sits at #1 accumulate real advantage while appearing '
    + 'equally exposed.');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 2 — market entitlement
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario2() {
  h1('Scenario 2 — the same temple, seen from three places');
  const all = population();

  for (const market of ['INDIA', 'INTERNATIONAL']) {
    h2(`Visitor in ${market}`);
    const ctx = { market, templeId: 'nalkheda', serviceId: null };
    const eligible = all.filter((c) => !eligibilityFailure(c, ctx, DEFAULTS));
    const byPlan = {};
    for (const c of eligible) byPlan[c.tier] = (byPlan[c.tier] || 0) + 1;
    code([
      `eligible: ${eligible.length}`,
      `by plan : ${JSON.stringify(byPlan)}`,
      `pandits : ${eligible.map((c) => c.id).join(', ') || '(none)'}`,
    ]);
  }

  h2('Visitor whose country could not be determined');
  p('The engine does **not** guess. It reads counters against India (the larger pool and the '
    + 'likelier truth for this platform), ranks normally so the page is still sensible — and '
    + 'records **no exposure at all**.');
  p('');
  p('Charging an impression against a market we could not determine would corrupt exactly the '
    + 'counter that decides who gets shown next. A wrong number here is worse than no number.');
  p('');
  p('Reference: `engine.js` — `const isUnknown = !market || market === \'UNKNOWN\'` and '
    + '`if (record && !isUnknown && pandits.length)`.');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 3 — rotation: stable per visitor, different between visitors
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario3() {
  h1('Scenario 3 — does every visitor really see something different?');
  const all = population();
  const ctx = { market: 'INDIA', templeId: 'nalkheda', serviceId: null };
  const pool = all.filter((c) => !eligibilityFailure(c, ctx, DEFAULTS) && c.tier === 'silver');

  const pageFor = (sk) => {
    const ranked = rankPool(pool, { market: 'INDIA', sessionKey: sk, templeId: 'nalkheda', now: NOW }, DEFAULTS);
    const seed = sessionSeed({ sessionKey: sk, templeId: 'nalkheda', now: NOW });
    return selectPage(ranked, { pageSize: 5, rotationDepth: 3, seed, page: 1 }).map((s) => s.panditId);
  };

  h2('Same visitor, three refreshes');
  const a = [pageFor('visitor-A'), pageFor('visitor-A'), pageFor('visitor-A')];
  code(a.map((r, i) => `refresh ${i + 1}: ${r.join(' → ')}`));
  p('');
  p(a.every((r) => r.join() === a[0].join())
    ? '**Identical.** A refresh does not reshuffle the page under the devotee\'s thumb.'
    : '**DIFFERENT — this is a bug.** The devotee would lose the pandit they were looking at.');

  h2('Six different visitors');
  const seen = [];
  for (const sk of ['visitor-A', 'visitor-B', 'visitor-C', 'visitor-D', 'visitor-E', 'visitor-F']) {
    seen.push([sk, pageFor(sk).join(' → ')]);
  }
  table(['session', 'page 1'], seen);
  p('');
  const firsts = new Set(seen.map((r) => r[1].split(' → ')[0]));
  p(`**${firsts.size} different pandits appeared in slot 1** across 6 visitors. `
    + 'Under the old `ORDER BY rating DESC`, all six would have seen the same pandit at the top.');
  p('');
  p('The seed is bucketed by the hour, so a visitor who leaves the tab open all day does not keep '
    + 'the same pandit at #1 indefinitely.');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 4 — the self-correction loop
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario4() {
  h1('Scenario 4 — does the engine actually self-correct?');
  p('The claim under test: exposure recorded on one request changes who is shown on the next.');
  p('');
  p('500 visitors, one at a time. After each page renders, exposure is credited at the '
    + 'position weight each pandit received — exactly what `recordExposure()` writes. Nothing '
    + 'else changes. Starting state is the uneven population from Scenario 1.');

  const ctx = { market: 'INDIA', templeId: 'nalkheda', serviceId: null };
  const pool = population()
    .filter((c) => !eligibilityFailure(c, ctx, DEFAULTS) && c.tier === 'silver')
    .map((c) => ({ ...c }));

  const start = Object.fromEntries(pool.map((c) => [c.id, c.weightedExposure]));
  const slot1 = Object.fromEntries(pool.map((c) => [c.id, 0]));

  for (let i = 0; i < 500; i += 1) {
    const sk = `v${i}`;
    const ranked = rankPool(pool, { market: 'INDIA', sessionKey: sk, templeId: 'nalkheda', now: NOW }, DEFAULTS);
    const seed = sessionSeed({ sessionKey: sk, templeId: 'nalkheda', now: NOW });
    const page = selectPage(ranked, { pageSize: 5, rotationDepth: 3, seed, page: 1 });
    page.forEach((s, idx) => {
      const c = pool.find((x) => x.id === s.panditId);
      c.weightedExposure += positionWeight(idx + 1);
      if (idx === 0) slot1[s.panditId] += 1;
    });
  }

  h2('Exposure before and after 500 visitors');
  const sorted = [...pool].sort((x, y) => start[x.id] - start[y.id]);
  table(
    ['id', 'pandit', 'exposure before', 'exposure after', 'gained', 'slot-1 wins'],
    sorted.map((c) => [
      c.id, c.name, f2(start[c.id]), f2(c.weightedExposure),
      f2(c.weightedExposure - start[c.id]), slot1[c.id],
    ]),
  );

  const gains = sorted.map((c) => c.weightedExposure - start[c.id]);
  const startVals = sorted.map((c) => start[c.id]);
  const endVals = sorted.map((c) => c.weightedExposure);
  const spread = (a) => (Math.max(...a) / Math.max(0.01, Math.min(...a)));

  p('');
  code([
    `spread before (max/min): ${f2(spread(startVals))}×`,
    `spread after  (max/min): ${f2(spread(endVals))}×`,
    `most exposure gained   : ${f2(Math.max(...gains))}`,
    `least exposure gained  : ${f2(Math.min(...gains))}`,
  ]);
  p('');
  p(spread(endVals) < spread(startVals)
    ? '**The gap narrowed.** The pandits who started with almost no exposure gained the most, '
      + 'and the one who started far ahead gained the least. That is the correction working — '
      + 'and it only works because exposure is written back after every render.'
    : '**The gap did not narrow — this would be a bug.**');
  p('');
  p('Worth being precise about what this proves: it shows the *exposure* counter self-corrects. '
    + 'It does not simulate devotees choosing, so it says nothing about whether leads even out — '
    + 'that depends on the devotee, which is why the engine promises fair **opportunity**, not '
    + 'equal leads.');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 5 — the throttle and the cap
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario5() {
  h1('Scenario 5 — what stops one pandit taking everything');
  const all = population();
  const ctx = { market: 'INDIA', templeId: 'nalkheda', serviceId: null };
  const pool = all.filter((c) => !eligibilityFailure(c, ctx, DEFAULTS) && c.tier === 'silver');
  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'audit', templeId: 'nalkheda', now: NOW }, DEFAULTS);

  const totalLeads = pool.reduce((a, c) => a + c.qualifiedLeads, 0);
  const fair = 1 / pool.length;

  h2('Over-service throttle');
  table(
    ['id', 'pandit', 'leads', 'share', 'fair share', 'multiple', 'penalty', 'rank'],
    pool.map((c) => {
      const share = totalLeads ? c.qualifiedLeads / totalLeads : 0;
      const r = ranked.find((x) => x.panditId === c.id);
      return [
        c.id, c.name, c.qualifiedLeads, `${f2(share * 100)}%`, `${f2(fair * 100)}%`,
        `${f2(share / fair)}×`, f2(r.factors.overPenalty),
        ranked.findIndex((x) => x.panditId === c.id) + 1,
      ];
    }),
  );
  p('');
  p('The penalty is a **step at 3× fair share**, not a slope. A pandit drifting slightly ahead is '
    + 'handled by the deficit term alone; one genuinely running away with the pool needs a shove, '
    + 'because a linear deficit is too gentle at that distance.');

  h2('Daily cap');
  const capped = ranked.filter((r) => r.dailyCapped);
  code(capped.length
    ? capped.map((r) => `${r.panditId} ${nameOf(all, r.panditId)}: today ${pool.find((c) => c.id === r.panditId).todayLeads} `
      + `/ cap ${DEFAULTS.dailyLeadCap} → score ${f2(r.score)} (rank ${ranked.findIndex((x) => x.panditId === r.panditId) + 1} of ${ranked.length})`)
    : ['(nobody at cap)']);
  p('');
  p('Scored −1000, so a capped pandit sorts below every uncapped one whatever their quality.');
  p('');

  /* This measurement is the reason the audit exists — see the finding below. */
  let onPage = 0;
  for (let i = 0; i < 200; i += 1) {
    const rk = rankPool(pool, { market: 'INDIA', sessionKey: `v${i}`, templeId: 'nalkheda', now: NOW }, DEFAULTS);
    const sd = sessionSeed({ sessionKey: `v${i}`, templeId: 'nalkheda', now: NOW });
    if (selectPage(rk, { pageSize: 5, rotationDepth: 3, seed: sd, page: 1 })
      .some((x) => x.panditId === 'P6')) onPage += 1;
  }
  code([`capped pandit P6 appeared on ${onPage} of 200 first pages`]);
  p('');
  p('**This is the one defect this audit found.** Ranking last is enough in a 500-pandit pool — '
    + 'rank 500 never reaches a rotation band of 60. It did nothing in a small one: at a six-pandit '
    + 'temple the band covered everyone, rotation shuffled them back up, and the capped pandit was '
    + 'measured on **164 of 200 first pages (82%)**, still collecting contacts after hitting the '
    + 'limit. The cap was not the hard exclusion `fairness.js` claimed it was.');
  p('');
  p('Fixed in `rotation.js` — `selectOrder()` now holds capped pandits out of the rotating band '
    + 'entirely. They are held back rather than dropped: if there are not enough uncapped pandits '
    + 'to fill the page they still appear, below every uncapped one, because an empty listing '
    + 'serves nobody. Five tests pin the behaviour.');
  p('');
  p('The cap is per market, so a Global plan keeps separate India and International allowances.');

  h2('Cold start');
  const nu = ranked.filter((r) => r.factors.coldStart > 0);
  code(nu.length
    ? nu.map((r) => `${r.panditId} ${nameOf(all, r.panditId)}: boost +${f2(r.factors.coldStart)} → rank `
      + `${ranked.findIndex((x) => x.panditId === r.panditId) + 1}`)
    : ['(nobody in the cold-start window)']);
  p('');
  p('Bounded **twice**: by age (7 days) and by exposure received (200 weighted impressions). A new '
    + 'pandit needs a chance, not a flood — and a deficit model without this boost would rank '
    + 'them top continuously until they caught up.');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO 6 — weighted vs priority
 * ═════════════════════════════════════════════════════════════════════════ */
function scenario6() {
  h1('Scenario 6 — weighted share vs strict priority');
  const available = { bharat: 200, global: 150 };
  const priorities = { international: 10, global: 20, bharat: 30 };

  h2('Weighted mode — 2,000 visitors');
  const counts = { bharat: 0, global: 0 };
  for (let i = 0; i < 2000; i += 1) {
    const b = selectBucket({
      market: 'INDIA', availableByPlan: available, sessionSeed: `v${i}`,
      allocation: DEFAULT_ALLOCATION, mode: POOL_MODE.WEIGHTED, priorities,
    });
    counts[b] += 1;
  }
  table(
    ['plan', 'configured', 'observed', 'visitors'],
    Object.entries(counts).map(([plan, n]) => [
      plan, `${(DEFAULT_ALLOCATION.INDIA[plan] * 100).toFixed(0)}%`,
      `${((n / 2000) * 100).toFixed(1)}%`, n,
    ]),
  );
  p('');
  p('Converges on the configured split. Every plan is guaranteed a share.');

  h2('Priority mode — the same 2,000 visitors');
  const pri = {};
  for (let i = 0; i < 2000; i += 1) {
    const b = selectBucket({
      market: 'INDIA', availableByPlan: available, sessionSeed: `v${i}`,
      allocation: DEFAULT_ALLOCATION, mode: POOL_MODE.PRIORITY, priorities,
    });
    pri[b] = (pri[b] || 0) + 1;
  }
  table(['plan', 'visitors', 'share'], Object.entries(pri).map(([plan, n]) => [plan, n, `${((n / 2000) * 100).toFixed(1)}%`]));
  p('');
  p('**The 200 Bharat pandits receive nothing.** This is not a defect — it is what a priority '
    + 'ladder does, and the admin panel states it in red before the setting can be saved.');

  h2('Priority when the higher plan empties');
  const b = selectBucket({
    market: 'INDIA', availableByPlan: { bharat: 200, global: 0 }, sessionSeed: 'x',
    allocation: DEFAULT_ALLOCATION, mode: POOL_MODE.PRIORITY, priorities,
  });
  code([`global available: 0  →  bucket: ${b}`]);
  p('');
  p('An empty premium bucket must not black out the market.');
}

/* ═══════════════════════════════════════════════════════════════════════════ */
const SCENARIOS = [scenario1, scenario2, scenario3, scenario4, scenario5, scenario6];

if (MD) {
  w('<!-- GENERATED by scripts/trace-distribution.js — do not edit by hand. -->');
  w(`<!-- Regenerate: npm run trace:distribution -- --md > docs/LEAD_DISTRIBUTION_AUDIT.md -->`);
}

SCENARIOS.forEach((fn, i) => { if (!ONLY || ONLY === i + 1) fn(); });

if (!MD) w(`\n${'═'.repeat(74)}\nTraced with fixed clock ${new Date(NOW).toISOString()} — reproducible on any machine.`);

console.log(out.join('\n'));
