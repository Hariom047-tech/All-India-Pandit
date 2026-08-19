#!/usr/bin/env node
/**
 * Proves the distribution engine is actually wired to the database.
 *
 *   npm run verify:wiring
 *
 * The 42 unit tests verify the MATHS with fake pandits. This verifies the
 * PLUMBING with your real ones: that the SQL runs, the counters read, markets
 * gate the right pools, two visitors genuinely see different pandits, and
 * exposure rows actually land.
 *
 * Read-only except for one exposure write, which it cleans up after itself.
 * Every check prints what it found, so a pass is inspectable rather than a
 * green tick you have to trust.
 */

require('dotenv').config();
const { pool, query } = require('../src/config/db');
const engine = require('../src/services/distribution/engine');
const repo = require('../src/repositories/distribution.repository');

const TEMPLE_SLUG = process.env.VERIFY_TEMPLE_SLUG || 'maa-baglamukhi';
const PROBE_SESSION = '__verify_wiring_probe__';

let failures = 0;
let warnings = 0;

const ok = (msg, detail = '') => console.log(`  PASS  ${msg}${detail ? `\n        ${detail}` : ''}`);
const bad = (msg, detail = '') => { failures += 1; console.log(`  FAIL  ${msg}${detail ? `\n        ${detail}` : ''}`); };
const warn = (msg, detail = '') => { warnings += 1; console.log(`  WARN  ${msg}${detail ? `\n        ${detail}` : ''}`); };
const head = (n, t) => console.log(`\n${n}. ${t}\n${'─'.repeat(64)}`);   // n may be '1b'

