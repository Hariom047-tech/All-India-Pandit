/**
 * Lead distribution engine. Pure functions — no database, no network.
 *
 *   npm run test:distribution
 *
 * The engine was written as pure functions specifically so these can run. A
 * distribution engine you can only inspect against production traffic is one
 * nobody actually verifies.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  scorePandit, rankPool, eligibilityFailure, isEligibleInEveryMarket, positionWeight, profileQuality, DEFAULTS,
} = require('../src/services/distribution/fairness');
const {
  pickPlanBucket, sessionSeed, selectPage, selectOrder, leadsPerSeat, DEFAULT_ALLOCATION,
  rotationSeed, clampRefreshGeneration, MAX_REFRESH_GENERATIONS,
} = require('../src/services/distribution/rotation');
const {
  resolveLeadMarket, resolveBrowsingMarket, countryFromPhone, countryFromEdge,
  poolsForBrowsing, MARKETS,
} = require('../src/services/distribution/market');
const { attachDailyCaps } = require('../src/services/distribution/engine');

const NOW = Date.parse('2026-08-13T10:00:00Z');
const CTX = { market: 'INDIA', sessionKey: 's1', templeId: 't1', now: NOW };

function pandit(over = {}) {
  return {
    id: 'p1',
    isActive: true, isVerified: true, subscriptionActive: true, isAvailable: true,
    whatsapp: '9999999999',
    markets: ['INDIA'],
    temples: ['t1'], services: ['sv1'],
    photoUrl: 'x.jpg', bio: 'b', videoUrl: 'v.mp4',
    specializations: ['Havan'], videoKycCompleted: true, experienceYears: 10,
    rating: 4.5, reviewCount: 50,
    joinedAt: '2025-01-01',
    qualifiedLeads: 10, weightedExposure: 100, todayLeads: 0,
    ...over,
  };
}
const POOL = { size: 10, totalLeads: 100, totalExposure: 1000 };

/* ── market entitlement — the plan ladder ─────────────────────────────── */

test('a Bharat pandit is invisible to an international visitor', () => {
  const p = pandit({ markets: ['INDIA'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'INTERNATIONAL', templeId: 't1' }), 'market_not_entitled');
  assert.strictEqual(eligibilityFailure(p, { market: 'INDIA', templeId: 't1' }), null);
});

test('an International-only pandit is invisible to an India visitor', () => {
  const p = pandit({ markets: ['INTERNATIONAL'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'INDIA', templeId: 't1' }), 'market_not_entitled');
});

test('a Global pandit appears in both markets', () => {
  const p = pandit({ markets: ['INDIA', 'INTERNATIONAL'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'INDIA', templeId: 't1' }), null);
  assert.strictEqual(eligibilityFailure(p, { market: 'INTERNATIONAL', templeId: 't1' }), null);
});

/*
 * Phase 2 — UNKNOWN market safety.
 *
 * The old behaviour ("UNKNOWN sees everyone, entitlement is not enforced")
 * has been replaced: UNKNOWN is now a conservative INTERSECTION, not a
 * bypass. A real international visitor whose country lookup failed must
 * never be handed an India-only pandit's contact details, and an India-only
 * pandit's plan must never be exposed — or billed a lead — from a market it
 * was never sold into. Only a plan entitled in EVERY real market (today:
 * both INDIA and INTERNATIONAL — the dual-market/"global"/gold tier) is
 * safe to show someone we cannot place in either one specifically.
 */
test('isEligibleInEveryMarket: only a dual-market plan qualifies', () => {
  assert.strictEqual(isEligibleInEveryMarket(pandit({ markets: ['INDIA'] })), false);
  assert.strictEqual(isEligibleInEveryMarket(pandit({ markets: ['INTERNATIONAL'] })), false);
  assert.strictEqual(isEligibleInEveryMarket(pandit({ markets: ['INDIA', 'INTERNATIONAL'] })), true);
  assert.strictEqual(isEligibleInEveryMarket(pandit({ markets: [] })), false);
  assert.strictEqual(isEligibleInEveryMarket(pandit({ markets: undefined })), false);
});

test('an India-only pandit is NOT shown to an UNKNOWN-market visitor', () => {
  const p = pandit({ markets: ['INDIA'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'UNKNOWN', templeId: 't1' }), 'market_not_entitled');
});

test('an International-only pandit is NOT shown to an UNKNOWN-market visitor', () => {
  const p = pandit({ markets: ['INTERNATIONAL'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'UNKNOWN', templeId: 't1' }), 'market_not_entitled');
});

test('a dual-market pandit IS shown to an UNKNOWN-market visitor — the only safe intersection', () => {
  const p = pandit({ markets: ['INDIA', 'INTERNATIONAL'] });
  assert.strictEqual(eligibilityFailure(p, { market: 'UNKNOWN', templeId: 't1' }), null);
});

test('a missing/null market is treated identically to UNKNOWN — never a silent guess', () => {
  const indiaOnly = pandit({ markets: ['INDIA'] });
  const dual = pandit({ markets: ['INDIA', 'INTERNATIONAL'] });
  assert.strictEqual(eligibilityFailure(indiaOnly, { market: null, templeId: 't1' }), 'market_not_entitled');
  assert.strictEqual(eligibilityFailure(indiaOnly, { market: undefined, templeId: 't1' }), 'market_not_entitled');
  assert.strictEqual(eligibilityFailure(dual, { market: null, templeId: 't1' }), null);
});

test('UNKNOWN never quietly falls back to acting like INDIA or INTERNATIONAL alone', () => {
  // The specific regression this policy fixes: a plan valid in exactly one
  // real market must not leak through just because UNKNOWN used to default
  // to treating everyone as if they were in the larger (India) pool.
  const indiaOnly = pandit({ markets: ['INDIA'] });
  const intlOnly = pandit({ markets: ['INTERNATIONAL'] });
  assert.notStrictEqual(eligibilityFailure(indiaOnly, { market: 'UNKNOWN' }), eligibilityFailure(indiaOnly, { market: 'INDIA' }),
    'UNKNOWN must not behave like INDIA for an India-only pandit');
  assert.notStrictEqual(eligibilityFailure(intlOnly, { market: 'UNKNOWN' }), eligibilityFailure(intlOnly, { market: 'INTERNATIONAL' }),
    'UNKNOWN must not behave like INTERNATIONAL for an international-only pandit');
});

/* ── hard gates ───────────────────────────────────────────────────────── */

test('every hard gate excludes, whatever the quality', () => {
  const cases = [
    [{ isPaused: true }, 'paused'],
    [{ isActive: false }, 'inactive'],
    [{ isVerified: false }, 'unverified'],
    [{ subscriptionActive: false }, 'subscription_expired'],
    [{ isAvailable: false }, 'unavailable'],
    [{ whatsapp: null, phone: null }, 'no_contact'],
    [{ temples: ['other'] }, 'temple_not_served'],
    [{ services: ['other'] }, 'service_not_offered'],
  ];
  for (const [over, reason] of cases) {
    assert.strictEqual(
      eligibilityFailure(pandit(over), { market: 'INDIA', templeId: 't1', serviceId: 'sv1' }),
      reason,
    );
  }
});

test('an incomplete profile is not eligible for paid distribution', () => {
  const thin = pandit({
    photoUrl: null, bio: null, videoUrl: null, specializations: [],
    videoKycCompleted: false, experienceYears: 0,
  });
  assert.strictEqual(eligibilityFailure(thin, { market: 'INDIA', templeId: 't1' }), 'profile_incomplete');
});

/* ── the fairness correction ──────────────────────────────────────────── */

