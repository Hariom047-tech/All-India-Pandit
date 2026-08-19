#!/usr/bin/env node
/**
 * Builds the AI knowledge index from backend/src/data/knowledge/.
 *
 *   npm run ai:ingest                    everything
 *   npm run ai:ingest -- --dry-run       chunk + report only, no API calls, no writes
 *   npm run ai:ingest -- --only problems restrict to matching filenames
 *   npm run ai:ingest -- --status        show what is currently indexed
 *
 * Safe to re-run: documents are keyed on (source, source_ref) and updated in
 * place. Editing a JSON file and re-running replaces exactly those documents.
 */
require('dotenv').config();
const { ingest, indexStatus } = require('../src/services/ai/ingest.service');
const { pool } = require('../src/config/db');
const { EMBEDDING_MODEL } = require('../src/services/ai/config');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valuesFor = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
  return out;
};

async function main() {
  if (has('--status')) {
    const rows = await indexStatus();
    if (!rows.length) {
      console.log('Nothing indexed yet. Run: npm run ai:ingest');
      return;
    }
    console.log('source'.padEnd(30) + 'docs'.padStart(7) + 'indexed'.padStart(9)
      + 'chunks'.padStart(8) + 'embedded'.padStart(10) + 'live'.padStart(7) + 'errors'.padStart(8));
    console.log('-'.repeat(79));
    for (const r of rows) {
      console.log(r.source.padEnd(30) + String(r.documents).padStart(7)
        + String(r.indexed).padStart(9) + String(r.chunks).padStart(8)
        + String(r.embedded).padStart(10) + String(r.retrievable).padStart(7)
        + String(r.errored).padStart(8));
    }
    return;
  }

  const dryRun = has('--dry-run');
  const only = valuesFor('--only');

  if (!dryRun && !process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    console.error('Set it in backend/.env, or preview the chunking with:  npm run ai:ingest -- --dry-run');
    process.exit(1);
  }

  console.log(dryRun
    ? 'DRY RUN — chunking only, no embeddings and no database writes\n'
    : `Ingesting with ${EMBEDDING_MODEL}\n`);

  const started = Date.now();
  const s = await ingest({ only, dryRun });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log('');
  console.log(`files      ${s.files}`);
  console.log(`chunks     ${s.chunks}`);
  console.log(`tokens     ~${s.tokens.toLocaleString()}  (~$${(s.tokens / 1e6 * 0.02).toFixed(3)} at text-embedding-3-small rates)`);
  if (!dryRun) {
    console.log(`indexed    ${s.documents}`);
    if (s.failed) console.log(`failed     ${s.failed}   ← see errors above; re-run to retry`);
    if (s.skipped) console.log(`skipped    ${s.skipped}`);
    console.log(`took       ${secs}s`);
    console.log('');
    if (s.failed) {
      // Non-zero exit is the point. This previously printed "Completed with
      // errors." and still exited 0, so a wrapper reading the exit code saw
      // a fully-failed run (indexed 0, failed 598) as a success and carried on.
      console.error(`Completed with errors — ${s.failed} of ${s.chunks} chunks were NOT indexed.`);
      console.error('The index is incomplete. Do not trust search results until this is clean.');
      process.exitCode = 1;
    } else {
      console.log('Index built. Try it:  npm run ai:search -- "business me rukawat aa rahi hai"');
    }
  } else {
    console.log('\nNo changes made. Drop --dry-run to build the index.');
  }
}

main()
  .catch((err) => {
    console.error('\nIngestion failed:', err.message);
    if (/relation "ai_knowledge/.test(err.message)) {
      console.error('The AI tables are missing. Run:  npm run db:migrate');
    }
    if (/vector/.test(err.message) && /type/.test(err.message)) {
      console.error('pgvector is missing. Run:  docker compose build db && docker compose up -d db');
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
