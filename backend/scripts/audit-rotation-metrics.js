#!/usr/bin/env node
/**
 * Rotation metric integrity audit — live database, real candidates.
 *
 *   node scripts/audit-rotation-metrics.js
 *   node scripts/audit-rotation-metrics.js --market INDIA --visitors 100
 *   node scripts/audit-rotation-metrics.js --temple nalkheda --service havan-yagna
 *
 * Phase 3's audit reported "Eligible pool size: 173" alongside "Unique
 * Pandits appearing across 100 visitors' top-10: 285" — impossible if both
 * numbers describe the same candidate universe, because 285 > 173.
 *
 * They did not describe the same universe. 173 was one session's PLAN-BUCKET
 * pool size (bharat OR global — the engine partitions eligible candidates
 * between buckets and a single request only ever draws from one). 285 was
 * the union of many different sessions, some of which land in the bharat
 * bucket and some in the global bucket. Two different sessions can show
 * pandits from two disjoint pools; a single request cannot.
 *
 * This script reports the three numbers as what they actually are — eligible
 * PER REQUEST (one bucket), eligible UNION (every bucket that market can
 * draw from), and unique SELECTED (across many visitors) — and asserts the
 * only invariant that is actually true:
 *
 *   selectedUnique.size <= eligibleUnion.size
 *
 * never against a single request's bucket size, which by design will
 * usually be smaller than what many different visitors collectively see.
 */

const engine = require('../src/services/distribution/engine');
const distributionRepo = require('../src/repositories/distribution.repository');
const { eligibilityFailure, DEFAULTS } = require('../src/services/distribution/fairness');
const { query } = require('../src/config/db');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MARKET = (arg('market', 'INDIA') || 'INDIA').toUpperCase();
const VISITORS = Number(arg('visitors', 100));
const TEMPLE_SLUG = arg('temple', null);
const SERVICE_SLUG = arg('service', null);

async function resolveTempleId(slug) {
  if (!slug) return null;
  const { rows } = await query('SELECT id FROM temples WHERE slug = $1', [slug]);
  return rows[0]?.id || null;
}
async function resolveServiceId(slug) {
  if (!slug) return null;
  const { rows } = await query('SELECT id FROM services WHERE slug = $1', [slug]);
  return rows[0]?.id || null;
}

function fail(msg) {
  console.error(`\n  INVARIANT VIOLATED: ${msg}\n`);
  process.exitCode = 1;
}