test('an under-served pandit outranks an over-served one', () => {
  const under = scorePandit(pandit({ id: 'u', qualifiedLeads: 2, weightedExposure: 20 }), POOL, CTX);
  const over = scorePandit(pandit({ id: 'o', qualifiedLeads: 30, weightedExposure: 300 }), POOL, CTX);
  assert.ok(under.score > over.score,
    `under-served ${under.score.toFixed(3)} should beat over-served ${over.score.toFixed(3)}`);
});

test('exposure without leads does NOT count as under-served', () => {
  // The bug a leads-only engine has: shown 500 times, converted nobody, still
  // looks starved and gets boosted forever.
  const shownNeverChosen = scorePandit(
    pandit({ id: 'a', qualifiedLeads: 0, weightedExposure: 500 }), POOL, CTX);
  const genuinelyStarved = scorePandit(
    pandit({ id: 'b', qualifiedLeads: 0, weightedExposure: 5 }), POOL, CTX);
  assert.ok(genuinelyStarved.score > shownNeverChosen.score,
    'a pandit who has had every chance must not outrank one who has had none');
});

test('the daily cap is an exclusion, not a nudge', () => {
  const capped = scorePandit(pandit({ todayLeads: 99, qualifiedLeads: 0, weightedExposure: 0 }), POOL, CTX);
  const normal = scorePandit(pandit({ id: 'n', qualifiedLeads: 40, weightedExposure: 900 }), POOL, CTX);
  assert.ok(capped.dailyCapped);
  assert.ok(capped.score < normal.score - 100,
    'a capped pandit must sort below everyone, however starved they look');
});

/*
 * Regression: engine.js's toEngineConfig() had no daily_lead_cap mapping, so
 * every pandit was scored against fairness.js's global DEFAULTS.dailyLeadCap
 * (5) regardless of their plan_market_entitlements row — silver/gold/diamond
 * are seeded at 5/5/3, and an admin editing one tier's cap had zero effect on
 * scoring. The fix is engine.js attaching each pandit's OWN tier cap as
 * p.dailyLeadCap before scoring; scorePandit must prefer it over cfg.
 */
test('a per-pandit dailyLeadCap overrides the global default', () => {
  // Global default is 5 (fairness.js DEFAULTS.dailyLeadCap). This pandit's
  // plan caps them at 3, and they have already had 3 today — capped under
  // their OWN tier's rule even though they are under the global default.
  const tightCap = scorePandit(
    pandit({ id: 't', todayLeads: 3, dailyLeadCap: 3, qualifiedLeads: 0, weightedExposure: 0 }),
    POOL, CTX,
  );
  assert.ok(tightCap.dailyCapped, 'must be capped at 3/3 under their own tier cap, not the global default of 5');

  // The inverse: a plan with a looser cap (10) and 6 leads today must NOT be
  // capped, even though 6 would have tripped the global default of 5.
  const looseCap = scorePandit(
    pandit({ id: 'l', todayLeads: 6, dailyLeadCap: 10, qualifiedLeads: 0, weightedExposure: 0 }),
    POOL, CTX,
  );
  assert.ok(!looseCap.dailyCapped, 'must not be capped at 6/10 just because the global default is 5');
});

test('with no per-pandit dailyLeadCap, scorePandit still falls back to cfg.dailyLeadCap', () => {
  // No entitlements loaded (pre-migration DB, or getEntitlements() failed) —
  // engine.js then leaves p.dailyLeadCap unset, and behaviour must be exactly
  // what it was before the fix.
  const capped = scorePandit(pandit({ todayLeads: 5, qualifiedLeads: 0, weightedExposure: 0 }), POOL, CTX);
  assert.ok(capped.dailyCapped, 'falls back to DEFAULTS.dailyLeadCap (5) when no per-pandit cap is supplied');
});

test('engine.attachDailyCaps() reads each pandit\'s cap from THEIR tier and market', () => {
  const entitlements = {
    INDIA: {
      silver: { weight: 0.7, dailyCap: 5 },
      gold: { weight: 0.3, dailyCap: 5 },
    },
    INTERNATIONAL: {
      gold: { weight: 0.3, dailyCap: 3 },
      diamond: { weight: 0.7, dailyCap: 3 },
    },
  };
  const pool = [
    pandit({ id: 's', tier: 'silver' }),
    pandit({ id: 'g', tier: 'gold' }),
    // No entitlement row for this tier/market — must be left untouched, not
    // crash and not invent a cap.
    pandit({ id: 'f', tier: 'free' }),
  ];
  const withCaps = attachDailyCaps(pool, entitlements, 'INDIA');
  assert.strictEqual(withCaps.find((p) => p.id === 's').dailyLeadCap, 5);
  assert.strictEqual(withCaps.find((p) => p.id === 'g').dailyLeadCap, 5);
  assert.strictEqual(withCaps.find((p) => p.id === 'f').dailyLeadCap, undefined);

  // The SAME gold pandit gets a DIFFERENT cap in the international pool —
  // proves the lookup is keyed on market too, not just tier.
  const intlCaps = attachDailyCaps(pool, entitlements, 'INTERNATIONAL');
  assert.strictEqual(intlCaps.find((p) => p.id === 'g').dailyLeadCap, 3);
});

test('engine.attachDailyCaps() is a no-op with empty entitlements (pre-migration fallback)', () => {
  const pool = [pandit({ id: 'x' })];
  const withCaps = attachDailyCaps(pool, {}, 'INDIA');
  assert.strictEqual(withCaps[0].dailyLeadCap, undefined);
  assert.strictEqual(withCaps[0].id, 'x', 'must not mutate or drop the pandit itself');
});

test('a new pandit is boosted, but not without limit', () => {
  const recent = new Date(NOW - 2 * 86400000).toISOString();
  const fresh = scorePandit(pandit({ joinedAt: recent, qualifiedLeads: 0, weightedExposure: 0 }), POOL, CTX);
  const alreadyShown = scorePandit(
    pandit({ id: 'x', joinedAt: recent, qualifiedLeads: 0, weightedExposure: 500 }), POOL, CTX);
  assert.ok(fresh.factors.coldStart > 0, 'a new pandit gets no boost at all');
  assert.strictEqual(alreadyShown.factors.coldStart, 0,
    'the boost must stop once they have had a real chance');
});

test('quality matters, but cannot produce winner-takes-all', () => {
  const equal = { qualifiedLeads: 10, weightedExposure: 100 };
  const great = scorePandit(pandit({ id: 'g', rating: 5, reviewCount: 500, ...equal }), POOL, CTX);
  const plain = scorePandit(pandit({ id: 'p', rating: 3.6, reviewCount: 2, ...equal }), POOL, CTX);
  assert.ok(great.score > plain.score, 'quality should count for something');
  assert.ok(great.score - plain.score < 0.3,
    'quality gap is too wide — a strong profile would monopolise the pool');
});

test('a starved weak profile still beats a saturated strong one', () => {
  // The whole point of the engine.
  const starvedWeak = scorePandit(
    pandit({ id: 'w', rating: 3.8, reviewCount: 5, qualifiedLeads: 0, weightedExposure: 5 }), POOL, CTX);
  const saturatedStrong = scorePandit(
    pandit({ id: 's', rating: 5, reviewCount: 500, qualifiedLeads: 45, weightedExposure: 450 }), POOL, CTX);
  assert.ok(starvedWeak.score > saturatedStrong.score);
});

/* ── position weighting ───────────────────────────────────────────────── */

test('slot 1 is worth far more than slot 20', () => {
  assert.ok(positionWeight(1) > positionWeight(5));
  assert.ok(positionWeight(5) > positionWeight(20));
  assert.strictEqual(positionWeight(1), 1);
  assert.ok(positionWeight(20) < 0.2, 'deep slots must be worth little, or exposure is meaningless');
});

