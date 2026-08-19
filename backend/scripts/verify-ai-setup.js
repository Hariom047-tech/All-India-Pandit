#!/usr/bin/env node
/**
 * Verifies the AI foundation actually landed — pgvector, migration 12's tables,
 * indexes, triggers, seed data and the qualified-lead isolation guarantee.
 *
 * Run it after:
 *     docker compose build db && docker compose up -d db
 *     npm run db:migrate
 *     npm run verify:ai
 *
 * Every check reports what is wrong AND the command that fixes it, because the
 * usual failure here is a rebuilt image that was never restarted, which looks
 * identical to a migration that never ran.
 *
 * Read-only. It creates and drops nothing.
 */
require('dotenv').config();
const { Client } = require('pg');

const URL = process.env.DATABASE_URL
  || 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect';

const AI_TABLES = [
  'ai_problem_categories', 'ai_knowledge_documents', 'ai_knowledge_chunks',
  'ai_problem_service_mappings', 'ai_conversations', 'ai_messages',
  'ai_recommendation_events', 'ai_feedback', 'ai_query_analytics', 'ai_ranking_config',
];

let failures = 0;
let warnings = 0;

function pass(label, detail = '') { console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? `  ${detail}` : ''}`); }
function fail(label, fix) { failures += 1; console.log(`  \x1b[31m✗\x1b[0m ${label}`); if (fix) console.log(`      fix: ${fix}`); }
function warn(label, detail = '') { warnings += 1; console.log(`  \x1b[33m!\x1b[0m ${label}${detail ? `  ${detail}` : ''}`); }
function head(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

async function main() {
  const db = new Client({ connectionString: URL });
  await db.connect();
  console.log(`Connected: ${URL.replace(/:[^:@/]*@/, ':***@')}`);

  // ── 1. pgvector ───────────────────────────────────────────────────────────
  head('1 · pgvector');
  const { rows: avail } = await db.query(
    `SELECT default_version FROM pg_available_extensions WHERE name = 'vector'`);
  if (!avail.length) {
    fail('pgvector is not available in this Postgres image',
      'docker compose build db && docker compose up -d db   (the stock postgis image has no pgvector)');
  } else {
    pass('pgvector available in image', `v${avail[0].default_version}`);
    const { rows: inst } = await db.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    if (!inst.length) fail('extension not created in this database', 'npm run db:migrate');
    else pass('extension created', `v${inst[0].extversion}`);
  }

  // PostGIS must survive the image change — 01-schema.sql depends on it.
  const { rows: gis } = await db.query(`SELECT extversion FROM pg_extension WHERE extname = 'postgis'`);
  if (!gis.length) fail('PostGIS is MISSING — the new image dropped it', 'check docker/postgres/Dockerfile FROM line');
  else pass('PostGIS still present', `v${gis[0].extversion}`);

  // ── 2. Tables ─────────────────────────────────────────────────────────────
  head('2 · Tables from migration 12');
  const { rows: tbls } = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`, [AI_TABLES]);
  const found = new Set(tbls.map((r) => r.table_name));
  const missing = AI_TABLES.filter((t) => !found.has(t));
  if (missing.length) fail(`${missing.length} table(s) missing: ${missing.join(', ')}`, 'npm run db:migrate');
  else pass(`all ${AI_TABLES.length} ai_* tables present`);

  // ── 3. Indexes ────────────────────────────────────────────────────────────
  head('3 · Retrieval indexes');
  for (const [idx, why, fix] of [
    ['idx_ai_chunk_embedding', 'HNSW vector index (semantic search)', 'npm run db:migrate'],
    ['idx_ai_chunk_tsv', 'GIN tsvector index (lexical half of hybrid search)', 'npm run db:migrate'],
  ]) {
    const { rows } = await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [idx]);
    if (rows.length) pass(why); else fail(`${why} missing (${idx})`, fix);
  }

  // ── 4. Triggers ───────────────────────────────────────────────────────────
  // These are what stop an unpublished article from continuing to ground live
  // answers, so a missing trigger is a correctness bug, not a nicety.
  head('4 · Retrieval-safety triggers');
  for (const [trg, why] of [
    ['trg_ai_doc_status', 'unpublishing removes chunks from retrieval'],
    ['trg_ai_chunk_denorm', 'chunk denormalised flags stay in sync'],
  ]) {
    const { rows } = await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`, [trg]);
    if (rows.length) pass(why); else fail(`${why} — trigger ${trg} missing`, 'npm run db:migrate');
  }

  // ── 5. Seed data ──────────────────────────────────────────────────────────
  head('5 · Seed data');
  if (found.has('ai_problem_categories')) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE parent_id IS NULL)::int AS groups,
              COUNT(*) FILTER (WHERE jsonb_array_length(example_phrases) > 0)::int AS with_phrases
         FROM ai_problem_categories`);
    const r = rows[0];
    if (r.total >= 43) pass('problem taxonomy', `${r.total} rows (${r.groups} groups, ${r.with_phrases} with example phrases)`);
    else fail(`taxonomy short: ${r.total} rows, expected 43`, 'npm run db:migrate');
  }

  if (found.has('ai_problem_service_mappings')) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ai_problem_service_mappings`);
    const n = rows[0].n;
    if (n >= 22) pass('problem → service mappings', `${n} resolved against the live catalogue`);
    else if (n > 0) warn(`only ${n} of 22 mappings resolved`, '— some catalogue services are missing from this database');
    else fail('no problem → service mappings resolved',
      'the services catalogue looks empty — check 02-seed.sql ran, then npm run db:migrate');

    // A mapping pointing at a dead service would recommend a service that
    // cannot be booked. FK prevents it, so this is a cheap paranoia check.
    const { rows: dangling } = await db.query(
      `SELECT COUNT(*)::int AS n FROM ai_problem_service_mappings m
        LEFT JOIN services s ON s.id = m.service_id WHERE s.id IS NULL`);
    if (dangling[0].n === 0) pass('no dangling service links');
    else fail(`${dangling[0].n} mapping(s) point at a non-existent service`);
  }

  if (found.has('ai_ranking_config')) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(value) FILTER (WHERE key LIKE 'weight.%'), 0)::numeric AS weight_sum
         FROM ai_ranking_config`);
    const { n, weight_sum: sum } = rows[0];
    if (n >= 15) pass('ranking config', `${n} keys`); else fail(`ranking config short: ${n} keys`, 'npm run db:migrate');
    // The eight ranking weights are meant to total 1.00. Drift means scores
    // stop being 0–1 and "Excellent match" starts meaning nothing.
    if (Math.abs(Number(sum) - 1) < 0.001) pass('ranking weights sum to 1.00');
    else warn(`ranking weights sum to ${Number(sum).toFixed(3)}, not 1.00`, '— intentional only if you retuned them');
  }

  if (found.has('ai_query_analytics')) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM ai_query_analytics WHERE gap_type = 'no_service'`);
    if (rows[0].n > 0) pass('demand-gap seed', `${rows[0].n} services the knowledge base wants but the catalogue lacks`);
    else warn('no seeded demand gaps found');
  }

  // ── 6. Qualified-lead isolation ───────────────────────────────────────────
  // The guarantee that matters most: the AI feature added a surface, not a new
  // way to manufacture leads.
  head('6 · Qualified-lead isolation');
  const { rows: fn } = await db.query(
    `SELECT 1 FROM pg_proc WHERE proname = 'record_qualified_lead'`);
  if (fn.length) pass('record_qualified_lead() intact');
  else fail('record_qualified_lead() is MISSING', 'migration 03 has not been applied — npm run db:migrate');

  const { rows: qcols } = await db.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name = 'qualified_leads'`);
  if (qcols[0].n > 0) pass('qualified_leads table intact', `${qcols[0].n} columns`);
  else fail('qualified_leads table missing', 'npm run db:migrate');

  // Nothing in the AI schema may reference qualified_leads.
  const { rows: leak } = await db.query(
    `SELECT c.conname, t.relname FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_class f ON f.oid = c.confrelid
      WHERE t.relname LIKE 'ai\\_%' AND f.relname = 'qualified_leads'`);
  if (leak.length === 0) pass('no ai_* table references qualified_leads');
  else fail(`AI schema is wired into qualified_leads: ${leak.map((r) => r.conname).join(', ')}`);

  // ── 7. Live smoke test of the vector type ─────────────────────────────────
  head('7 · Vector smoke test');
  try {
    const { rows } = await db.query(`SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector AS cosine_distance`);
    pass('cosine distance operator works', `orthogonal vectors → ${Number(rows[0].cosine_distance).toFixed(2)}`);
  } catch (err) {
    fail(`vector operators unusable: ${err.message}`, 'docker compose build db && docker compose up -d db');
  }

  // ── 8. Ingestion readiness ────────────────────────────────────────────────
  head('8 · Ingestion readiness');
  if (found.has('ai_knowledge_documents')) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS docs,
              COUNT(*) FILTER (WHERE status = 'published' AND verified)::int AS live
         FROM ai_knowledge_documents`);
    if (rows[0].docs === 0) {
      warn('knowledge base is empty', '— expected: the ingestion pipeline is the next build stage');
    } else {
      pass('knowledge documents', `${rows[0].docs} total, ${rows[0].live} retrievable`);
      const { rows: ch } = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
           FROM ai_knowledge_chunks`);
      if (ch[0].total && ch[0].embedded < ch[0].total) {
        warn(`${ch[0].total - ch[0].embedded} chunk(s) have no embedding`, '— re-index from Admin → AI Knowledge Base');
      } else if (ch[0].total) pass('chunks embedded', `${ch[0].embedded}/${ch[0].total}`);
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    warn('OPENAI_API_KEY not set', '— needed for embeddings and generation');
  } else pass('OPENAI_API_KEY present');

  await db.end();

  console.log('');
  if (failures) {
    console.log(`\x1b[31m${failures} check(s) failed\x1b[0m${warnings ? `, ${warnings} warning(s)` : ''}. Fix the ✗ items above and re-run.`);
    process.exit(1);
  }
  console.log(`\x1b[32mAI foundation verified.\x1b[0m${warnings ? ` ${warnings} warning(s) — review the ! items.` : ''}`);
}

main().catch((err) => {
  console.error('\nVerification could not run:', err.message);
  if (/ECONNREFUSED/.test(err.message)) {
    console.error('The database is not reachable. Start it:  docker compose up -d db');
  }
  process.exit(1);
});
