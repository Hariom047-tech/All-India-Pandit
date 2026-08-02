#!/usr/bin/env node
/**
 * Regenerates backend/src/data/*.json from the frontend's embedded data layer
 * (frontend/public/assets/js/data.js).
 *
 * Why this exists: the frontend ships its content embedded (instant, offline-capable
 * browsing — see docs/ARCHITECTURE.md). The backend serves the *same* content over
 * REST so write-actions (contact, enquiry, newsletter) and any future client
 * (mobile app, admin tool) have one real source of truth instead of a second
 * hand-maintained copy that quietly drifts out of sync.
 *
 * Run after editing frontend/public/assets/js/data.js:
 *   node backend/scripts/sync-seed-data.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const DATA_JS = path.join(ROOT, 'frontend/public/assets/js/data.js');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data');

const ctx = vm.createContext({});
vm.runInContext('var window = this;', ctx);
vm.runInContext(fs.readFileSync(DATA_JS, 'utf8'), ctx);
const PC = ctx.PC;

const FILES = {
  'temples.json': PC.temples,
  'pandits.json': PC.pandits,
  'services.json': PC.services,
  'festivals.json': PC.festivals,
  'reviews.json': PC.reviews,
  'posts.json': PC.posts,
  'panchang.json': PC.panchang,
  'plans.json': PC.plans,
  'faqs.json': PC.faqs,
  'stats.json': PC.stats,
  'taxonomy.json': { cities: PC.cities, states: PC.states, languages: PC.languages },
  'recommend-rules.json': PC.recommendRules,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [file, data] of Object.entries(FILES)) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data, null, 2) + '\n');
  total++;
  console.log(`  wrote ${file}`);
}
console.log(`\n${total} seed files written to backend/src/data/ from data.js.`);