test('an invalid position is worth nothing rather than NaN', () => {
  for (const bad of [0, -1, null, undefined, NaN]) {
    assert.strictEqual(positionWeight(bad), 0);
  }
});

/* ── session-stable rotation ──────────────────────────────────────────── */

test('the same visitor refreshing sees the same order', () => {
  const ranked = Array.from({ length: 60 }, (_, i) => ({ panditId: `p${i}`, score: 1 - i * 0.01 }));
  const seed = sessionSeed({ sessionKey: 'sess-A', templeId: 't1', now: NOW });
  const a = selectPage(ranked, { pageSize: 20, seed });
  const b = selectPage(ranked, { pageSize: 20, seed });
  assert.deepStrictEqual(a.map((x) => x.panditId), b.map((x) => x.panditId),
    'a refresh reshuffled the page — the site would feel rigged');
});

test('different visitors see different pandits', () => {
  const ranked = Array.from({ length: 60 }, (_, i) => ({ panditId: `p${i}`, score: 1 - i * 0.01 }));
  const a = selectPage(ranked, { pageSize: 20, seed: sessionSeed({ sessionKey: 'A', now: NOW }) });
  const b = selectPage(ranked, { pageSize: 20, seed: sessionSeed({ sessionKey: 'B', now: NOW }) });
  const same = a.filter((x, i) => b[i]?.panditId === x.panditId).length;
  assert.ok(same < 20, 'every visitor saw the identical page — nobody below slot 20 exists');
});

test('the most under-served pandit still gets slot 1', () => {
  const ranked = Array.from({ length: 60 }, (_, i) => ({ panditId: `p${i}`, score: 1 - i * 0.01 }));
  for (const s of ['A', 'B', 'C', 'D']) {
    const page = selectPage(ranked, { pageSize: 20, seed: sessionSeed({ sessionKey: s, now: NOW }) });
    assert.strictEqual(page[0].panditId, 'p0',
      'rotation buried the top-ranked pandit, defeating the fairness correction');
  }
});

test('the session order changes across hour buckets', () => {
  const a = sessionSeed({ sessionKey: 'A', templeId: 't1', now: NOW });
  const b = sessionSeed({ sessionKey: 'A', templeId: 't1', now: NOW + 3600_000 });
  assert.notStrictEqual(a, b, 'a tab left open all day would hold the same pandits at #1 forever');
});

/* ── plan allocation ──────────────────────────────────────────────────── */

test('allocation respects the configured weights over many visitors', () => {
  const counts = {};
  for (let i = 0; i < 4000; i += 1) {
    const b = pickPlanBucket('INDIA', { bharat: 200, global: 150 }, `s${i}`, DEFAULT_ALLOCATION);
    counts[b] = (counts[b] || 0) + 1;
  }
  const share = counts.bharat / 4000;
  assert.ok(Math.abs(share - 0.70) < 0.05, `bharat got ${(share * 100).toFixed(1)}%, expected ~70%`);
});

test('an empty bucket does not swallow its share', () => {
  // 30% of international traffic is allocated to Global. If no Global pandit is
  // eligible, that traffic must go to International, not show an empty page.
  for (let i = 0; i < 200; i += 1) {
    const b = pickPlanBucket('INTERNATIONAL', { international: 150, global: 0 }, `s${i}`, DEFAULT_ALLOCATION);
    assert.strictEqual(b, 'international');
  }
});

test('bucket choice is stable for one session', () => {
  const a = pickPlanBucket('INDIA', { bharat: 200, global: 150 }, 'same-session', DEFAULT_ALLOCATION);
  const b = pickPlanBucket('INDIA', { bharat: 200, global: 150 }, 'same-session', DEFAULT_ALLOCATION);
  assert.strictEqual(a, b);
});

test('leadsPerSeat exposes an inverted plan ladder', () => {
  // The commercial check. 200 Bharat seats taking 70% of India traffic beats
  // 150 Global seats taking 30% — the cheaper plan delivers MORE leads.
  const seats = { bharat: 200, global: 150 };
  const per = leadsPerSeat({ marketVolume: 10000, allocation: DEFAULT_ALLOCATION.INDIA, seats });
  assert.ok(per.bharat > per.global,
    'this assertion documents the inversion — see docs/LEAD_DISTRIBUTION_V2.md §2');
  assert.ok(5000 / per.bharat < 9000 / per.global,
    'cost per lead rises with plan price');
});

/* ── market detection ─────────────────────────────────────────────────── */

test('a verified phone outranks IP geolocation', () => {
  // The VPN case: browsing from a US IP, but the phone is +91.
  const r = resolveLeadMarket({ verifiedPhoneCountry: 'IN', ipCountry: 'US' });
  assert.strictEqual(r.market, MARKETS.INDIA);
  assert.strictEqual(r.source, 'VERIFIED_PHONE');
  assert.strictEqual(r.confidence, 'high');
});

test('an IP-only attribution is marked low confidence', () => {
  const r = resolveLeadMarket({ ipCountry: 'AE' });
  assert.strictEqual(r.market, MARKETS.INTERNATIONAL);
  assert.strictEqual(r.confidence, 'low',
    'IP-derived billing must be flaggable, not silently trusted');
});

test('no signal at all is UNKNOWN, not a guess', () => {
  const r = resolveLeadMarket({});
  assert.strictEqual(r.market, MARKETS.UNKNOWN);
});

test('an UNKNOWN visitor sees every pool rather than being guessed at', () => {
  assert.deepStrictEqual(poolsForBrowsing(MARKETS.UNKNOWN).sort(),
    ['bharat', 'global', 'international']);
  assert.deepStrictEqual(poolsForBrowsing(MARKETS.INDIA).sort(), ['bharat', 'global']);
  assert.deepStrictEqual(poolsForBrowsing(MARKETS.INTERNATIONAL).sort(), ['global', 'international']);
});

test('country is read from CDN headers, never from the client', () => {
  assert.strictEqual(countryFromEdge({ 'cloudfront-viewer-country': 'IN' }).code, 'IN');
  assert.strictEqual(countryFromEdge({ 'cf-ipcountry': 'AE' }).code, 'AE');
  // Cloudflare's "cannot tell" and Tor markers must not become a country.
  assert.strictEqual(countryFromEdge({ 'cf-ipcountry': 'XX' }).code, null);
  assert.strictEqual(countryFromEdge({ 'cf-ipcountry': 'T1' }).code, null);
  // A client-supplied header is not a source.
  assert.strictEqual(countryFromEdge({ 'x-country': 'US' }).code, null);
});

test('dialling codes resolve to the right market', () => {
  for (const [phone, cc] of [
    ['+919876543210', 'IN'], ['9876543210', 'IN'],
    ['+14155550172', 'US'], ['+442071838750', 'GB'],
    ['+971501234567', 'AE'], ['+61412345678', 'AU'], ['+97712345678', 'NP'],
  ]) {
    assert.strictEqual(countryFromPhone(phone), cc, `${phone} → expected ${cc}`);
  }
  assert.strictEqual(countryFromPhone('+9999999'), null);
  assert.strictEqual(countryFromPhone(null), null);
});

test('a longer dialling code wins over a shorter prefix', () => {
  // +971 (UAE) must not be read as +97… and fall through, and must not be
  // shadowed by a shorter code.
  assert.strictEqual(countryFromPhone('+971501234567'), 'AE');
  assert.strictEqual(countryFromPhone('+977981234567'), 'NP');
});

