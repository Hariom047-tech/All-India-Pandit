#!/usr/bin/env node
/**
 * Regenerates backend/src/data/*.json from the frontend's content module
 * (frontend/app/src/data/content.ts).
 *
 * Why this exists: the frontend ships its directory content bundled into the
 * SPA (instant, offline-capable browsing — see docs/ARCHITECTURE.md). The
 * backend serves the *same* content over REST so write-actions (contact,
 * enquiry, newsletter) and any future client (mobile app, admin tool) have
 * one real source of truth instead of a second hand-maintained copy that
 * quietly drifts out of sync.
 *
 * Run after editing frontend/app/src/data/content.ts:
 *   node backend/scripts/sync-seed-data.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_TS = path.join(ROOT, 'frontend/app/src/data/content.ts');
const TS_COMPILER = path.join(ROOT, 'frontend/app/node_modules/typescript');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data');

// content.ts is plain TypeScript (a type-only import + type annotations on
// otherwise ordinary object/array literals) — transpileModule strips the
// `import type` and annotations without needing to resolve ./types at all.
const ts = require(TS_COMPILER);
const source = fs.readFileSync(CONTENT_TS, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
});

const tmpFile = path.join(os.tmpdir(), `panditconnect-content-${Date.now()}.js`);
fs.writeFileSync(tmpFile, outputText);
let content;
try {
  content = require(tmpFile);
} finally {
  fs.unlinkSync(tmpFile);
}

const FILES = {
  'temples.json': content.temples,
  'pandits.json': content.pandits,
  'services.json': content.services,
  'reviews.json': content.reviews,
  'posts.json': content.posts,
  'plans.json': content.plans,
  'faqs.json': content.faqs,
  'stats.json': content.stats,
  'taxonomy.json': { cities: content.cities, states: content.states, languages: content.languages },
  'recommend-rules.json': content.recommendRules,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [file, data] of Object.entries(FILES)) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data, null, 2) + '\n');
  total++;
  console.log(`  wrote ${file}`);
}
console.log(`\n${total} seed files written to backend/src/data/ from content.ts.`);
