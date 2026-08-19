#!/usr/bin/env node
/**
 * Phase 2F — performance & query-count benchmark for the distribution engine.
 *
 *   node scripts/benchmark-distribution.js
 *
 * Three separate measurements, kept separate on purpose (Section 37: "where
 * possible separate DB time from application CPU time"):
 *
 *   1. Pure ranking computation (rankPool + selectPage), no DB, at synthetic
 *      pool sizes up to 10,000 — isolates the ALGORITHM's own scaling.
 *   2. The real candidate SQL query (fetchCandidates) against the live
 *      Docker Postgres, at whatever scale the seeded data actually has.
 *   3. engine.distribute() end-to-end (DB read + compute), with an
 *      instrumented query counter to prove there is no N+1.
 *
 * Honest about scale (Section 75): the seeded database has ~1,049 pandits
 * total, ~500 at the flagship temple. There is no 5,000-real-candidate
 * dataset to query against without synthetic seeding beyond this task's
 * scope — measurement 1 covers the algorithmic-scaling question up to
 * 10,000 in memory; measurements 2-3 are honest about testing the DB at the
 * scale that actually exists.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/db');
const { rankPool, positionWeight, DEFAULTS } = require('../src/services/distribution/fairness');
const { sessionSeed, selectPage } = require('../src/services/distribution/rotation');
const distRepo = require('../src/repositories/distribution.repository');
const engine = require('../src/services/distribution/engine');

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function stats(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.50), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1], min: sorted[0],
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

function printStats(label, s, n) {
  console.log(
    `  ${label.padEnd(38)} n=${String(n).padStart(6)}  `
    + `p50 ${s.p50.toFixed(2).padStart(7)}ms  p95 ${s.p95.toFixed(2).padStart(7)}ms  `
    + `p99 ${s.p99.toFixed(2).padStart(7)}ms  max ${s.max.toFixed(2).padStart(7)}ms`,
  );
}

/* ── 1. pure ranking computation, synthetic scale ────────────────────────── */

function synthPool(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: `p${i}`, tier: 'gold', markets: ['INDIA'],
      isActive: true, isVerified: true, subscriptionActive: true, isAvailable: true,
      whatsapp: '9999999999', temples: ['t1'], services: ['s1'],
      photoUrl: 'x', bio: 'b', videoUrl: 'v', specializations: ['x'], videoKycCompleted: true,
      experienceYears: 5, rating: 4.5, reviewCount: 50, joinedAt: '2025-01-01',
      qualifiedLeads: Math.floor(Math.random() * 20), weightedExposure: Math.random() * 500, todayLeads: 0,
    });
  }
  return out;
}

function benchmarkRankingComputation() {
  console.log('\n═══ 1. Pure ranking computation (no DB) ═══\n');
  for (const n of [500, 1000, 5000, 10000]) {
    const pool_ = synthPool(n);
    const samples = [];
    for (let trial = 0; trial < 30; trial += 1) {
      const t0 = process.hrtime.bigint();
      const ranked = rankPool(pool_, { market: 'INDIA', sessionKey: `s${trial}`, templeId: 't1', now: Date.now() }, DEFAULTS);
      const seed = sessionSeed({ sessionKey: `s${trial}`, templeId: 't1', serviceId: 's1', now: Date.now() });
      selectPage(ranked, { pageSize: 20, rotationDepth: 3, seed, page: 1 });
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
    }
    printStats(`rankPool + selectPage, ${n} candidates`, stats(samples), samples.length);
  }
}

/* ── 2. real candidate SQL, live DB ──────────────────────────────────────── */

async function benchmarkCandidateQuery() {
  console.log('\n═══ 2. fetchCandidates() — real SQL, live Postgres ═══\n');

  const { rows: templeRows } = await query(`SELECT id, name FROM temples WHERE slug = 'maa-baglamukhi'`);
  const templeId = templeRows[0]?.id || null;
  console.log(`  Flagship temple: ${templeRows[0]?.name || '(not found)'} — scoping candidate query to it`);

  for (const [label, opts] of [
    ['temple-scoped (Nalkheda, ~500 pandits)', { templeId, market: 'INDIA', windowDays: 14 }],
    ['platform-wide (no temple filter, ~1,049 pandits)', { templeId: null, market: 'INDIA', windowDays: 14 }],
  ]) {
    const samples = [];
    let rowCount = 0;
    for (let trial = 0; trial < 20; trial += 1) {
      const t0 = process.hrtime.bigint();
      const rows = await distRepo.fetchCandidates(opts);
      const t1 = process.hrtime.bigint();
      rowCount = rows.length;
      samples.push(Number(t1 - t0) / 1e6);
    }
    printStats(`${label} [${rowCount} rows]`, stats(samples), samples.length);
  }
}