test('a browsing preference never becomes the lead market', () => {
  // An NRI in India choosing "serve me as international" changes what they SEE.
  // It must not decide which pandit's plan gets billed.
  const browsing = resolveBrowsingMarket({
    headers: { 'cloudfront-viewer-country': 'IN' }, selectedCountry: 'US',
  });
  assert.strictEqual(browsing.market, MARKETS.INTERNATIONAL);
  assert.strictEqual(browsing.source, 'user_selected');

  const lead = resolveLeadMarket({ verifiedPhoneCountry: 'IN', selectedCountry: 'US' });
  assert.strictEqual(lead.market, MARKETS.INDIA,
    'a display preference overrode a verified phone for billing');
});

/* ── pool integrity ───────────────────────────────────────────────────── */

test('ranking returns every pandit exactly once', () => {
  const pool = Array.from({ length: 50 }, (_, i) => pandit({ id: `p${i}`, qualifiedLeads: i }));
  const ranked = rankPool(pool, CTX);
  assert.strictEqual(ranked.length, 50);
  assert.strictEqual(new Set(ranked.map((r) => r.panditId)).size, 50);
});

test('scores stay finite with missing or null counters', () => {
  const sparse = { id: 'sparse', markets: ['INDIA'] };
  const { score, factors } = scorePandit(sparse, POOL, CTX);
  assert.ok(Number.isFinite(score));
  for (const [k, v] of Object.entries(factors)) assert.ok(Number.isFinite(v), `${k} is NaN`);
});

test('an empty pool does not divide by zero', () => {
  const { score } = scorePandit(pandit(), { size: 0, totalLeads: 0, totalExposure: 0 }, CTX);
  assert.ok(Number.isFinite(score));
});

test('a higher tier buys entitlement, not a ranking advantage', () => {
  // Plans decide WHICH POOL you are in. Inside a pool, everyone competes on
  // fairness and quality alone — otherwise the premium plan quietly outranks
  // its own poolmates and same-plan fairness is a fiction.
  const a = scorePandit(pandit({ id: 'a', tier: 'silver' }), POOL, CTX);
  const b = scorePandit(pandit({ id: 'a', tier: 'diamond' }), POOL, CTX);
  assert.strictEqual(a.score, b.score);
});

/* ────────────────────────────────────────────────────────────────────────────
 * Paging.
 *
 * selectPage originally returned only the top `pageSize` slots and ignored the
 * page number entirely, so the listing endpoint would have served page 1 again
 * for every ?page=N — with the meta cheerfully reporting page 5. These pin the
 * fix.
 * ──────────────────────────────────────────────────────────────────────────*/

/** A ranked list of n synthetic slots, in the shape selectPage consumes. */
function rankedSlots(n) {
  return Array.from({ length: n }, (_, i) => ({
    panditId: `p${i}`, score: 1 - i / n, factors: {},
  }));
}

test('page 2 returns different pandits than page 1', () => {
  const ranked = rankedSlots(60);
  const seed = sessionSeed({ sessionKey: 'visitor-a', now: NOW });
  const p1 = selectPage(ranked, { pageSize: 20, seed, page: 1 }).map((s) => s.panditId);
  const p2 = selectPage(ranked, { pageSize: 20, seed, page: 2 }).map((s) => s.panditId);

  assert.equal(p1.length, 20);
  assert.equal(p2.length, 20);
  const overlap = p2.filter((id) => p1.includes(id));
  assert.deepEqual(overlap, [], 'a pandit must not appear on two pages of one search');
});

test('paging covers the pool exactly once — nobody dropped, nobody doubled', () => {
  const ranked = rankedSlots(55);
  const seed = sessionSeed({ sessionKey: 'visitor-b', now: NOW });
  const seen = [];
  for (let page = 1; page <= 3; page += 1) {
    seen.push(...selectPage(ranked, { pageSize: 20, seed, page }).map((s) => s.panditId));
  }
  assert.equal(seen.length, 55, 'every ranked pandit is reachable by paging');
  assert.equal(new Set(seen).size, 55, 'and none of them twice');
});

test('paging past the end is empty, not a repeat of page 1', () => {
  const ranked = rankedSlots(10);
  const seed = sessionSeed({ sessionKey: 'visitor-c', now: NOW });
  assert.deepEqual(selectPage(ranked, { pageSize: 20, seed, page: 2 }), []);
});

test('page 1 is unchanged by the paging refactor — top slot still pinned', () => {
  const ranked = rankedSlots(40);
  const seed = sessionSeed({ sessionKey: 'visitor-d', now: NOW });
  const noPage = selectPage(ranked, { pageSize: 20, seed });
  const page1 = selectPage(ranked, { pageSize: 20, seed, page: 1 });
  assert.deepEqual(noPage, page1, 'omitting page must still mean page 1');
  assert.equal(page1[0].panditId, 'p0', 'the most under-served candidate keeps slot 1');
});

/* ────────────────────────────────────────────────────────────────────────────
 * Market gating at the trust boundary.
 *
 * The whole point of resolving market server-side is that a visitor cannot
 * upgrade themselves into the international pool, where the ₹15,000 pandits
 * are. These assert the client cannot.
 * ──────────────────────────────────────────────────────────────────────────*/

test('a client-supplied country is ignored — only CDN headers count', () => {
  // Everything a caller controls, all claiming the USA at once.
  const forged = countryFromEdge({
    'x-country': 'US',
    'x-forwarded-country': 'US',
    'x-geo-country': 'US',
    'x-real-country': 'US',
  });
  assert.equal(forged.code, null, 'no trusted header present means no country, not a free upgrade');
  assert.equal(forged.source, 'none');
});

test('placeholder edge values are not treated as countries', () => {
  // XX/T1/ZZ are "could not determine" from CloudFront, Cloudflare and GAE
  // respectively; the rest are malformed. All must fail closed, on EVERY
  // header — not just the one CDN we happened to special-case first.
  for (const header of ['cloudfront-viewer-country', 'cf-ipcountry', 'x-vercel-ip-country']) {
    for (const code of ['XX', 'T1', 'ZZ', 'A1', 'EU', '', '  ', 'USA', 'u', '1N', '<script>']) {
      assert.equal(
        countryFromEdge({ [header]: code }).code, null,
        `${header}: ${JSON.stringify(code)} is not a market`,
      );
    }
  }
  // A real one still works, and is normalised.
  assert.equal(countryFromEdge({ 'cf-ipcountry': ' in ' }).code, 'IN');
});

test('an unresolvable visitor is UNKNOWN, never silently INTERNATIONAL', () => {
  // Real signature: { headers, selectedCountry, user }. No signal from any of
  // the three.
  const m = resolveBrowsingMarket({ headers: {}, selectedCountry: null, user: null });
  assert.equal(m.market, MARKETS.UNKNOWN);
  assert.equal(m.source, 'none');
  assert.notEqual(m.market, MARKETS.INTERNATIONAL,
    'guessing international would hand free premium exposure to every unidentified visitor');
});

test('forged headers cannot move a visitor out of UNKNOWN', () => {
  const m = resolveBrowsingMarket({
    headers: { 'x-country': 'US', 'x-forwarded-country': 'US', 'cf-ipcountry': 'XX' },
    selectedCountry: null,
    user: null,
  });
  assert.equal(m.market, MARKETS.UNKNOWN,
    'the ₹15,000 international pool must not be reachable by setting a header');
});

test('an UNKNOWN visitor sees every pool, so nobody is excluded on a guess', () => {
  assert.deepEqual(poolsForBrowsing(MARKETS.UNKNOWN).sort(),
    ['bharat', 'global', 'international']);
  // And a resolved visitor sees exactly the plans entitled to their market.
  assert.deepEqual(poolsForBrowsing(MARKETS.INDIA).sort(), ['bharat', 'global']);
  assert.deepEqual(poolsForBrowsing(MARKETS.INTERNATIONAL).sort(), ['global', 'international']);
});

