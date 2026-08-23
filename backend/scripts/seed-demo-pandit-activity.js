/**
 * Demo-data seeder for ONE pandit's dashboard.
 *
 * WHY THIS EXISTS: a freshly-provisioned pandit account has zero leads, zero
 * views, zero trend history — which makes the redesigned dashboard (charts,
 * geo breakdown) look broken rather than empty. This script fills in a
 * realistic 45-day activity history for one pandit (qualified leads across
 * India + a few overseas markets, matching contact_clicks, and a daily
 * pandit_analytics rollup) so the dashboard can be reviewed as it will look
 * once real traffic accumulates.
 *
 * This is a LOCAL/DEMO tool only — never run against production. It writes
 * directly with the schema owner connection (bypasses RLS) because it is
 * backdating history no real request flow can produce (record_qualified_lead
 * and the view/click endpoints always stamp "now").
 *
 * Usage:
 *   node scripts/seed-demo-pandit-activity.js [pandit-slug]
 *   FORCE=1 node scripts/seed-demo-pandit-activity.js [pandit-slug]   # reseed even if data exists
 *
 * Idempotency: skips (no-op) if the pandit already has 10+ qualified leads,
 * unless FORCE=1.
 */
const { Pool } = require('pg');

const SLUG = process.argv[2] || 'ramesh-sharma';
const FORCE = process.env.FORCE === '1';
const REPORTING_TZ = process.env.LEAD_REPORTING_TIMEZONE || 'Asia/Kolkata';
const DAYS_OF_HISTORY = 45;

const ownerUrl = process.env.DATABASE_OWNER_URL
  || (process.env.DATABASE_URL || '').replace('panditconnect_app:panditconnect_app_dev', 'panditconnect:panditconnect')
  || 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect';