/* ── 3. engine.distribute() end-to-end, with query-count instrumentation ─── */

async function benchmarkEndToEnd() {
  console.log('\n═══ 3. engine.distribute() end-to-end (DB read + rank + page) ═══\n');

  const { rows: templeRows } = await query(`SELECT id FROM temples WHERE slug = 'maa-baglamukhi'`);
  const templeId = templeRows[0]?.id || null;

  // Instrument the pool to count queries for exactly one representative call
  // — proves "small bounded query count", not "1 query per pandit" (Section 38).
  let queryCount = 0;
  const originalQuery = pool.query.bind(pool);
  pool.query = (...args) => { queryCount += 1; return originalQuery(...args); };
  await engine.distribute({
    market: 'INDIA', templeId, sessionKey: 'bench-query-count', pageSize: 20, page: 1, record: false,
  });
  pool.query = originalQuery;
  console.log(`  Query count for ONE distribute() call (temple-scoped, 500-pandit pool): ${queryCount}`);
  console.log(`  ${queryCount <= 5 ? 'PASS' : 'FLAG'} — bounded, independent of candidate count (not 1-query-per-pandit)`);

  const samples = [];
  for (let trial = 0; trial < 30; trial += 1) {
    const t0 = process.hrtime.bigint();
    await engine.distribute({
      market: 'INDIA', templeId, sessionKey: `bench-e2e-${trial}`, pageSize: 20, page: 1, record: false,
    });
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  printStats('distribute(), record:false, 500-pandit pool', stats(samples), samples.length);

  const samplesRec = [];
  for (let trial = 0; trial < 30; trial += 1) {
    const t0 = process.hrtime.bigint();
    await engine.distribute({
      market: 'INDIA', templeId, sessionKey: `bench-e2e-rec-${trial}`, pageSize: 20, page: 1, record: true,
    });
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
    samplesRec.push(Number(t1 - t0) / 1e6);
  }
  printStats('distribute(), record:true (exposure write not awaited)', stats(samplesRec), samplesRec.length);
}

/* ── 4. EXPLAIN ANALYZE on the candidate query ───────────────────────────── */

async function explainCandidateQuery() {
  console.log('\n═══ 4. EXPLAIN ANALYZE — the candidate query\'s actual plan ═══\n');
  const { rows: templeRows } = await query(`SELECT id FROM temples WHERE slug = 'maa-baglamukhi'`);
  const templeId = templeRows[0]?.id || null;

  const CANDIDATE_SQL_EXPLAIN = `
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.id, p.current_tier,
  (SELECT COUNT(*)::int FROM qualified_leads ql WHERE ql.pandit_id = p.id AND ql.market = $2::lead_market
    AND ($3::uuid IS NULL OR ql.temple_id = $3::uuid) AND ql.created_at > NOW() - ($4 || ' days')::interval) AS qualified_leads,
  COALESCE((SELECT SUM(pe.position_weight) FROM pandit_exposure pe WHERE pe.pandit_id = p.id AND pe.market = $2::lead_market
    AND ($3::uuid IS NULL OR pe.temple_id = $3::uuid) AND pe.created_at > NOW() - ($4 || ' days')::interval), 0)::float AS weighted_exposure
FROM pandits p
JOIN users u ON u.id = p.user_id
WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
  AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM pandit_temples pt WHERE pt.pandit_id = p.id AND pt.temple_id = $1::uuid AND pt.is_active))
LIMIT 2000`;
  const { rows } = await query(CANDIDATE_SQL_EXPLAIN, [templeId, 'INDIA', templeId, '14']);
  for (const r of rows) console.log(`  ${r['QUERY PLAN']}`);
}

async function main() {
  benchmarkRankingComputation();
  await benchmarkCandidateQuery();
  await benchmarkEndToEnd();
  await explainCandidateQuery();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