/* ────────────────────────────────────────────────────────────────────────────
 * Dev country override.
 *
 * Exists because localhost has no CDN, so the market is always UNKNOWN and
 * exposure never records — which looks exactly like a broken engine. It is a
 * header that decides which pandits a visitor sees, so the conditions under
 * which it activates matter more than the feature itself.
 * ──────────────────────────────────────────────────────────────────────────*/

const { devCountryOverride, browsingMarketFor } = require('../src/services/distribution/market');

/** Run fn with a temporary env, always restoring — a leaked env var here would
 *  silently change how every later test behaves. */
function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const DEV_HEADERS = { 'x-dev-country': 'US' };

test('dev override is off unless explicitly opted in', () => {
  withEnv({ ALLOW_DEV_GEO_HEADER: undefined, NODE_ENV: 'development' }, () => {
    assert.equal(devCountryOverride(DEV_HEADERS), null,
      'an unset opt-in must not be enough — the default has to be off');
  });
});

test('dev override NEVER activates in production, even if opted in', () => {
  withEnv({ ALLOW_DEV_GEO_HEADER: '1', NODE_ENV: 'production' }, () => {
    assert.equal(devCountryOverride(DEV_HEADERS), null,
      'a stray env var in production would let anyone pick their own pandit pool');
  });
});

test('dev override requires BOTH conditions, not just a non-production NODE_ENV', () => {
  // NODE_ENV is very often unset. "Unset" must never be enough on its own.
  withEnv({ ALLOW_DEV_GEO_HEADER: undefined, NODE_ENV: undefined }, () => {
    assert.equal(devCountryOverride(DEV_HEADERS), null);
  });
});

test('dev override works when both conditions are met', () => {
  withEnv({ ALLOW_DEV_GEO_HEADER: '1', NODE_ENV: 'development' }, () => {
    assert.equal(devCountryOverride(DEV_HEADERS), 'US');
    // And it is normalised like any other country source.
    assert.equal(devCountryOverride({ 'x-dev-country': ' in ' }), 'IN');
    assert.equal(devCountryOverride({ 'x-dev-country': 'XX' }), null);
    assert.equal(devCountryOverride({ 'x-dev-country': 'nonsense' }), null);
  });
});

test('browsingMarketFor honours the override, and is UNKNOWN on a bare localhost request', () => {
  const localReq = { headers: { host: 'localhost:4000' }, user: null };

  withEnv({ ALLOW_DEV_GEO_HEADER: undefined, NODE_ENV: 'development' }, () => {
    assert.equal(browsingMarketFor(localReq).market, MARKETS.UNKNOWN,
      'this is the behaviour that makes local exposure testing impossible without the override');
  });

  withEnv({ ALLOW_DEV_GEO_HEADER: '1', NODE_ENV: 'development' }, () => {
    const req = { headers: { host: 'localhost:4000', 'x-dev-country': 'US' }, user: null };
    const m = browsingMarketFor(req);
    assert.equal(m.market, MARKETS.INTERNATIONAL);
    assert.equal(m.source, 'dev_override', 'the source must say it was an override, not real geo');
  });
});

test('a real CDN header still beats nothing, with the override disabled', () => {
  withEnv({ ALLOW_DEV_GEO_HEADER: undefined, NODE_ENV: 'production' }, () => {
    const req = { headers: { 'cloudfront-viewer-country': 'IN' }, user: null };
    assert.equal(browsingMarketFor(req).market, MARKETS.INDIA);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * PRIORITY pool mode.
 *
 * The admin-selectable alternative to weighted share. These tests exist as much
 * to DOCUMENT what it does to the cheaper plans as to check it works — the
 * starvation is the behaviour, not a bug, and it should be impossible to change
 * this file without seeing that.
 * ──────────────────────────────────────────────────────────────────────────*/

const {
  pickPriorityBucket, selectBucket, POOL_MODE,
} = require('../src/services/distribution/rotation');

const ALLOC = {
  INDIA: { bharat: 0.70, global: 0.30 },
  INTERNATIONAL: { international: 0.70, global: 0.30 },
};
// Lower runs first: ₹15k, then ₹9k, then ₹5k.
const PRIORITIES = { international: 10, global: 20, bharat: 30 };

test('priority mode gives the top plan every request', () => {
  const available = { bharat: 200, global: 150 };
  const picked = new Set();
  for (let i = 0; i < 50; i += 1) {
    picked.add(pickPriorityBucket('INDIA', available, PRIORITIES, ALLOC));
  }
  assert.deepEqual([...picked], ['global'],
    '₹9k outranks ₹5k, so in priority mode it takes all India traffic');
});

test('priority mode STARVES lower plans — this is the documented consequence', () => {
  const available = { bharat: 200, global: 1 };   // a single ₹9k pandit
  const bucket = pickPriorityBucket('INDIA', available, PRIORITIES, ALLOC);
  assert.equal(bucket, 'global',
    'one eligible ₹9k pandit absorbs the entire market; 200 ₹5k pandits get nothing');
});

test('priority falls through when the higher plan has nobody eligible', () => {
  const available = { bharat: 200, global: 0 };
  assert.equal(pickPriorityBucket('INDIA', available, PRIORITIES, ALLOC), 'bharat',
    'an empty premium bucket must not black out the market');
});

test('an unconfigured plan sorts LAST, never first', () => {
  const available = { bharat: 10, global: 10 };
  // bharat has a priority, global does not.
  const bucket = pickPriorityBucket('INDIA', available, { bharat: 30 }, ALLOC);
  assert.equal(bucket, 'bharat',
    'a plan the admin never ordered must not silently outrank one they did');
});

test('priority ties are broken deterministically, not randomly', () => {
  const available = { bharat: 10, global: 10 };
  const tied = { bharat: 50, global: 50 };
  const first = pickPriorityBucket('INDIA', available, tied, ALLOC);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(pickPriorityBucket('INDIA', available, tied, ALLOC), first,
      'a tie must give the same answer every request, or the pool flickers');
  }
});

test('priority mode ignores the session seed entirely', () => {
  const available = { bharat: 200, global: 150 };
  const a = selectBucket({
    market: 'INDIA', availableByPlan: available, sessionSeed: 'visitor-a',
    allocation: ALLOC, mode: POOL_MODE.PRIORITY, priorities: PRIORITIES,
  });
  const b = selectBucket({
    market: 'INDIA', availableByPlan: available, sessionSeed: 'visitor-zzz',
    allocation: ALLOC, mode: POOL_MODE.PRIORITY, priorities: PRIORITIES,
  });
  assert.equal(a, b, 'priority is not a lottery — every visitor gets the same bucket');
});

test('weighted mode still splits roughly by weight after the refactor', () => {
  const available = { bharat: 200, global: 150 };
  const counts = { bharat: 0, global: 0 };
  for (let i = 0; i < 4000; i += 1) {
    const b = selectBucket({
      market: 'INDIA', availableByPlan: available, sessionSeed: `v${i}`,
      allocation: ALLOC, mode: POOL_MODE.WEIGHTED, priorities: PRIORITIES,
    });
    counts[b] += 1;
  }
  const share = counts.bharat / 4000;
  assert.ok(share > 0.66 && share < 0.74,
    `bharat should land near the configured 0.70, got ${share.toFixed(3)}`);
  assert.ok(counts.global > 0, 'weighted mode must never starve a plan completely');
});

test('selectBucket defaults to weighted when no mode is configured', () => {
  // A database without migration 18 has no pool_mode. The absence of a setting
  // must mean "carry on as before", not "switch to priority".
  const available = { bharat: 200, global: 150 };
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    seen.add(selectBucket({
      market: 'INDIA', availableByPlan: available, sessionSeed: `v${i}`, allocation: ALLOC,
    }));
  }
  assert.equal(seen.size, 2, 'both buckets should appear — that is weighted behaviour');
});

/* ────────────────────────────────────────────────────────────────────────────
 * The admin projection.
 *
 * This is the number the admin will look at before deciding what to charge, so
 * it has to be right. The strongest check is that it REPRODUCES the inversion
 * already measured by the simulator — a projection that disagrees with the
 * engine would be worse than showing nothing.
 * ──────────────────────────────────────────────────────────────────────────*/

const { project, leadsPerSeatFor } = require('../src/services/distribution/projection');

const T2P = { silver: 'bharat', gold: 'global', diamond: 'international' };
const LIVE_ENTITLEMENTS = {
  INDIA: {
    silver: { weight: 0.70, seatCap: 200, priority: 30, priceInr: 5000 },
    gold: { weight: 0.30, seatCap: 150, priority: 20, priceInr: 9000 },
  },
  INTERNATIONAL: {
    gold: { weight: 0.30, seatCap: 150, priority: 20, priceInr: 9000 },
    diamond: { weight: 0.70, seatCap: 150, priority: 10, priceInr: 15000 },
  },
};
const LIVE_SEATS = { silver: 200, gold: 150, diamond: 150 };
const LIVE_VOLUMES = { INDIA: 10000, INTERNATIONAL: 3000 };

const planFor = (p, tier) => p.plans.find((x) => x.tier === tier);

test('projection reproduces the documented ₹143 / ₹346 / ₹1,071 inversion', () => {
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });

  assert.equal(planFor(p, 'silver').rupeesPerLead, 143);
  assert.equal(planFor(p, 'gold').rupeesPerLead, 346);
  assert.equal(planFor(p, 'diamond').rupeesPerLead, 1071);

  // And the leads-per-seat figures from LEAD_DISTRIBUTION_V2.md §13.
  assert.equal(planFor(p, 'silver').leadsPerSeat, 35);
  assert.equal(planFor(p, 'gold').leadsPerSeat, 26);
  assert.equal(planFor(p, 'diamond').leadsPerSeat, 14);
});

