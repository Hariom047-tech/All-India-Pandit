#!/usr/bin/env node
/**
 * Prove retrieval works, from the terminal, before any UI exists.
 *
 *   npm run ai:search -- "business me rukawat aa rahi hai"
 *   npm run ai:search -- "व्यापार में रुकावट है"
 *   npm run ai:search -- "Nalkheda me havan" --temple Nalkheda
 *   npm run ai:search -- --suite            run the multilingual test suite
 *
 * Shows the hybrid breakdown per hit (vector / lexical / metadata / type) so a
 * bad result can be diagnosed rather than guessed at.
 */
require('dotenv').config();
const { retrieve, inferProblemCategories } = require('../src/services/ai/retrieval.service');
const { pool } = require('../src/config/db');

/**
 * The same intent expressed five ways. If the pipeline is working, all five
 * land on business/finance content — that is the whole multilingual claim,
 * and it is cheap to check.
 */
const SUITE = [
  ['business me rukawat aa rahi hai', 'Hinglish'],
  ['व्यापार में रुकावट है', 'Devanagari'],
  ['my business is not growing at all', 'English'],
  ['buisness groth nahi ho rahi', 'misspelled Hinglish'],
  ['dukaan par customer nahi aa rahe', 'colloquial Hindi'],
  ['court case chal raha hai', 'legal — should differ'],
  ['shaadi nahi ho rahi', 'marriage — should differ'],
];

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const bar = (v, width = 12) => '█'.repeat(Math.round(v * width)).padEnd(width, '·');

async function runOne(text, intent, { compact = false } = {}) {
  const started = Date.now();
  const res = await retrieve(text, intent);
  const ms = Date.now() - started;

  if (compact) {
    const top = res.chunks[0];
    const cats = inferProblemCategories(res.chunks).slice(0, 2).map((c) => c.slug).join(', ');
    console.log(
      `  ${String(res.topScore.toFixed(2)).padStart(4)} ${res.confidence.padEnd(8)} `
      + `${(cats || '—').padEnd(34)} ${(top ? top.title : 'no match').slice(0, 34)}  ${ms}ms`,
    );
    return res;
  }

  console.log(`\nQuery: "${text}"`);
  if (Object.keys(intent).length) console.log(`Intent: ${JSON.stringify(intent)}`);
  console.log(`Confidence: ${res.confidence} (${res.topScore.toFixed(3)})   `
    + `${res.shouldRecommend ? 'recommend' : 'ASK A CLARIFYING QUESTION'}   ${ms}ms\n`);

  if (!res.chunks.length) {
    console.log('  No retrievable chunks matched.');
    console.log('  If the index is empty:  npm run ai:ingest');
    return res;
  }

  res.chunks.forEach((c, i) => {
    const f = c.factors;
    console.log(`  ${i + 1}. [${c.score.toFixed(3)}] ${c.title}`);
    console.log(`     ${c.documentType} · ${c.sourceRef}`);
    console.log(`     vec ${bar(f.vector)} ${f.vector.toFixed(2)}   `
      + `lex ${bar(f.lexical)} ${f.lexical.toFixed(2)}   `
      + `meta ${bar(f.meta)} ${f.meta.toFixed(2)}   ×${f.typeWeight}`);
    console.log(`     ${c.content.replace(/\s+/g, ' ').slice(0, 150)}…`);
    console.log('');
  });

  const cats = inferProblemCategories(res.chunks);
  if (cats.length) {
    console.log('  Inferred problem categories (→ Marketplace Matching engine):');
    cats.slice(0, 5).forEach((c) => console.log(`     ${c.slug}  (${c.weight.toFixed(2)})`));
  }
  return res;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set — the query has to be embedded to be searched.');
    process.exit(1);
  }

  /* Refuse to search an empty index.
     Searching an unpopulated index returns nothing and looks like "low
     confidence", which is indistinguishable from a working system that simply
     found no match — and that ambiguity already caused a failed ingest to be
     reported as a passing search suite. */
  const { rows } = await require('../src/config/db').query(
    `SELECT
       to_regclass('public.ai_knowledge_chunks') IS NOT NULL AS has_table,
       COALESCE((SELECT COUNT(*) FROM ai_knowledge_chunks
                  WHERE is_retrievable AND embedding IS NOT NULL), 0) AS live`,
  ).catch(() => ({ rows: [{ has_table: false, live: 0 }] }));

  const target = (process.env.DATABASE_URL || 'default (localhost:5433)').replace(/:\/\/[^@]*@/, '://***@');
  if (!rows[0].has_table) {
    console.error(`ai_knowledge_chunks does not exist in ${target}`);
    console.error('Migration 12 has not run against this database.  npm run db:migrate');
    process.exit(1);
  }
  if (Number(rows[0].live) === 0) {
    console.error(`The knowledge index is EMPTY in ${target} — 0 retrievable embedded chunks.`);
    console.error('Nothing can match. Build it first:  npm run ai:ingest');
    process.exit(1);
  }
  console.log(`Database: ${target}   ${Number(rows[0].live)} retrievable chunks\n`);

  if (argv.includes('--suite')) {
    console.log('Multilingual retrieval suite — the first five should all reach business/finance.\n');
    console.log('  score conf     inferred categories                 top hit');
    console.log('  ' + '-'.repeat(76));
    for (const [q, label] of SUITE) {
      process.stdout.write(`  ${label.padEnd(20)}`.slice(0, 0));  // keep alignment simple
      console.log(`  → ${label}`);
      await runOne(q, {}, { compact: true });
    }
    return;
  }

  const text = argv.filter((a) => !a.startsWith('--')
    && argv[argv.indexOf(a) - 1] !== '--temple'
    && argv[argv.indexOf(a) - 1] !== '--city'
    && argv[argv.indexOf(a) - 1] !== '--deity'
    && argv[argv.indexOf(a) - 1] !== '--category').join(' ');

  if (!text) {
    console.log('Usage: npm run ai:search -- "your question"  [--temple X] [--city Y] [--deity Z]');
    console.log('       npm run ai:search -- --suite');
    return;
  }

  const intent = {};
  for (const k of ['temple', 'city', 'deity', 'state']) {
    const v = flag(k);
    if (v) intent[k] = v;
  }
  const cat = flag('category');
  if (cat) intent.problemCategory = cat;

  await runOne(text, intent);
}

main()
  .catch((err) => {
    console.error('\nSearch failed:', err.message);
    if (/relation "ai_knowledge/.test(err.message)) console.error('Run:  npm run db:migrate');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
