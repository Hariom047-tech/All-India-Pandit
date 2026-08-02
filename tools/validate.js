/* Data + asset integrity check.  Run: node tools/validate.js
   Catches broken cross-references before they surface as blank cards. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend', 'public');

// data.js assigns window.PC then reads bare PC, so window must be the global object
const ctx = vm.createContext({});
vm.runInContext('var window = this;', ctx);
vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'assets/js/data.js'), 'utf8'), ctx);
const PC = ctx.PC;

let fails = 0;
const bad = (m) => { console.log('  FAIL  ' + m); fails++; };
const ok = (m) => console.log('  ok    ' + m);

/* --- 1. cross-references --- */
const svcIds = new Set(PC.services.map(s => s.id));
const tplIds = new Set(PC.temples.map(t => t.id));

PC.temples.forEach(t => t.services.forEach(s => {
  if (!svcIds.has(s)) bad(`temple "${t.id}" references unknown service "${s}"`);
}));
PC.pandits.forEach(p => {
  p.services.forEach(s => { if (!svcIds.has(s)) bad(`pandit "${p.id}" references unknown service "${s}"`); });
  p.temples.forEach(t => { if (!tplIds.has(t)) bad(`pandit "${p.id}" references unknown temple "${t}"`); });
  p.langs.forEach(l => { if (!PC.languages.includes(l)) bad(`pandit "${p.id}" has unlisted language "${l}"`); });
  if (!PC.cities.includes(p.city)) bad(`pandit "${p.id}" city "${p.city}" not in PC.cities`);
  if (!PC.states.includes(p.state)) bad(`pandit "${p.id}" state "${p.state}" not in PC.states`);
});
PC.temples.forEach(t => {
  if (!PC.cities.includes(t.city)) bad(`temple "${t.id}" city "${t.city}" not in PC.cities`);
  if (!PC.states.includes(t.state)) bad(`temple "${t.id}" state "${t.state}" not in PC.states`);
});
PC.recommendRules.forEach((r, i) => r.svc.forEach(s => {
  if (!svcIds.has(s)) bad(`recommendRules[${i}] references unknown service "${s}"`);
}));
ok('cross-references between temples, pandits, services and rules');

/* --- 2. unique ids --- */
[['services', PC.services], ['temples', PC.temples], ['pandits', PC.pandits], ['posts', PC.posts]]
  .forEach(([name, list]) => {
    const seen = new Set();
    list.forEach(x => { if (seen.has(x.id)) bad(`duplicate id "${x.id}" in ${name}`); seen.add(x.id); });
  });
ok('ids are unique');

/* --- 3. every service is reachable from at least one pandit --- */
const offered = new Set();
PC.pandits.forEach(p => p.services.forEach(s => offered.add(s)));
const orphan = [...svcIds].filter(s => !offered.has(s));
if (orphan.length) console.log(`  note  ${orphan.length} service(s) have no pandit listed: ${orphan.join(', ')}`);
else ok('every service has at least one pandit');

/* --- 4. every icon referenced actually exists in the icon set --- */
const iconNames = new Set(Object.keys(PC.iconPaths));
PC.services.forEach(s => { if (!iconNames.has(s.icon)) bad(`service "${s.id}" uses missing icon "${s.icon}"`); });
PC.stats.forEach(s => { if (!iconNames.has(s.icon)) bad(`stat "${s.label}" uses missing icon "${s.icon}"`); });

const jsSrc = ['assets/js/app.js', 'assets/js/pages.js']
  .map(f => fs.readFileSync(path.join(FRONTEND, f), 'utf8')).join('\n');
