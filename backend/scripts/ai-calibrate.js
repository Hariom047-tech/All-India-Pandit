#!/usr/bin/env node
/**
 * Measure retrieval quality on labelled data, and derive the thresholds from
 * what is measured rather than from anyone's intuition.
 *
 *   npm run ai:calibrate              full run (embeds ~180 queries, ~$0.001)
 *   npm run ai:calibrate -- --quick   2 phrases per problem
 *   npm run ai:calibrate -- --apply   write the recommended values to ai_ranking_config
 *
 * Ground truth comes free: every record in problems-solutions.json carries a
 * `userMightSay` array — real phrasings a devotee would type for THAT problem.
 * So each phrase is a query whose correct answer we already know, giving ~180
 * labelled pairs with no annotation work.
 *
 * Reports recall@1/@3/@5 and, critically, the score distribution for correct
 * vs incorrect matches — which is what a confidence threshold should actually
 * be set from. The first threshold on this system was 0.60 against raw cosine,
 * which nothing could reach; every query came back "low confidence".
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../src/config/db');
const { retrieve } = require('../src/services/ai/retrieval.service');

const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const APPLY = argv.includes('--apply');

const KB = path.join(__dirname, '..', 'src', 'data', 'knowledge', 'custom', 'problems-solutions.json');

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const quantile = (sorted, q) => (sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0);

function stats(values) {
  if (!values.length) return { n: 0, min: 0, p25: 0, median: 0, p75: 0, max: 0, mean: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}
const row = (label, st) => `  ${label.padEnd(22)} n=${String(st.n).padStart(4)}  `
  + `min ${st.min.toFixed(3)}  p25 ${st.p25.toFixed(3)}  med ${st.median.toFixed(3)}  `
  + `p75 ${st.p75.toFixed(3)}  max ${st.max.toFixed(3)}`;

async function main() {
  const { rows: live } = await query(
    `SELECT COUNT(*)::int AS n FROM ai_knowledge_chunks
      WHERE is_retrievable AND embedding IS NOT NULL`).catch(() => ({ rows: [{ n: 0 }] }));
  if (!live[0].n) {
    console.error('The index is empty. Run:  npm run ai:ingest');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set — queries must be embedded to be evaluated.');
    process.exit(1);
  }

  const problems = JSON.parse(fs.readFileSync(KB, 'utf8'));
  const cases = [];
  for (const p of problems) {
    const phrases = (p.userMightSay || []).slice(0, QUICK ? 2 : 99);
    for (const phrase of phrases) {
      cases.push({ phrase, expectedId: p.id, expectedCategory: p.problemCategory });
    }
  }

  console.log(`Evaluating ${cases.length} labelled phrases from problems-solutions.json`);
  console.log(`against ${live[0].n} retrievable chunks.\n`);

  let hit1 = 0;
  let hit3 = 0;
  let hit5 = 0;
  let catHit = 0;
  const correctScores = [];
  const wrongScores = [];
  const rawCosCorrect = [];
  const rawCosWrong = [];
  const failures = [];

  for (const [i, c] of cases.entries()) {
    const res = await retrieve(c.phrase, {});
    const refs = res.chunks.map((x) => x.sourceRef || '');
    const at = refs.findIndex((r) => r.endsWith(`#${c.expectedId}`));

    if (at === 0) hit1 += 1;
    if (at >= 0 && at < 3) hit3 += 1;
    if (at >= 0 && at < 5) hit5 += 1;

    const cats = res.chunks[0]?.problemCategories || [];
    if (cats.includes(c.expectedCategory) || cats.includes(c.expectedId)) catHit += 1;

    const top = res.chunks[0];
    if (top) {
      (at === 0 ? correctScores : wrongScores).push(res.confidenceScore);
      (at === 0 ? rawCosCorrect : rawCosWrong).push(top.factors.rawCosine);
    }
    if (at !== 0) {
      failures.push({ phrase: c.phrase, expected: c.expectedId, got: top?.title || 'nothing', rank: at });
    }

    if ((i + 1) % 25 === 0) process.stdout.write(`  …${i + 1}/${cases.length}\n`);
  }

  const n = cases.length;
  console.log('\n══ Recall ══');
  console.log(`  recall@1            ${pct(hit1 / n)}   (the correct problem was the top hit)`);
  console.log(`  recall@3            ${pct(hit3 / n)}`);
  console.log(`  recall@5            ${pct(hit5 / n)}`);
  console.log(`  category correct    ${pct(catHit / n)}   (top hit routed to the right category)`);

  const cs = stats(correctScores);
  const ws = stats(wrongScores);
  const rc = stats(rawCosCorrect);
  const rw = stats(rawCosWrong);

  console.log('\n══ Raw cosine (what the model actually produces) ══');
  console.log(row('correct top hit', rc));
  console.log(row('incorrect top hit', rw));

  console.log('\n══ Final confidence score ══');
  console.log(row('correct top hit', cs));
  console.log(row('incorrect top hit', ws));

  /* Thresholds derived from the measured distributions.
     Floor/ceiling: the 10th percentile of wrong matches and the 90th of correct
     ones, so the calibrated range spans exactly the band that discriminates.
     min_confidence: the 25th percentile of correct matches — accept most true
     positives, since the cost of a needless clarifying question is far lower
     than the cost of never recommending anything. */
  const allRaw = [...rawCosCorrect, ...rawCosWrong].sort((a, b) => a - b);
  const floor = Number(quantile(allRaw, 0.10).toFixed(3));
  const ceiling = Number(quantile([...rawCosCorrect].sort((a, b) => a - b), 0.90).toFixed(3));
  const minConf = Number(Math.max(0.2, cs.p25 - 0.05).toFixed(3));

  const separation = cs.median - ws.median;
  console.log('\n══ Recommended ai_ranking_config ══');
  console.log(`  retrieval.cosine_floor     ${floor}`);
  console.log(`  retrieval.cosine_ceiling   ${ceiling}`);
  console.log(`  retrieval.min_confidence   ${minConf}`);
  console.log(`\n  separation (median correct − median wrong): ${separation.toFixed(3)}`);
  if (separation < 0.05) {
    console.log('  \x1b[31mWARNING\x1b[0m correct and incorrect matches score almost identically.');
    console.log('  No threshold can separate them. This points at the embedding model or the');
    console.log('  chunking, not at the threshold — do not paper over it by lowering the gate.');
  } else if (hit1 / n < 0.5) {
    console.log('  \x1b[33mNOTE\x1b[0m recall@1 is below 50%. Consider a reranker, or a stronger');
    console.log('  embedding model (that requires a migration — the column is vector(1536)).');
  } else {
    console.log('  \x1b[32mHealthy separation.\x1b[0m These thresholds are safe to apply.');
  }

  if (failures.length) {
    console.log(`\n══ Worst misses (${failures.length} of ${n}) ══`);
    failures.slice(0, 10).forEach((f) => {
      console.log(`  "${f.phrase.slice(0, 52)}"`);
      console.log(`     expected ${f.expected}  →  got "${String(f.got).slice(0, 40)}" (rank ${f.rank < 0 ? 'not in top ' + 6 : f.rank})`);
    });
  }

  if (APPLY) {
    for (const [key, value] of [
      ['retrieval.cosine_floor', floor],
      ['retrieval.cosine_ceiling', ceiling],
      ['retrieval.min_confidence', minConf],
    ]) {
      await query(
        `INSERT INTO ai_ranking_config (key, value, description, updated_at)
         VALUES ($1, $2, 'measured by npm run ai:calibrate', NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
           description = EXCLUDED.description, updated_at = NOW()`,
        [key, value],
      );
    }
    console.log('\nApplied to ai_ranking_config. Re-run:  npm run ai:search -- --suite');
  } else {
    console.log('\nNothing written. Add --apply to save these to ai_ranking_config.');
  }
}

main()
  .catch((err) => { console.error('\nCalibration failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
