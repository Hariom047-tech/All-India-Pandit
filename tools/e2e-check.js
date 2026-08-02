/* One-off manual check (not part of the regular `npm test` suite): loads the
   REAL pandit-profile.html + real app.js/pages.js/api.js in jsdom, clicks the
   real "Send Message" button, fills the real modal form, submits it, and
   confirms the enquiry actually lands as a row in the running Postgres
   container — proving the UI code path (not just curl) reaches the API.

   Requires: docker compose up -d   (stack already running on :8080)
   Run:      node tools/e2e-check.js
*/
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend', 'public');
const SCRIPTS = ['assets/js/data.js', 'assets/js/api.js', 'assets/js/app.js', 'assets/js/pages.js']
  .map((f) => fs.readFileSync(path.join(FRONTEND, f), 'utf8'));

(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'pandit-profile.html'), 'utf8'), {
    url: 'http://localhost:8080/pandit-profile.html?id=ramesh-sharma', // same origin as the running frontend container
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  // jsdom has no network stack of its own — use Node's real global fetch, bound to
  // globalThis: assigned bare, undici's fetch throws "Illegal invocation" when called
  // as a method of a different object (the jsdom window), which api.js's request()
  // would otherwise swallow via its own soft-fail design, masking the real problem.
  w.fetch = fetch.bind(globalThis);
  // Node's bare fetch also can't resolve a relative "/api/..." against a page
  // location the way a real browser's fetch does — a real browser needs no such
  // override. api.js reads this exact global for that reason.
  w.PC_API_BASE = 'http://localhost:8080/api';
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

  SCRIPTS.forEach((s) => w.eval(s));
  w.PC.boot();

  const doc = w.document;
  doc.getElementById('msgBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const modal = doc.getElementById('pcModal');
  modal.querySelector('#eqName').value = 'E2E Script';
  modal.querySelector('#eqPhone').value = '9123456789';
  modal.querySelector('#eqMsg').value = 'Sent from tools/e2e-check.js';

  await new Promise((resolve) => {
    modal.querySelector('#enqForm').addEventListener('submit', () => setTimeout(resolve, 400));
    modal.querySelector('#enqForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  });

  const out = execSync(
    `docker exec panditconnect-db psql -U panditconnect -d panditconnect -t -A -F"|" -c ` +
    `"SELECT pandit_id, name, phone, message FROM pandit_enquiries WHERE pandit_id='ramesh-sharma' ORDER BY received_at DESC LIMIT 1"`,
  ).toString().trim();
  const [panditId, name] = out.split('|');

  if (panditId === 'ramesh-sharma' && name === 'E2E Script') {
    console.log('  ok    real UI submit → real Postgres row:', out);
    process.exit(0);
  }
  console.log('  FAIL  expected row not found. Last row was:', out || '(empty)');
  process.exit(1);
})();