const used = new Set([...jsSrc.matchAll(/PC\.icon\(\s*'([a-z-]+)'/g)].map(m => m[1]));
[...used].forEach(n => { if (!iconNames.has(n)) bad(`PC.icon('${n}') has no path in PC.iconPaths`); });
ok(`${used.size} icon names used in JS all resolve`);

/* --- 5. lat/lng inside the map projection window --- */
PC.temples.forEach(t => {
  if (t.lat < 7.6 || t.lat > 37.2 || t.lng < 67.6 || t.lng > 97.8) bad(`temple "${t.id}" coords fall outside the map viewport`);
});
ok('all temple coordinates fall inside the map projection window');

/* --- 6. local assets referenced by HTML/CSS/JS exist --- */
const htmlFiles = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html'));
const allSrc = htmlFiles.map(f => fs.readFileSync(path.join(FRONTEND, f), 'utf8')).join('\n') + jsSrc +
  fs.readFileSync(path.join(FRONTEND, 'assets/css/style.css'), 'utf8');
const refs = new Set([...allSrc.matchAll(/["'(](assets\/[a-z0-9/_.-]+)["')]/gi)].map(m => m[1]));
[...refs].forEach(r => {
  // temple/pandit photo slots are intentionally absent — the SVG fallback covers them
  if (/^assets\/img\/(temples|pandits)\//.test(r)) return;
  if (!fs.existsSync(path.join(FRONTEND, r))) bad(`referenced asset missing: ${r}`);
});
ok(`${refs.size} local asset references checked`);

/* --- 7. every page declares a controller that exists --- */
const declared = htmlFiles.map(f => {
  const m = fs.readFileSync(path.join(FRONTEND, f), 'utf8').match(/<body data-page="([^"]+)"/);
  return { file: f, page: m && m[1] };
});
const pagesSrc = fs.readFileSync(path.join(FRONTEND, 'assets/js/pages.js'), 'utf8');
declared.forEach(d => {
  if (!d.page) return bad(`${d.file} has no data-page attribute`);
  const has = new RegExp(`PC\\.pages(\\.${d.page}\\b|\\['${d.page}'\\])`).test(pagesSrc);
  if (!has) bad(`${d.file} declares data-page="${d.page}" but no controller is registered`);
});
ok(`${declared.length} pages mapped to controllers`);

/* --- 8. backend seed JSON stays in sync with the frontend's embedded data --- */
const BACKEND_DATA = path.join(ROOT, 'backend', 'src', 'data');
const SEED_MAP = {
  'temples.json': PC.temples, 'pandits.json': PC.pandits, 'services.json': PC.services,
  'festivals.json': PC.festivals, 'reviews.json': PC.reviews, 'posts.json': PC.posts,
  'panchang.json': PC.panchang, 'plans.json': PC.plans, 'faqs.json': PC.faqs, 'stats.json': PC.stats,
};
let drifted = 0;
for (const [file, expected] of Object.entries(SEED_MAP)) {
  const seedPath = path.join(BACKEND_DATA, file);
  if (!fs.existsSync(seedPath)) { bad(`backend seed missing: ${file} (run: node backend/scripts/sync-seed-data.js)`); drifted++; continue; }
  const actual = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { bad(`backend seed out of date: ${file} (run: node backend/scripts/sync-seed-data.js)`); drifted++; }
}
if (!drifted) ok('backend seed JSON matches frontend data.js');

/* --- 9. generated 02-seed.sql stays in sync with backend/src/data/*.json --- */
const crypto = require('crypto');
const seedSqlPath = path.join(ROOT, 'backend', 'src', 'db', '02-seed.sql');
if (!fs.existsSync(seedSqlPath)) {
  bad('backend/src/db/02-seed.sql is missing (run: cd backend && npm run seed)');
} else {
  const jsonForHash = {
    services: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'services.json'), 'utf8')),
    temples: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'temples.json'), 'utf8')),
    pandits: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'pandits.json'), 'utf8')),
    festivals: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'festivals.json'), 'utf8')),
    reviews: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'reviews.json'), 'utf8')),
    posts: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'posts.json'), 'utf8')),
    panchang: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'panchang.json'), 'utf8')),
    plans: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'plans.json'), 'utf8')),
    faqs: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'faqs.json'), 'utf8')),
    stats: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'stats.json'), 'utf8')),
    taxonomy: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'taxonomy.json'), 'utf8')),
    recommendRules: JSON.parse(fs.readFileSync(path.join(BACKEND_DATA, 'recommend-rules.json'), 'utf8')),
  };
  const expectedHash = crypto.createHash('sha1').update(JSON.stringify(jsonForHash)).digest('hex');
  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
  const m = seedSql.match(/Content hash: ([0-9a-f]{40})/);
  if (!m) bad('02-seed.sql has no content-hash header — regenerate with: cd backend && npm run seed');
  else if (m[1] !== expectedHash) bad('02-seed.sql is out of date vs backend/src/data/*.json (run: cd backend && npm run seed)');
  else ok('02-seed.sql matches backend/src/data/*.json');
}

console.log(fails ? `\n${fails} problem(s) found.` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