test('the inversion is reported as an error, not left for the admin to spot', () => {
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });
  const inverted = p.warnings.filter((w) => w.code === 'ladder_inverted');
  assert.ok(inverted.length >= 1, 'a cheaper plan offering better value must be flagged');
  assert.ok(inverted.every((w) => w.level === 'error'));
});

test('cutting premium seats fixes the ladder — the actual remedy', () => {
  // The fix recommended in LEAD_DISTRIBUTION_V2.md §2: fewer seats on the
  // expensive plans, not different percentages.
  const p = project({
    entitlements: LIVE_ENTITLEMENTS,
    seats: { silver: 200, gold: 61, diamond: 20 },
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });

  const silver = planFor(p, 'silver').rupeesPerLead;
  const gold = planFor(p, 'gold').rupeesPerLead;
  const diamond = planFor(p, 'diamond').rupeesPerLead;

  assert.ok(gold <= silver * 1.1, `₹9k (₹${gold}) should be near or better than ₹5k (₹${silver})`);
  assert.ok(diamond <= silver * 1.1, `₹15k (₹${diamond}) should be near or better than ₹5k (₹${silver})`);
  assert.equal(p.warnings.filter((w) => w.code === 'ladder_inverted').length, 0,
    'with seats corrected there should be no inversion left to warn about');
});

test('priority mode projection shows the starvation, not a smoothed average', () => {
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: LIVE_VOLUMES, mode: 1, tierToPlan: T2P,
  });

  assert.equal(planFor(p, 'silver').leadsPerSeat, 0,
    '₹5k is outranked in both markets, so it gets nothing — the panel must say so');
  assert.equal(planFor(p, 'silver').rupeesPerLead, null,
    'no leads means no cost-per-lead, not Infinity');
  assert.ok(planFor(p, 'silver').receivesNothing);

  const starved = p.warnings.find((w) => w.code === 'plan_starved');
  assert.ok(starved, 'an admin must be told 200 paying pandits would receive zero leads');
  assert.match(starved.message, /200 pandit/);
});

test('a plan with no seats does not silently absorb its share', () => {
  // 30% allocated to gold, but nobody holds gold. That 30% must go to the
  // plans that exist, or the projection understates what silver receives and
  // the admin prices against a number that never happens.
  const perSeat = leadsPerSeatFor({
    volume: 10000,
    weights: { bharat: 0.70, global: 0.30 },
    seats: { bharat: 200, global: 0 },
  });
  assert.equal(perSeat.bharat, 50, 'all 10,000 leads across 200 seats');
  assert.equal(perSeat.global, 0);
});

test('seat cap is reported, never used to reduce anyone\'s leads', () => {
  // 250 pandits holding a 200-seat plan.
  const p = project({
    entitlements: LIVE_ENTITLEMENTS,
    seats: { silver: 250, gold: 150, diamond: 150 },
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });
  const silver = planFor(p, 'silver');

  assert.equal(silver.seatsHeld, 250);
  assert.equal(silver.seatCap, 200);
  assert.ok(silver.oversold);
  // Divided by 250, the people who actually paid — NOT capped at 200, which
  // would mean 50 pandits were being served nothing.
  assert.equal(silver.leadsPerSeat, 28, '10,000 × 0.70 ÷ 250 = 28');
  assert.ok(p.warnings.some((w) => w.code === 'oversold'));
});

test('zero traffic produces no leads and no divide-by-zero', () => {
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: { INDIA: 0, INTERNATIONAL: 0 }, mode: 0, tierToPlan: T2P,
  });
  for (const plan of p.plans) {
    assert.equal(plan.leadsPerSeat, 0);
    assert.equal(plan.rupeesPerLead, null);
    assert.ok(Number.isFinite(plan.leadsPerSeat));
  }
});

test('a multi-market plan is judged on BOTH markets together', () => {
  // Gold earns from India AND International. Counting one market alone is how
  // the ladder was missed in the first place.
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });
  const gold = planFor(p, 'gold');
  const india = (10000 * 0.30) / 150;          // 20
  const intl = (3000 * 0.30 / (0.30 + 0.70)) / 150;  // 6
  assert.equal(gold.leadsPerSeat, Math.round((india + intl) * 100) / 100);
  assert.equal(gold.leadsPerSeat, 26);
});

test('a near-parity ladder is not flagged — false alarms train admins to ignore warnings', () => {
  // ₹143 / ₹141 / ₹143 is what the recommended seat fix produces. A 1.4% gap
  // is rounding, not an inverted ladder.
  const p = project({
    entitlements: LIVE_ENTITLEMENTS,
    seats: { silver: 200, gold: 61, diamond: 20 },
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });
  assert.equal(p.warnings.filter((w) => w.code === 'ladder_inverted').length, 0);
});

test('but a real inversion is still caught, and quantified', () => {
  const p = project({
    entitlements: LIVE_ENTITLEMENTS, seats: LIVE_SEATS,
    volumes: LIVE_VOLUMES, mode: 0, tierToPlan: T2P,
  });
  const w = p.warnings.find((x) => x.code === 'ladder_inverted');
  assert.ok(w, '₹346 vs ₹143 is a 142% gap and must be flagged');
  assert.match(w.message, /% cheaper/, 'the admin should see how big the gap is');
});

/* ────────────────────────────────────────────────────────────────────────────
 * Daily cap — actually excluded from the page, not merely ranked last.
 *
 * Found by the audit trace, not by these tests. Scoring a capped pandit −1000
 * puts them last, which is enough in a 500-pandit pool (rank 500 never reaches
 * a band of 60) but does nothing in a small one: at a six-pandit temple the
 * band covered everyone, rotation shuffled them back up, and a capped pandit
 * was measured on 82% of first pages — still collecting contacts after hitting
 * their limit.
 * ──────────────────────────────────────────────────────────────────────────*/