async function main() {
  console.log('Distribution wiring check');
  console.log(`Database: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@') : '(from PG* env)'}`);

  /* ── 1. schema ─────────────────────────────────────────────────────────── */
  head(1, 'Schema — migrations 15 and 16');

  const { rows: tables } = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_name = ANY($1::text[])`,
    [['plan_market_entitlements', 'pandit_exposure', 'distribution_config', 'visitor_geo_log']],
  );
  const found = tables.map((t) => t.table_name);
  for (const t of ['plan_market_entitlements', 'pandit_exposure', 'distribution_config', 'visitor_geo_log']) {
    if (found.includes(t)) ok(`table ${t}`);
    else bad(`table ${t} MISSING`, 'run: npm run db:migrate');
  }

  const { rows: fn } = await query(
    `SELECT pronargs FROM pg_proc WHERE proname = 'record_qualified_lead'`);
  if (fn.length !== 1) {
    bad(`record_qualified_lead(): expected exactly 1, found ${fn.length}`,
      fn.length > 1 ? 'Two overloads make every 5-arg call ambiguous — contact tracking will error.' : 'Migration 03 missing.');
  } else if (fn[0].pronargs !== 7) {
    bad('record_qualified_lead() has not gained market attribution',
      `arity is ${fn[0].pronargs}, expected 7 — apply migration 16, or every new lead will have market NULL and be invisible to the fairness engine.`);
  } else {
    ok('record_qualified_lead() is market-aware (arity 7)');
  }

  /* ── 1b. permissions ───────────────────────────────────────────────────── */
  head('1b', 'Permissions — the app role must READ config, and must NOT rewrite plan rules');

  /*
   * Worth checking explicitly rather than inferring.
   *
   * getConfig() and getEntitlements() both swallow their errors and return {}
   * by design, so the engine keeps working on hardcoded defaults if the tables
   * are unreadable. That is the right behaviour at runtime — a permissions
   * problem should not take the listing down — but it means a missing SELECT
   * grant is completely INVISIBLE in production: every tuning value you set in
   * distribution_config is quietly ignored and nothing anywhere says so.
   *
   * Without this check the symptom shows up further down as "no entitlements
   * seeded", which points at the seed rather than at the grant.
   */
  const { rows: roleRows } = await query(
    `SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app'`);

  if (!roleRows.length) {
    console.log('        role panditconnect_app does not exist — skipping (expected on a dev database');
    console.log('        that connects as the owner; production should NOT look like this)');
  } else {
    const mustRead = [
      ['distribution_config', 'SELECT', 'every fairness weight you tuned would be silently ignored'],
      ['plan_market_entitlements', 'SELECT', 'plan → market rules would fall back to hardcoded defaults'],
      ['pandit_exposure', 'SELECT', 'the exposure half of the fairness maths would read as zero'],
      ['pandit_exposure', 'INSERT', 'nothing would ever be recorded, so fairness could not self-correct'],
    ];
    for (const [table, priv, consequence] of mustRead) {
      const { rows } = await query(
        `SELECT has_table_privilege('panditconnect_app', $1, $2) AS granted`, [table, priv]);
      if (rows[0].granted) ok(`${table} ${priv}`);
      else bad(`${table} ${priv} NOT granted`, `${consequence} — and no error would appear anywhere.`);
    }

    const mustNotWrite = [
      ['plan_market_entitlements', 'DELETE'],
      ['distribution_config', 'UPDATE'],
      ['pandit_exposure', 'UPDATE'],
    ];
    for (const [table, priv] of mustNotWrite) {
      const { rows } = await query(
        `SELECT has_table_privilege('panditconnect_app', $1, $2) AS granted`, [table, priv]);
      if (!rows[0].granted) ok(`${table} ${priv} correctly withheld`);
      else warn(`app role can ${priv} ${table}`,
        'It never does so in code. Apply migration 17 to drop the unused privilege.');
    }

    /*
     * The admin panel writes through SECURITY DEFINER functions rather than
     * direct UPDATEs, precisely so the checks above can stay true. If the
     * EXECUTE grant is missing, every save in the panel fails — loudly, which
     * is correct, but the cause would be far from obvious.
     */
    for (const fn of ['set_distribution_config', 'set_plan_entitlement']) {
      const { rows } = await query(
        `SELECT p.oid::regprocedure::text AS sig,
                has_function_privilege('panditconnect_app', p.oid, 'EXECUTE') AS granted
           FROM pg_proc p WHERE p.proname = $1`, [fn]);
      if (!rows.length) warn(`${fn}() not found`, 'Apply migration 18 to enable the admin controls.');
      else if (rows[0].granted) ok(`${fn}() EXECUTE granted`);
      else bad(`${fn}() EXECUTE not granted`, 'Every save in the admin distribution panel will fail.');
    }
  }

  /* ── 1c. admin control surface ─────────────────────────────────────────── */
  head('1c', 'Admin controls — every knob must be bounded');

  const { rows: unbounded } = await query(
    `SELECT key FROM distribution_config WHERE min_value IS NULL OR max_value IS NULL`);
  if (!unbounded.length) {
    const { rows: n } = await query('SELECT COUNT(*)::int AS n FROM distribution_config');
    ok(`all ${n[0].n} config keys have enforced bounds`);
  } else {
    bad(`${unbounded.length} config key(s) unbounded`,
      `${unbounded.map((r) => r.key).join(', ')} — an out-of-range value does not error the engine, it silently changes how ranking behaves.`);
  }

  const { rows: modeRow } = await query(
    `SELECT value FROM distribution_config WHERE key = 'pool_mode'`);
  if (!modeRow.length) warn('pool_mode not set', 'Apply migration 18.');
  else {
    const m = Number(modeRow[0].value);
    ok(`pool mode: ${m === 1 ? 'PRIORITY' : 'WEIGHTED'}`);
    if (m === 1) {
      warn('PRIORITY mode is active',
        'Plans below the top priority receive NO leads in the markets they share. Intentional if you chose it — check the admin panel projection.');
    }
  }

  const { rows: prices } = await query(
    `SELECT COUNT(*)::int AS n FROM plan_market_entitlements WHERE plan_price_inr IS NULL AND is_active`);
  if (prices[0].n > 0) {
    warn(`${prices[0].n} active plan(s) have no price`,
      'The admin panel cannot compute ₹ per lead for them, which is the check that catches an inverted ladder.');
  } else ok('every active plan has a price, so ₹/lead can be projected');

  /* ── 2. the counter that silently breaks ───────────────────────────────── */
  head(2, 'Lead attribution — the failure mode with no error message');

  const { rows: nullMarket } = await query(
    `SELECT COUNT(*)::int AS n FROM qualified_leads WHERE market IS NULL`);
  if (nullMarket[0].n === 0) ok('every qualified lead carries a market');
  else bad(`${nullMarket[0].n} lead(s) have market = NULL`,
    'These match neither INDIA nor INTERNATIONAL, so the engine counts them as zero and every pandit looks permanently starved.');

  const { rows: bySource } = await query(
    `SELECT market::text, market_source::text, COUNT(*)::int AS n
       FROM qualified_leads GROUP BY 1, 2 ORDER BY 3 DESC`);
  if (bySource.length) {
    console.log('        attribution breakdown:');
    for (const r of bySource) console.log(`          ${String(r.n).padStart(6)}  ${r.market.padEnd(14)} ${r.market_source}`);
    const guessed = bySource.filter((r) => r.market_source === 'IP_GEO').reduce((a, r) => a + r.n, 0);
    if (guessed) warn(`${guessed} lead(s) attributed by IP alone`, 'Low confidence — reviewable, should not be billed silently.');
  } else {
    console.log('        (no qualified leads yet — nothing to attribute)');
  }

  /* ── 3. entitlements ───────────────────────────────────────────────────── */
  head(3, 'Plan → market entitlement');

  const ent = await repo.getEntitlements();
  for (const [market, tiers] of Object.entries(ent)) {
    const total = Object.values(tiers).reduce((a, e) => a + e.weight, 0);
    const line = Object.entries(tiers).map(([t, e]) => `${t} ${e.weight}`).join('  ');
    if (Math.abs(total - 1) > 0.001) {
      bad(`${market} weights sum to ${total.toFixed(3)}, not 1.000`, line);
    } else {
      ok(`${market} allocation sums to 1.000`, line);
    }
  }
  if (!Object.keys(ent).length) bad('no entitlements seeded', 'The engine will fall back to hardcoded defaults.');

  /* ── 4. real pools ─────────────────────────────────────────────────────── */
  head(4, `Pools at "${TEMPLE_SLUG}"`);

  const { rows: temples } = await query(
    'SELECT id, name FROM temples WHERE slug = $1 AND deleted_at IS NULL', [TEMPLE_SLUG]);
  if (!temples[0]) {
    bad(`temple "${TEMPLE_SLUG}" not found`, 'Set VERIFY_TEMPLE_SLUG, or seed it.');
    return finish();
  }
  const templeId = temples[0].id;
  console.log(`        ${temples[0].name}`);

  for (const market of ['INDIA', 'INTERNATIONAL']) {
    const r = await engine.distribute({
      market, templeId, sessionKey: `${PROBE_SESSION}_a`, pageSize: 20, record: false,
    });
    if (!r.pandits.length) {
      warn(`${market}: no pandits returned`,
        `candidates ${r.total}, eligible ${r.eligible}, bucket ${r.pool || 'none'} — check verification status, availability and profile completeness.`);
    } else {
      ok(`${market}: ${r.pandits.length} shown from ${r.eligible} eligible (${r.total} candidates), bucket "${r.pool}"`);
    }

    // Entitlement must actually gate. A silver (India-only) pandit appearing in
    // the international pool means the plans are not being honoured.
    if (market === 'INTERNATIONAL') {
      const leaked = r.pandits.filter((p) => p.tier === 'silver');
      if (leaked.length) {
        bad(`${leaked.length} India-only (silver) pandit(s) leaked into the INTERNATIONAL pool`,
          leaked.slice(0, 3).map((p) => p.slug).join(', '));
      } else if (r.pandits.length) {
        ok('INTERNATIONAL pool contains no India-only pandits');
      }
    }
  }

  /* ── 5. rotation ───────────────────────────────────────────────────────── */
  head(5, 'Rotation — does every visitor really see something different?');

  const pageFor = async (sk) => {
    const r = await engine.distribute({
      market: 'INDIA', templeId, sessionKey: sk, pageSize: 20, record: false,
    });
    return r.pandits.map((p) => p.slug);
  };

  const a1 = await pageFor(`${PROBE_SESSION}_a`);
  const a2 = await pageFor(`${PROBE_SESSION}_a`);
  if (!a1.length) {
    warn('empty INDIA pool — cannot check rotation');
  } else {
    if (JSON.stringify(a1) === JSON.stringify(a2)) {
      ok('same visitor, same order (a refresh does not reshuffle)');
    } else {
      bad('the same session got two different orders',
        'A devotee would lose the pandit they were looking at on every refresh.');
    }

    const seen = new Set();
    const firsts = new Set();
    for (let i = 0; i < 25; i += 1) {
      const page = await pageFor(`${PROBE_SESSION}_v${i}`);
      page.forEach((s) => seen.add(s));
      if (page[0]) firsts.add(page[0]);
    }
    if (firsts.size > 1) ok(`25 visitors saw ${firsts.size} different pandits in slot 1`);
    else bad('all 25 visitors saw the same pandit at slot 1', 'This is the winner-takes-all behaviour the engine exists to remove.');

    console.log(`        ${seen.size} distinct pandits reached across 25 visitors' first pages`);
  }

  /* ── 6. exposure write ─────────────────────────────────────────────────── */
  head(6, 'Exposure — does the write path work?');

  const probe = a1.length ? a1[0] : null;
  if (!probe) {
    warn('no pandit to probe with');
  } else {
    const { rows: pr } = await query('SELECT id FROM pandits WHERE slug = $1', [probe]);
    const before = await query(
      `SELECT COUNT(*)::int AS n FROM pandit_exposure WHERE session_key = $1`, [PROBE_SESSION]);

    await repo.recordExposure([{
      panditId: pr[0].id, templeId, serviceId: null, market: 'INDIA',
      position: 1, positionWeight: 1.0, sessionKey: PROBE_SESSION,
    }]);

    const after = await query(
      `SELECT COUNT(*)::int AS n FROM pandit_exposure WHERE session_key = $1`, [PROBE_SESSION]);

    if (after.rows[0].n > before.rows[0].n) ok('exposure row written');
    else bad('exposure write produced no row', 'Check RLS grants for panditconnect_app on pandit_exposure.');

    // The hourly dedup: a refresh must not inflate exposure.
    await repo.recordExposure([{
      panditId: pr[0].id, templeId, serviceId: null, market: 'INDIA',
      position: 1, positionWeight: 1.0, sessionKey: PROBE_SESSION,
    }]);
    const again = await query(
      `SELECT COUNT(*)::int AS n FROM pandit_exposure WHERE session_key = $1`, [PROBE_SESSION]);
    if (again.rows[0].n === after.rows[0].n) ok('a repeat within the hour is deduplicated (uq_exposure_session_hour)');
    else bad('duplicate exposure was accepted', 'Ten refreshes would make everyone on the page look over-served.');

    await query('DELETE FROM pandit_exposure WHERE session_key = $1', [PROBE_SESSION]);
    console.log('        probe rows cleaned up');
  }

  /* ── 7. fairness right now ─────────────────────────────────────────────── */
  head(7, 'Current distribution');

  for (const market of ['INDIA', 'INTERNATIONAL']) {
    const stats = await repo.poolStats({ templeId, market, windowDays: 14 });
    if (!stats.length) { console.log(`        ${market}: no pandits entitled`); continue; }
    console.log(`        ${market}:`);
    for (const s of stats) {
      console.log(`          ${String(s.tier).padEnd(9)} ${String(s.pandits).padStart(4)} pandits   `
        + `leads min ${String(s.min_leads).padStart(4)}  mean ${String(s.mean_leads).padStart(7)}  max ${String(s.max_leads).padStart(4)}`);
      if (Number(s.max_leads) > 0 && Number(s.min_leads) === 0 && Number(s.pandits) > 1) {
        warn(`${market}/${s.tier}: some pandits have zero leads while others have ${s.max_leads}`,
          'Expected early on, when the window has little history. Should even out as exposure accumulates.');
      }
    }
  }

  finish();
}

function finish() {
  console.log(`\n${'═'.repeat(64)}`);
  if (failures) {
    console.log(`${failures} FAILURE(S), ${warnings} warning(s). The engine is NOT correctly wired.`);
    process.exitCode = 1;
  } else {
    console.log(`All checks passed${warnings ? `, ${warnings} warning(s)` : ''}.`);
  }
}

main()
  .catch((err) => {
    console.error('\nVerification could not run:', err.message);
    if (err.code === 'ECONNREFUSED') console.error('The database is not reachable. Is it running, and is DATABASE_URL pointing at it?');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