async function main() {
  const templeId = await resolveTempleId(TEMPLE_SLUG);
  const serviceId = await resolveServiceId(SERVICE_SLUG);
  if (TEMPLE_SLUG && !templeId) throw new Error(`temple "${TEMPLE_SLUG}" not found`);
  if (SERVICE_SLUG && !serviceId) throw new Error(`service "${SERVICE_SLUG}" not found`);

  console.log(`\n=== Rotation metric audit — market ${MARKET}${TEMPLE_SLUG ? `, temple ${TEMPLE_SLUG}` : ''}${SERVICE_SLUG ? `, service ${SERVICE_SLUG}` : ''}, ${VISITORS} visitors ===\n`);

  /* ── candidate-pool semantics, computed explicitly, not inferred ──────── */
  const candidates = await distributionRepo.fetchCandidates({
    templeId, serviceId, market: MARKET, windowDays: DEFAULTS.windowDays,
  });
  const eligibleUnion = new Set(
    candidates
      .filter((p) => !eligibilityFailure(p, { market: MARKET, templeId, serviceId }, DEFAULTS))
      .map((p) => p.id),
  );
  const eligibleByTier = {};
  for (const p of candidates) {
    if (eligibilityFailure(p, { market: MARKET, templeId, serviceId }, DEFAULTS)) continue;
    eligibleByTier[p.tier] = (eligibleByTier[p.tier] || 0) + 1;
  }

  console.log('Candidate-pool semantics (Part X — reported distinctly, never conflated):');
  console.log(`  eligible union (every plan bucket this market can draw from): ${eligibleUnion.size}`);
  console.log(`  eligible by plan tier (each tier is its own disjoint bucket): ${JSON.stringify(eligibleByTier)}`);

  const probe = await engine.distribute({
    market: MARKET, templeId, serviceId, sessionKey: 'audit-probe', pageSize: 1000, record: false,
  });
  // probe.eligible is ALREADY the true cross-bucket union (engine.js computes
  // it before the bucket split) — probe.poolSize is what a single request's
  // page is actually cut from, ONE bucket only. Phase 3's script printed the
  // latter (`order.length`, i.e. poolSize) under the label "pool size" and it
  // was then read as if it were the former.
  console.log(`  eligible PER REQUEST (one probe session, bucket "${probe.pool}"): ${probe.poolSize}`);
  console.log(`  (probe.eligible, the same request's cross-bucket union, for comparison: ${probe.eligible})`);
  console.log('  ^ "pool size" in Phase 3\'s script meant the bucket-filtered figure — it is one bucket, not the union.\n');

  /* ── N visitors, global order (no temple/service unless passed above) ─── */
  const slot1Counts = new Map();
  const selectedUnique = new Set();
  const orderings = new Set();
  const top10sForFirst10 = [];
  for (let i = 0; i < VISITORS; i += 1) {
    const r = await engine.distribute({
      market: MARKET, templeId, serviceId, sessionKey: `audit-visitor-${i}`, pageSize: 10, record: false,
    });
    const slugs = r.pandits.map((p) => p.slug);
    const ids = r.pandits.map((p) => p.id);
    orderings.add(slugs.join(','));
    ids.forEach((id) => selectedUnique.add(id));
    if (ids[0]) slot1Counts.set(r.pandits[0].id, (slot1Counts.get(r.pandits[0].id) || 0) + 1);
    if (i < 10) top10sForFirst10.push(slugs);
  }

  const sortedSlot1 = [...slot1Counts.entries()].sort((a, b) => b[1] - a[1]);
  const top5Share = sortedSlot1.slice(0, 5).reduce((a, [, c]) => a + c, 0);

  console.log('Corrected metrics (Part Y):');
  console.log(`  eligible union:                          ${eligibleUnion.size}`);
  console.log(`  unique selected across ${VISITORS} visitors' top-10:  ${selectedUnique.size}`);
  console.log(`  unique slot-1 pandits:                   ${slot1Counts.size}`);
  console.log(`  top pandit's slot-1 share:                ${sortedSlot1[0]?.[1] ?? 0}/${VISITORS}`);
  console.log(`  top-5 combined slot-1 share:               ${top5Share}/${VISITORS}`);
  console.log(`  distinct complete top-10 orderings:      ${orderings.size}/${VISITORS}`);

  /* ── mandatory invariants (Part W) ─────────────────────────────────────── */
  console.log('\nInvariants:');
  if (selectedUnique.size <= eligibleUnion.size) {
    console.log(`  PASS  selectedUnique.size (${selectedUnique.size}) <= eligibleUnion.size (${eligibleUnion.size})`);
  } else {
    fail(`selectedUnique.size (${selectedUnique.size}) > eligibleUnion.size (${eligibleUnion.size}) — impossible, someone was shown who was never eligible`);
  }
  if (slot1Counts.size <= eligibleUnion.size) {
    console.log(`  PASS  slot1Unique.size (${slot1Counts.size}) <= eligibleUnion.size (${eligibleUnion.size})`);
  } else {
    fail(`slot1Unique.size (${slot1Counts.size}) > eligibleUnion.size (${eligibleUnion.size})`);
  }
  const everySelectedIsEligible = [...selectedUnique].every((id) => eligibleUnion.has(id));
  if (everySelectedIsEligible) {
    console.log('  PASS  every selected id is a member of eligibleUnion');
  } else {
    fail('a selected pandit was not a member of eligibleUnion — an eligibility gate was bypassed');
  }

  console.log(`\nFirst 10 visitors, top-5 (for spot-checking):`);
  top10sForFirst10.forEach((t, i) => console.log(`  visitor ${i}: [${t.slice(0, 5).join(', ')}, ...]`));

  console.log(process.exitCode === 1 ? '\nRESULT: FAIL — see invariant violation(s) above\n' : '\nRESULT: PASS\n');
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