function cappedPool(size, cappedIds = ['CAPPED']) {
  return Array.from({ length: size }, (_, i) => {
    const id = i < cappedIds.length ? cappedIds[i] : `P${i}`;
    return {
      id,
      qualifiedLeads: 5,
      weightedExposure: 30,
      todayLeads: cappedIds.includes(id) ? 5 : 0,
      isActive: true, isVerified: true, subscriptionActive: true, isAvailable: true,
      whatsapp: '9', markets: ['INDIA'],
    };
  });
}

function pagesContaining(pool, id, { pageSize = 5, visitors = 200 } = {}) {
  let hits = 0;
  for (let i = 0; i < visitors; i += 1) {
    const ranked = rankPool(pool, { market: 'INDIA', sessionKey: `v${i}`, now: NOW }, DEFAULTS);
    const seed = sessionSeed({ sessionKey: `v${i}`, now: NOW });
    if (selectPage(ranked, { pageSize, rotationDepth: 3, seed, page: 1 })
      .some((s) => s.panditId === id)) hits += 1;
  }
  return hits;
}

test('a capped pandit does not appear on page one in a SMALL pool', () => {
  // The regression. Before the fix this was 164/200.
  assert.equal(pagesContaining(cappedPool(6), 'CAPPED'), 0,
    'the daily cap claims to be a hard exclusion — in a small pool it was not');
});

test('a capped pandit does not appear on page one in a large pool either', () => {
  assert.equal(pagesContaining(cappedPool(40), 'CAPPED'), 0);
});

test('capped pandits still show rather than leaving the page empty', () => {
  // A temple where every pandit has hit their cap. Enforcing the cap perfectly
  // here would mean showing the devotee nobody at all.
  const pool = cappedPool(3, ['C1', 'C2', 'C3']);
  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'x', now: NOW }, DEFAULTS);
  const page = selectPage(ranked, {
    pageSize: 5, rotationDepth: 3, seed: sessionSeed({ sessionKey: 'x', now: NOW }), page: 1,
  });
  assert.equal(page.length, 3, 'a devotee finding somebody beats enforcing a billing cap perfectly');
});

test('capped pandits sort below every uncapped one when both are shown', () => {
  // Two uncapped, three capped, page of 5 — everyone fits, so order matters.
  const pool = [...cappedPool(2, []), ...cappedPool(3, ['C1', 'C2', 'C3'])];
  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'y', now: NOW }, DEFAULTS);
  const page = selectPage(ranked, {
    pageSize: 5, rotationDepth: 3, seed: sessionSeed({ sessionKey: 'y', now: NOW }), page: 1,
  });
  const firstCapped = page.findIndex((s) => String(s.panditId).startsWith('C'));
  const lastUncapped = page.map((s) => String(s.panditId).startsWith('C')).lastIndexOf(false);
  assert.ok(firstCapped > lastUncapped,
    'every uncapped pandit must come before every capped one');
});

test('paging still covers everyone exactly once with capped pandits present', () => {
  const pool = cappedPool(12, ['C1', 'C2']);
  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'z', now: NOW }, DEFAULTS);
  const seed = sessionSeed({ sessionKey: 'z', now: NOW });
  const seen = [];
  for (let page = 1; page <= 3; page += 1) {
    seen.push(...selectPage(ranked, { pageSize: 5, rotationDepth: 3, seed, page }).map((s) => s.panditId));
  }
  assert.equal(seen.length, 12, 'holding capped pandits back must not drop them from paging');
  assert.equal(new Set(seen).size, 12, 'and must not duplicate anyone');
});

/* ── Phase 3.1 — bounded refresh-generation rotation ─────────────────────
 *
 * A same-user refresh must be able to produce a controlled, DIFFERENT page,
 * without becoming an unbounded random reshuffle and without letting a
 * client farm unlimited distinct rankings by sending an ever-growing
 * refreshGeneration.
 * ──────────────────────────────────────────────────────────────────────── */

test('clampRefreshGeneration bounds and cycles an arbitrary client value', () => {
  assert.equal(clampRefreshGeneration(0), 0);
  assert.equal(clampRefreshGeneration(1), 1);
  assert.equal(clampRefreshGeneration(MAX_REFRESH_GENERATIONS - 1), MAX_REFRESH_GENERATIONS - 1);
  assert.equal(clampRefreshGeneration(MAX_REFRESH_GENERATIONS), 0, 'cycles back to 0 at the bound');
  assert.equal(clampRefreshGeneration(MAX_REFRESH_GENERATIONS + 2), 2);
  assert.equal(clampRefreshGeneration(999999999), 999999999 % MAX_REFRESH_GENERATIONS,
    'an attacker sending a huge counter still lands inside the bound');
  assert.equal(clampRefreshGeneration(-5), 0, 'negative input is not a way to escape the bound either');
  assert.equal(clampRefreshGeneration(NaN), 0);
  assert.equal(clampRefreshGeneration(undefined), 0);
});

test('rotationSeed at generation 0 is byte-for-byte identical to sessionSeed — first load is unchanged', () => {
  const inputs = { sessionKey: 's1', templeId: 't1', serviceId: 'sv1', now: NOW };
  assert.equal(rotationSeed({ ...inputs, refreshGeneration: 0 }), sessionSeed(inputs));
  assert.equal(rotationSeed(inputs), sessionSeed(inputs), 'omitting refreshGeneration also defaults to generation 0');
});

test('rotationSeed differs by generation, and is deterministic for the same generation', () => {
  const inputs = { sessionKey: 's1', templeId: 't1', serviceId: 'sv1', now: NOW };
  const seeds = Array.from({ length: MAX_REFRESH_GENERATIONS }, (_, g) => rotationSeed({ ...inputs, refreshGeneration: g }));
  assert.equal(new Set(seeds).size, MAX_REFRESH_GENERATIONS, 'every generation in range gets a distinct seed');
  assert.equal(rotationSeed({ ...inputs, refreshGeneration: 2 }), rotationSeed({ ...inputs, refreshGeneration: 2 }),
    'same inputs, same generation -> same seed, every time');
  assert.equal(rotationSeed({ ...inputs, refreshGeneration: MAX_REFRESH_GENERATIONS }), seeds[0],
    'a generation at the bound reproduces generation 0\'s seed, not a new one');
});

function bigPool(size) {
  return Array.from({ length: size }, (_, i) => pandit({
    id: `B${i}`, qualifiedLeads: 5 + (i % 7), weightedExposure: 40 + (i % 11) * 3, todayLeads: 0,
  }));
}

test('selectOrder pins the top-of-band candidate to slot 1 regardless of seed when pinTop is true (default, generation 0)', () => {
  const ranked = rankPool(bigPool(40), { market: 'INDIA', sessionKey: 'pin-test', now: NOW }, DEFAULTS);
  const expectedTop = ranked[0].panditId;
  for (let g = 0; g < MAX_REFRESH_GENERATIONS; g += 1) {
    const seed = rotationSeed({ sessionKey: 'pin-test', now: NOW, refreshGeneration: g });
    const page = selectOrder(ranked, { pageSize: 10, rotationDepth: 3, seed }); // pinTop defaults true
    assert.equal(page[0].panditId, expectedTop, `generation ${g} must still guarantee the top-scored candidate at slot 1`);
  }
});

