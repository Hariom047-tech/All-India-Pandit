/* Boots every page in jsdom, fails on any console error / uncaught exception,
   and verifies that each dynamic container actually rendered content.
   Run: node tools/smoke.js     (needs: npm i --no-save jsdom) */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend', 'public');
const SCRIPTS = ['assets/js/data.js', 'assets/js/api.js', 'assets/js/app.js', 'assets/js/pages.js']
  .map(f => fs.readFileSync(path.join(FRONTEND, f), 'utf8'));

// page -> containers that must be non-empty after boot
const EXPECT = {
  'index.html': ['#statStrip', '#steps', '#featuredPandits', '#popularTemples', '#popularServices', '#testimonials', '#festStrip'],
  // #pager is intentionally empty when a filter narrows results to a single page
  'temples.html': ['#filters', '#templeGrid', '#resultCount'],
  'pandits.html': ['#filters', '#panditGrid', '#resultCount'],
  'temple-detail.html': ['#banner', '#overviewPandits', '#templeAbout', '#panditsPanel', '#servicesPanel', '#reviewsPanel', '#locationPanel', '#nearby', '#inquiryBox'],
  'pandit-profile.html': ['#profileId', '#svcOffered', '#assocTemples', '#credentials', '#aboutPandit', '#videoIntro', '#availability', '#reviewsList', '#qrShare', '#similarPandits'],
  'services.html': ['#catBar', '#svcGrid', '#svcCount'],
  'service-detail.html': ['#svcHead', '#samagri', '#muhuratBox', '#svcPandits', '#svcTemples', '#relatedSvc'],
  'panchang.html': ['#pgDate', '#pgCore', '#pgSun', '#pgGood', '#pgBad', '#cal', '#calFests', '#calMonth'],
  'temple-map.html': ['#mapSvgHost', '#mapList', '#mapCount'],
  'ai-recommender.html': ['#chatLog', '#chatChips'],
  'blog.html': ['#blogCats', '#featuredPost', '#blogGrid'],
  'dashboard.html': ['#dashNav', '#secOverview', '#secProfile', '#secServices', '#secReviews', '#secAnalytics', '#secPlan'],
  'about.html': ['#verifySteps', '#diffTable', '#aboutStats'],
  'contact.html': ['#faqList', '#ctSubject'],
};

// query strings worth exercising (deep-link paths users will actually hit)
const QUERY = {
  'temple-detail.html': ['?id=mahakaleshwar', '?id=nope-does-not-exist'],
  'pandit-profile.html': ['?id=devdatt-shastri', '?id=nope'],
  'service-detail.html': ['?id=kaal-sarp', '?id=nope'],
  'temples.html': ['?city=Varanasi&q=kashi'],
  'pandits.html': ['?service=rudrabhishek', '?q=tamil'],
  'services.html': ['?cat=festival'],
};

let fails = 0;
const bad = m => { console.log('  FAIL  ' + m); fails++; };

async function run(file, qs) {
  const label = file + (qs || '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, file), 'utf8'), {
    url: 'http://localhost/' + file + (qs || ''),
    runScripts: 'outside-only',
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};

  try {
    SCRIPTS.forEach(src => w.eval(src));
    w.PC.boot();
  } catch (e) {
    bad(`${label} threw during boot: ${e.message}`);
    return;
  }
  errors.forEach(e => bad(`${label} → ${e}`));

  const doc = w.document;
  // shell mounted?
  if (!doc.querySelector('.site-header .brand')) bad(`${label}: header did not mount`);
  if (!doc.querySelector('.site-footer .footer-top')) bad(`${label}: footer did not mount`);
  if (!doc.querySelector('.bottom-nav')) bad(`${label}: mobile bottom nav missing`);

  (EXPECT[file] || []).forEach(sel => {
    const el = doc.querySelector(sel);
    if (!el) return bad(`${label}: ${sel} not found in markup`);
    if (el.innerHTML.trim().length < 8) bad(`${label}: ${sel} rendered empty`);
  });

  // no unresolved template artefacts
  const html = doc.body.innerHTML;
  ['undefined<', '>undefined', 'NaN', '[object Object]'].forEach(t => {
    if (html.includes(t)) bad(`${label}: output contains "${t}"`);
  });

  // every internal link points at a file that exists
  [...doc.querySelectorAll('a[href]')].forEach(a => {
    const h = a.getAttribute('href');
    if (!h || /^(#|https?:|tel:|mailto:)/.test(h)) return;
    const target = h.split('?')[0].split('#')[0];
    if (target && !fs.existsSync(path.join(FRONTEND, target))) bad(`${label}: dead link → ${h}`);
  });

  dom.window.close();
}

(async () => {
  for (const file of Object.keys(EXPECT)) {
    await run(file, '');
    for (const qs of (QUERY[file] || [])) await run(file, qs);
  }

  /* interaction spot-checks on the trickiest page */
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'temples.html'), 'utf8'),
    { url: 'http://localhost/temples.html', runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
  const w = dom.window;
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollIntoView = () => {};
  SCRIPTS.forEach(s => w.eval(s));
  w.PC.boot();
  const doc = w.document;

  const before = doc.querySelectorAll('#templeGrid .card').length;
  const box = doc.querySelector('input[name="city"][value="Varanasi"]');
  box.checked = true;
  box.dispatchEvent(new w.Event('change', { bubbles: true }));
  const after = doc.querySelectorAll('#templeGrid .card').length;
  if (!(after > 0 && after < before)) bad(`city filter did not narrow results (${before} → ${after})`);
  else console.log(`  ok    city filter narrows ${before} → ${after} temples`);

  // favourite toggle must flip exactly once per click (guards double-binding)
  const fav = doc.querySelector('#templeGrid [data-fav]');
  fav.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  if (!fav.classList.contains('is-on')) bad('favourite button did not toggle on (double-bound handler?)');
  else console.log('  ok    favourite toggles once per click');

  // clear-all restores the full list
  doc.querySelector('#clearF').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  if (doc.querySelectorAll('#templeGrid .card').length !== before) bad('clear-all did not restore the full result set');
  else console.log('  ok    clear-all restores full list');
  errs.forEach(e => bad('temples.html interaction → ' + e));
  dom.window.close();

  /* AI recommender must answer, and answer with real service links */
  const dom2 = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'ai-recommender.html'), 'utf8'),
    { url: 'http://localhost/ai-recommender.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w2 = dom2.window;
  w2.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  SCRIPTS.forEach(s => w2.eval(s));
  w2.PC.boot();
  const d2 = w2.document;
  d2.querySelector('#chatInput').value = 'naya ghar liya hai';
  d2.querySelector('#chatForm').dispatchEvent(new w2.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 900));
  const reply = d2.querySelector('#chatLog .bubble--ai:last-child').innerHTML;
  if (!reply.includes('service-detail.html?id=griha-pravesh')) bad('recommender did not suggest Griha Pravesh for "naya ghar liya hai"');
  else console.log('  ok    recommender maps "naya ghar liya hai" → Griha Pravesh');
  dom2.window.close();

  console.log(fails ? `\n${fails} problem(s) found.` : '\nAll pages boot clean.');
  process.exit(fails ? 1 : 0);
})();