const pool = new Pool({ connectionString: ownerUrl });

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function pickWeighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
/** N days ago at a random hour, so timestamps don't all land on the same clock tick. */
function timeAgo(daysBack, hour = randInt(8, 21)) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
  return d;
}
function dateKeyIST(d) {
  // Matches the (NOW() AT TIME ZONE tz)::date convention used everywhere else.
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const INDIAN_DEVOTEES = [
  { name: 'Priya Sharma', city: 'Indore', state: 'Madhya Pradesh', phone: '+919812345601' },
  { name: 'Rohit Verma', city: 'Indore', state: 'Madhya Pradesh', phone: '+919812345602' },
  { name: 'Anjali Mehta', city: 'Mumbai', state: 'Maharashtra', phone: '+919812345603' },
  { name: 'Suresh Patel', city: 'Ahmedabad', state: 'Gujarat', phone: '+919812345604' },
  { name: 'Kavita Singh', city: 'Delhi', state: 'Delhi', phone: '+919812345605' },
  { name: 'Manoj Kumar', city: 'Jaipur', state: 'Rajasthan', phone: '+919812345606' },
  { name: 'Deepa Nair', city: 'Pune', state: 'Maharashtra', phone: '+919812345607' },
  { name: 'Ramesh Yadav', city: 'Lucknow', state: 'Uttar Pradesh', phone: '+919812345608' },
  { name: 'Sunita Rao', city: 'Bengaluru', state: 'Karnataka', phone: '+919812345609' },
  { name: 'Vikram Malhotra', city: 'Chandigarh', state: 'Chandigarh', phone: '+919812345610' },
  { name: 'Neha Joshi', city: 'Bhopal', state: 'Madhya Pradesh', phone: '+919812345611' },
  { name: 'Arjun Reddy', city: 'Hyderabad', state: 'Telangana', phone: '+919812345612' },
];
// City/state left null on purpose: an overseas devotee's own profile
// realistically may not have an Indian city/state filled in, and this keeps
// the "Top Cities" list honestly India-only while "Top Countries" still
// shows the full international spread.
const OVERSEAS_DEVOTEES = [
  { name: 'Rajesh Gupta', phone: '+12025550111' },   // US
  { name: 'Amit Shah', phone: '+14155550122' },      // US
  { name: 'Pooja Iyer', phone: '+447700900131' },    // UK
  { name: 'Sanjay Desai', phone: '+447700900142' },  // UK
  { name: 'Meera Kapoor', phone: '+61412345153' },   // Australia
  { name: 'Farhan Sheikh', phone: '+971501234567' }, // UAE
];

const METHODS = ['phone_call', 'whatsapp'];
const SEED_PASSWORD_HASH = '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym'; // PanditConnect@2026

async function main() {
  const client = await pool.connect();
  try {
    const { rows: panditRows } = await client.query(
      `SELECT id FROM pandits WHERE slug = $1 AND deleted_at IS NULL`, [SLUG],
    );
    if (!panditRows.length) throw new Error(`No pandit with slug "${SLUG}"`);
    const panditId = panditRows[0].id;

    const { rows: existing } = await client.query(
      `SELECT COUNT(*)::int AS c FROM qualified_leads WHERE pandit_id = $1`, [panditId],
    );
    if (existing[0].c >= 10 && !FORCE) {
      console.log(`Pandit "${SLUG}" already has ${existing[0].c} qualified leads — skipping (set FORCE=1 to reseed on top).`);
      return;
    }

    console.log(`Seeding demo activity for pandit "${SLUG}" (${panditId})...`);
    await client.query('BEGIN');

    // ---- 1. Devotees -----------------------------------------------------
    const suffix = Date.now().toString(36);
    const devotees = [];
    for (const d of [...INDIAN_DEVOTEES, ...OVERSEAS_DEVOTEES]) {
      const email = `${d.name.toLowerCase().replace(/[^a-z]+/g, '-')}-${suffix}@panditconnect.demo`;
      const { rows } = await client.query(
        `INSERT INTO users (email, phone, password_hash, full_name, role, status, city, state, phone_verified, email_verified)
         VALUES ($1, $2, $3, $4, 'devotee', 'active', $5, $6, TRUE, TRUE)
         ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id, phone`,
        [email, d.phone, SEED_PASSWORD_HASH, d.name, d.city || null, d.state || null],
      );
      devotees.push({ ...d, id: rows[0].id });
    }
    console.log(`  ${devotees.length} devotee accounts ready (${INDIAN_DEVOTEES.length} India, ${OVERSEAS_DEVOTEES.length} overseas).`);

    // ---- 2. Qualified leads + their contact_clicks ------------------------
    // Each devotee gets 1 lead-event; ~1 in 3 also gets an older SECOND
    // lead-event (a returning devotee, well outside the 24h dedup window —
    // two genuinely separate leads, not a repeat interaction on one).
    const leadEvents = [];
    for (const d of devotees) {
      leadEvents.push({ devotee: d, daysBack: randInt(0, 6) }); // recent
      if (Math.random() < 0.33) leadEvents.push({ devotee: d, daysBack: randInt(15, DAYS_OF_HISTORY) }); // older repeat
    }
    // A few extra very-recent leads so "Today" / "This Week" are never zero.
    leadEvents.push({ devotee: pick(devotees), daysBack: 0 });
    leadEvents.push({ devotee: pick(devotees), daysBack: 0 });
    leadEvents.push({ devotee: pick(devotees), daysBack: 1 });

    let leadCount = 0, clickCount = 0, callCount = 0, whatsappCount = 0;
    const dailyClicks = new Map(); // dateKey -> { call, whatsapp }

    function bumpDaily(dateKey, method) {
      const row = dailyClicks.get(dateKey) || { call: 0, whatsapp: 0 };
      if (method === 'phone_call') row.call += 1; else row.whatsapp += 1;
      dailyClicks.set(dateKey, row);
    }

    for (const ev of leadEvents) {
      const method = pick(METHODS);
      const createdAt = timeAgo(ev.daysBack);
      const isIndian = INDIAN_DEVOTEES.some((x) => x.phone === ev.devotee.phone);
      const market = isIndian ? 'INDIA' : 'INTERNATIONAL';

      // Status reflects age: older leads have had time to be worked; today's
      // leads are still fresh.
      const status = ev.daysBack === 0
        ? pickWeighted([['new', 3], ['viewed', 1]])
        : ev.daysBack <= 3
          ? pickWeighted([['viewed', 2], ['contacted', 2], ['new', 1]])
          : ev.daysBack <= 12
            ? pickWeighted([['contacted', 3], ['completed', 2], ['not_reachable', 1]])
            : pickWeighted([['completed', 4], ['not_reachable', 2], ['contacted', 1]]);

      const interactionCount = Math.random() < 0.25 ? randInt(2, 3) : 1;
      const lastInteractionAt = interactionCount > 1
        ? new Date(createdAt.getTime() + randInt(5, 180) * 60_000)
        : createdAt;

      const { rows } = await client.query(
        `INSERT INTO qualified_leads (
           pandit_id, user_id, first_contact_method, last_contact_method, interaction_count,
           status, source, contact_name_snapshot, contact_phone_snapshot,
           contact_city_snapshot, contact_state_snapshot,
           dedup_window_ends_at, created_at, last_interaction_at, status_changed_at,
           market, market_source
         ) VALUES ($1,$2,$3::contact_method,$3::contact_method,$4,$5::lead_status,'seed_demo',$6,$7,
           $8, $9, $10, $10, $11, $11, $12::lead_market, 'VERIFIED_PHONE')
         RETURNING id`,
        [panditId, ev.devotee.id, method, interactionCount, status,
          ev.devotee.name, ev.devotee.phone, ev.devotee.city || null, ev.devotee.state || null,
          createdAt, lastInteractionAt, market],
      );
      const leadId = rows[0].id;
      leadCount += 1;

      // The qualifying click.
      await client.query(
        `INSERT INTO contact_clicks (pandit_id, user_id, contact_method, source_page, qualified_lead_id, created_qualified_lead, created_at)
         VALUES ($1,$2,$3::contact_method,'pandit_profile',$4,TRUE,$5)`,
        [panditId, ev.devotee.id, method, leadId, createdAt],
      );
      clickCount += 1; if (method === 'phone_call') callCount += 1; else whatsappCount += 1;
      bumpDaily(dateKeyIST(createdAt), method);

      // Repeat clicks on the same lead (interaction_count > 1).
      for (let i = 1; i < interactionCount; i += 1) {
        const repeatMethod = pick(METHODS);
        const repeatAt = new Date(createdAt.getTime() + randInt(5, 180) * 60_000 * i);
        await client.query(
          `INSERT INTO contact_clicks (pandit_id, user_id, contact_method, source_page, qualified_lead_id, created_qualified_lead, created_at)
           VALUES ($1,$2,$3::contact_method,'pandit_profile',$4,FALSE,$5)`,
          [panditId, ev.devotee.id, repeatMethod, leadId, repeatAt],
        );
        clickCount += 1; if (repeatMethod === 'phone_call') callCount += 1; else whatsappCount += 1;
        bumpDaily(dateKeyIST(repeatAt), repeatMethod);
      }
    }
    console.log(`  ${leadCount} qualified leads, ${clickCount} linked contact_clicks.`);

    // ---- 3. Guest / anonymous clicks (funnel realism: CTA clicks > verified) --
    const guestClickCount = randInt(12, 20);
    for (let i = 0; i < guestClickCount; i += 1) {
      const method = pick(METHODS);
      const at = timeAgo(randInt(0, DAYS_OF_HISTORY));
      await client.query(
        `INSERT INTO contact_clicks (pandit_id, user_id, contact_method, source_page, created_qualified_lead, created_at)
         VALUES ($1, NULL, $2::contact_method, 'pandit_directory', FALSE, $3)`,
        [panditId, method, at],
      );
      clickCount += 1; if (method === 'phone_call') callCount += 1; else whatsappCount += 1;
      bumpDaily(dateKeyIST(at), method);
    }
    console.log(`  ${guestClickCount} guest (anonymous) contact_clicks added.`);

    // ---- 4. Daily pandit_analytics rollup (profile views + matching clicks) --
    let totalViews = 0;
    for (let daysBack = DAYS_OF_HISTORY - 1; daysBack >= 0; daysBack -= 1) {
      const day = timeAgo(daysBack, 12);
      const key = dateKeyIST(day);
      const isWeekend = [0, 6].includes(day.getDay());
      // Mild growth trend toward "today" + weekday bump — just enough to make
      // the trend chart look like a living profile, not noise.
      const growth = 1 + (DAYS_OF_HISTORY - daysBack) / DAYS_OF_HISTORY;
      const views = Math.max(0, Math.round(randInt(2, 9) * growth * (isWeekend ? 0.7 : 1)));
      totalViews += views;
      const clicks = dailyClicks.get(key) || { call: 0, whatsapp: 0 };

      await client.query(
        `INSERT INTO pandit_analytics (pandit_id, date, profile_views, call_clicks, whatsapp_clicks)
         VALUES ($1, $2::date, $3, $4, $5)
         ON CONFLICT (pandit_id, date) DO UPDATE
           SET profile_views  = pandit_analytics.profile_views + EXCLUDED.profile_views,
               call_clicks    = pandit_analytics.call_clicks + EXCLUDED.call_clicks,
               whatsapp_clicks= pandit_analytics.whatsapp_clicks + EXCLUDED.whatsapp_clicks`,
        [panditId, key, views, clicks.call, clicks.whatsapp],
      );
    }
    console.log(`  ${DAYS_OF_HISTORY} days of pandit_analytics rollup written (${totalViews} profile views).`);

    // ---- 5. Denormalised lifetime counters on pandits ----------------------
    await client.query(
      `UPDATE pandits
          SET total_profile_views  = total_profile_views + $2,
              total_contact_clicks = total_contact_clicks + $3,
              total_call_clicks    = total_call_clicks + $4,
              total_whatsapp_clicks= total_whatsapp_clicks + $5
        WHERE id = $1`,
      [panditId, totalViews, clickCount, callCount, whatsappCount],
    );

    await client.query('COMMIT');
    console.log(`Done. Pandit "${SLUG}" now has ${leadCount} qualified leads across India + US/UK/Australia/UAE, `
      + `${clickCount} total contact clicks, and ${totalViews} profile views over the last ${DAYS_OF_HISTORY} days.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