test('selectOrder lets slot 1 rotate too when pinTop is false (generation 1+) — still only within the band', () => {
  const ranked = rankPool(bigPool(40), { market: 'INDIA', sessionKey: 'unpin-test', now: NOW }, DEFAULTS);
  const bandIds = new Set(ranked.slice(0, 30).map((r) => r.panditId)); // pageSize 10 * rotationDepth 3
  const slot1s = new Set();
  for (let g = 1; g < MAX_REFRESH_GENERATIONS; g += 1) {
    const seed = rotationSeed({ sessionKey: 'unpin-test', now: NOW, refreshGeneration: g });
    const page = selectOrder(ranked, { pageSize: 10, rotationDepth: 3, seed, pinTop: false });
    slot1s.add(page[0].panditId);
    assert.ok(bandIds.has(page[0].panditId), 'slot 1 must still come from the comparable band, never from outside it');
  }
  assert.ok(slot1s.size > 1, 'across refresh generations slot 1 should actually vary, not stay pinned forever');
});

test('a same-visitor refresh sequence is bounded: never more than MAX_REFRESH_GENERATIONS distinct pages', () => {
  const ranked = rankPool(bigPool(60), { market: 'INDIA', sessionKey: 'bound-test', now: NOW }, DEFAULTS);
  const seen = new Set();
  for (let rg = 0; rg < 3 * MAX_REFRESH_GENERATIONS; rg += 1) {
    const generation = clampRefreshGeneration(rg);
    const seed = rotationSeed({ sessionKey: 'bound-test', now: NOW, refreshGeneration: rg });
    const page = selectPage(ranked, { pageSize: 8, rotationDepth: 3, seed, page: 1, pinTop: generation === 0 });
    seen.add(page.map((s) => s.panditId).join(','));
  }
  assert.ok(seen.size <= MAX_REFRESH_GENERATIONS,
    `an unbounded refreshGeneration counter must not mint more than ${MAX_REFRESH_GENERATIONS} distinct pages, got ${seen.size}`);
});

test('a capped pandit still never reaches the rotating band even when pinTop is false', () => {
  const pool = cappedPool(30, ['CAPPED']);
  const ranked = rankPool(pool, { market: 'INDIA', sessionKey: 'capped-refresh', now: NOW }, DEFAULTS);
  for (let g = 1; g < MAX_REFRESH_GENERATIONS; g += 1) {
    const seed = rotationSeed({ sessionKey: 'capped-refresh', now: NOW, refreshGeneration: g });
    const page = selectPage(ranked, { pageSize: 5, rotationDepth: 3, seed, page: 1, pinTop: false });
    assert.ok(!page.slice(0, 5).some((s) => s.panditId === 'CAPPED') || page.length < 5,
      'a daily-capped pandit rotating "into slot 1" must not mean it jumps ahead of uncapped pandits');
  }
});

test('small pools cannot fake refresh diversity: 2 candidates never produce more than 2 distinct top-1s', () => {
  const ranked = rankPool(bigPool(2), { market: 'INDIA', sessionKey: 'small-pool', now: NOW }, DEFAULTS);
  const top1s = new Set();
  for (let g = 0; g < MAX_REFRESH_GENERATIONS; g += 1) {
    const seed = rotationSeed({ sessionKey: 'small-pool', now: NOW, refreshGeneration: g });
    const page = selectOrder(ranked, { pageSize: 5, rotationDepth: 3, seed, pinTop: g === 0 });
    top1s.add(page[0].panditId);
  }
  assert.ok(top1s.size <= 2, 'refresh diversity is bounded by how many alternatives actually exist');
});

/* ── Phase 3.1 — CloudFront-ready geo resolution ──────────────────────────
 *
 * market.js must stay vendor-agnostic (CloudFront is only one of several
 * recognised sources) while letting ops add one more trusted header, or shut
 * off edge-header trust entirely, via env vars — without a code change.
 * ──────────────────────────────────────────────────────────────────────── */

/** Run fn with a temporary env var, restoring whatever was there before —
 *  even on failure, so one test's env mutation can never leak into the next. */
function withEnv(overrides, fn) {
  const prev = {};
  for (const k of Object.keys(overrides)) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('known CDN headers resolve with zero configuration', () => {
  withEnv({ GEO_COUNTRY_HEADER: undefined, TRUST_CDN_GEO: undefined }, () => {
    assert.deepEqual(countryFromEdge({ 'cloudfront-viewer-country': 'IN' }), { code: 'IN', source: 'cloudfront' });
    assert.deepEqual(countryFromEdge({ 'cf-ipcountry': 'US' }), { code: 'US', source: 'cloudflare' });
  });
});

test('GEO_COUNTRY_HEADER adds a trusted header without a code change, and it wins over the built-in list', () => {
  withEnv({ GEO_COUNTRY_HEADER: 'x-lb-country' }, () => {
    assert.deepEqual(
      countryFromEdge({ 'x-lb-country': 'GB', 'cf-ipcountry': 'IN' }),
      { code: 'GB', source: 'configured' },
      'the configured header is tried first',
    );
    assert.deepEqual(
      countryFromEdge({ 'cf-ipcountry': 'IN' }),
      { code: 'IN', source: 'cloudflare' },
      'still falls through to the built-in vendor list when the configured header is absent',
    );
  });
});

test('TRUST_CDN_GEO=false is a total kill switch, even for a header that would otherwise be trusted', () => {
  withEnv({ TRUST_CDN_GEO: 'false' }, () => {
    assert.deepEqual(
      countryFromEdge({ 'cloudfront-viewer-country': 'IN' }),
      { code: null, source: 'none' },
    );
  });
});

test('DEV_COUNTRY_OVERRIDE resolves a market without needing a per-request header', () => {
  withEnv({ NODE_ENV: 'development', DEV_COUNTRY_OVERRIDE: 'IN', ALLOW_DEV_GEO_HEADER: undefined }, () => {
    assert.equal(devCountryOverride({}), 'IN');
  });
  withEnv({ NODE_ENV: 'development', DEV_COUNTRY_OVERRIDE: 'US', ALLOW_DEV_GEO_HEADER: undefined }, () => {
    assert.equal(devCountryOverride({}), 'US');
  });
  withEnv({ NODE_ENV: 'development', DEV_COUNTRY_OVERRIDE: undefined, ALLOW_DEV_GEO_HEADER: undefined }, () => {
    assert.equal(devCountryOverride({}), null, 'unset stays UNKNOWN — the honest local-dev default');
  });
});

test('the per-request X-Dev-Country header wins over the static DEV_COUNTRY_OVERRIDE env var when both are set', () => {
  withEnv({ NODE_ENV: 'development', DEV_COUNTRY_OVERRIDE: 'US', ALLOW_DEV_GEO_HEADER: '1' }, () => {
    assert.equal(devCountryOverride({ 'x-dev-country': 'IN' }), 'IN');
    assert.equal(devCountryOverride({}), 'US', 'falls back to the env var when no header is sent');
  });
});

test('both dev overrides are ignored in production, no matter how they are set', () => {
  withEnv({ NODE_ENV: 'production', DEV_COUNTRY_OVERRIDE: 'IN', ALLOW_DEV_GEO_HEADER: '1' }, () => {
    assert.equal(devCountryOverride({ 'x-dev-country': 'US' }), null,
      'production must never honour a client-controllable market override, header or env');
  });
});

test('browsingMarketFor stays vendor-agnostic: a spoofed application header alone (no CDN, no override) resolves UNKNOWN', () => {
  withEnv({ NODE_ENV: 'production', ALLOW_DEV_GEO_HEADER: undefined, DEV_COUNTRY_OVERRIDE: undefined }, () => {
    const req = { headers: { 'x-country': 'US', 'x-dev-country': 'US' } }; // not a real edge header
    const result = resolveBrowsingMarket({ headers: req.headers });
    assert.equal(result.market, 'UNKNOWN');
    assert.equal(result.source, 'none');
  });
});
