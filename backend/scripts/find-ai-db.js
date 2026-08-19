#!/usr/bin/env node
/**
 * Answers one question: WHICH database has the AI tables?
 *
 *   npm run ai:whereis
 *
 * Exists because backend/.env points at localhost:5432 while docker-compose
 * publishes Postgres on host port 5433. Run the migration against one and the
 * ingest against the other and you get 598 identical "relation
 * ai_knowledge_documents does not exist" errors with no hint as to why.
 *
 * Probes the usual candidates and reports what each one contains. Read-only.
 */
require('dotenv').config();
const { Client } = require('pg');

const CANDIDATES = [];
if (process.env.DATABASE_URL) {
  CANDIDATES.push({ label: '.env DATABASE_URL', url: process.env.DATABASE_URL });
}
for (const [label, url] of [
  ['docker-compose (5433, app role)', 'postgresql://panditconnect_app:panditconnect_app_dev@localhost:5433/panditconnect'],
  ['docker-compose (5433, owner)', 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect'],
  ['native postgres (5432, app role)', 'postgresql://panditconnect_app:panditconnect_app_dev@localhost:5432/panditconnect'],
  ['native postgres (5432, owner)', 'postgresql://panditconnect:panditconnect@localhost:5432/panditconnect'],
]) {
  if (!CANDIDATES.some((c) => c.url === url)) CANDIDATES.push({ label, url });
}

const mask = (u) => u.replace(/:\/\/[^@]*@/, '://***@');

async function probe({ label, url }) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
  } catch (err) {
    return { label, url, reachable: false, note: err.code || err.message.split('\n')[0] };
  }
  try {
    const { rows } = await client.query(`
      SELECT
        current_database()                                            AS db,
        to_regclass('public.ai_knowledge_documents') IS NOT NULL      AS ai_docs,
        to_regclass('public.ai_knowledge_chunks')    IS NOT NULL      AS ai_chunks,
        to_regclass('public.qualified_leads')        IS NOT NULL      AS qleads,
        to_regclass('public.temples')                IS NOT NULL      AS temples,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')  AS vector,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis`);
    const r = rows[0];

    let chunks = 0;
    let live = 0;
    let temples = 0;
    if (r.ai_chunks) {
      const c = await client.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_retrievable AND embedding IS NOT NULL)::int AS live
           FROM ai_knowledge_chunks`);
      chunks = c.rows[0].total;
      live = c.rows[0].live;
    }
    if (r.temples) {
      const t = await client.query('SELECT COUNT(*)::int AS n FROM temples WHERE deleted_at IS NULL');
      temples = t.rows[0].n;
    }
    return { label, url, reachable: true, ...r, chunks, live, temples };
  } finally {
    await client.end().catch(() => {});
  }
}

const yn = (v) => (v ? '\x1b[32myes\x1b[0m' : '\x1b[31mno \x1b[0m');

async function main() {
  console.log('Probing for the database holding your AI tables…\n');
  const results = [];
  for (const c of CANDIDATES) results.push(await probe(c));

  for (const r of results) {
    console.log(`\x1b[1m${r.label}\x1b[0m`);
    console.log(`  ${mask(r.url)}`);
    if (!r.reachable) {
      console.log(`  \x1b[90munreachable — ${r.note}\x1b[0m\n`);
      continue;
    }
    console.log(`  temples: ${String(r.temples).padEnd(4)} pgvector: ${yn(r.vector)}  postgis: ${yn(r.postgis)}`);
    console.log(`  ai tables: ${yn(r.ai_docs && r.ai_chunks)}  chunks: ${r.chunks}  retrievable+embedded: ${r.live}`);
    console.log('');
  }

  const withTables = results.filter((r) => r.reachable && r.ai_docs && r.ai_chunks);
  const withData = withTables.filter((r) => r.live > 0);
  const envRow = results.find((r) => r.label === '.env DATABASE_URL');

  console.log('─'.repeat(70));
  if (!withTables.length) {
    console.log('No reachable database has the AI tables. Migration 12 has not been applied anywhere.');
    console.log('  npm run db:migrate');
    return;
  }
  if (withData.length) {
    console.log(`Index is populated in: ${withData.map((r) => r.label).join(', ')}`);
  } else {
    console.log(`Tables exist in: ${withTables.map((r) => r.label).join(', ')} — but the index is EMPTY.`);
    console.log('  npm run ai:ingest');
  }

  // The actual trap: the app is pointed at a database that was never migrated.
  if (envRow && envRow.reachable && !(envRow.ai_docs && envRow.ai_chunks)) {
    console.log('');
    console.log('\x1b[33mMISMATCH\x1b[0m — backend/.env points at a database WITHOUT the AI tables,');
    console.log(`while ${withTables[0].label} has them.`);
    console.log('Point DATABASE_URL in backend/.env at:');
    console.log(`  ${mask(withTables[0].url)}`);
  }
}

main().catch((err) => {
  console.error('Probe failed:', err.message);
  process.exitCode = 1;
});
