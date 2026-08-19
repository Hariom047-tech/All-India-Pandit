#!/usr/bin/env node
/**
 * Seeds 500 pandits at Maa Baglamukhi Nalkheda across the three plans.
 *
 *   npm run seed:nalkheda            create them
 *   npm run seed:nalkheda -- --dry   show what would happen
 *   npm run seed:nalkheda -- --purge remove them again
 *
 *   200 × silver  (₹5,000  Bharat)         India leads only
 *   150 × gold    (₹9,000  Global Connect) India + International
 *   150 × diamond (₹15,000 International)  International only
 *
 * These are TEST accounts. Every one is created with `seed_nalkheda_` in the
 * email and slug so --purge can find exactly them and nothing else — a seeder
 * that cannot cleanly undo itself has no business touching a database that also
 * holds real pandits.
 *
 * Profiles are deliberately UNEVEN: some complete with photo and video, some
 * thin. A uniformly perfect population would make any distribution engine look
 * fair, which would tell you nothing.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');

const MARK = 'seed_nalkheda_';
const TEMPLE_SLUG = 'maa-baglamukhi';
const PASSWORD = 'SeedPandit@2026';

const PLANS = [
  { tier: 'silver', count: 200, label: 'Bharat ₹5,000' },
  { tier: 'gold', count: 150, label: 'Global Connect ₹9,000' },
  { tier: 'diamond', count: 150, label: 'International ₹15,000' },
];

const FIRST = ['Ramesh', 'Suresh', 'Mahesh', 'Dinesh', 'Rajesh', 'Mukesh', 'Naresh', 'Umesh',
  'Girish', 'Harish', 'Manish', 'Nitesh', 'Ritesh', 'Hitesh', 'Yogesh', 'Lokesh',
  'Shyam', 'Krishna', 'Govind', 'Madhav', 'Kailash', 'Devdatt', 'Anand', 'Gopal'];
const LAST = ['Sharma', 'Shastri', 'Tiwari', 'Mishra', 'Dubey', 'Pandey', 'Trivedi', 'Chaturvedi',
  'Vyas', 'Joshi', 'Acharya', 'Upadhyay', 'Bhatt', 'Purohit', 'Dixit', 'Goswami'];

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const PURGE = argv.includes('--purge');

/** Deterministic, so re-running produces the same population. */
function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function purge() {
  // users cascade to pandits, which cascade to their services/temples/media.
  const { rowCount } = await query(`DELETE FROM users WHERE email LIKE $1`, [`${MARK}%`]);
  console.log(`Removed ${rowCount} seeded pandit account(s).`);
}

async function main() {
  if (PURGE) { await purge(); return; }

  const { rows: temples } = await query(
    `SELECT id, name FROM temples WHERE slug = $1 AND deleted_at IS NULL`, [TEMPLE_SLUG]);
  if (!temples[0]) {
    throw new Error(`Temple "${TEMPLE_SLUG}" not found. Seed the temple first, or change TEMPLE_SLUG.`);
  }
  const temple = temples[0];

  const { rows: services } = await query(
    `SELECT id, slug FROM services WHERE is_active = TRUE ORDER BY display_order, name LIMIT 12`);
  if (!services.length) throw new Error('No active services — run the base seed first.');

  const { rows: existing } = await query(
    `SELECT COUNT(*)::int AS n FROM users WHERE email LIKE $1`, [`${MARK}%`]);
  if (existing[0].n > 0) {
    console.log(`${existing[0].n} seeded pandits already exist. Purge first:  npm run seed:nalkheda -- --purge`);
    return;
  }

  const total = PLANS.reduce((a, p) => a + p.count, 0);
  console.log(`Temple : ${temple.name}`);
  console.log(`Services available: ${services.length}`);
  console.log(`Creating ${total} pandits:`);
  for (const p of PLANS) console.log(`   ${String(p.count).padStart(3)} × ${p.label}  (tier: ${p.tier})`);
  if (DRY) { console.log('\nDRY RUN — nothing written.'); return; }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const rnd = mulberry(2026);
  const expires = new Date(Date.now() + 365 * 86400000).toISOString();

  let n = 0;
  let created = 0;
  const started = Date.now();

  for (const plan of PLANS) {
    for (let i = 0; i < plan.count; i += 1) {
      n += 1;
      const q = rnd();                       // this pandit's profile richness
      const name = `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`;
      const slug = `${MARK.replace(/_/g, '-')}${n}`;
      const email = `${MARK}${n}@panditsuggest.test`;
      // +91 90000xxxxx — clearly synthetic, never a real subscriber's number.
      const phone = `9${String(1000000000 + n).slice(1)}`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        /*
         * Seeding deliberately bypasses the seat cap (migration 19).
         *
         * These 500 accounts exist to TEST the distribution engine, and the
         * whole point is to fill the plans to their caps and beyond. Being
         * blocked at seat 150 would defeat the exercise. Set per-transaction,
         * so it can never leak into a real sale.
         */
        await client.query("SELECT set_config('app.allow_seat_overflow', 'on', true)");

        const { rows: userRows } = await client.query(
          `INSERT INTO users (full_name, email, phone, password_hash, role, status,
                              phone_verified, email_verified, city, state)
           VALUES ($1,$2,$3,$4,'pandit','active',TRUE,TRUE,'Nalkheda','Madhya Pradesh')
           RETURNING id`,
          [name, email, phone, passwordHash],
        );
        const userId = userRows[0].id;

        await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);

        const { rows: panditRows } = await client.query(
          `INSERT INTO pandits
             (user_id, slug, title, bio, short_bio, experience_years,
              primary_specialization, specializations,
              public_phone, whatsapp_number, profile_photo_url, video_intro_url,
              verification_status, verified_at, video_kyc_completed,
              avg_rating, review_count, completed_ceremonies,
              current_tier, subscription_expires_at,
              is_available, accepts_online)
           VALUES ($1,$2,'Pandit',$3,$4,$5,$6,$7,$8,$8,$9,$10,
                   'verified',NOW(),$11,$12,$13,$14,$15::subscription_tier,$16,TRUE,$17)
           RETURNING id`,
          [
            userId, slug,
            q > 0.15 ? `Vedic pandit serving at ${temple.name}, Nalkheda.` : null,
            q > 0.15 ? 'Vedic rituals at Nalkheda' : null,
            Math.floor(2 + q * 28),
            q > 0.2 ? 'Havan & Anushthan' : null,
            q > 0.2 ? ['Havan', 'Anushthan', 'Puja'] : null,
            phone,
            // Uneven on purpose — the quality floor must have something to reject.
            q > 0.10 ? '/assets/img/pandits/default.jpg' : null,
            q > 0.60 ? '/assets/video/intro.mp4' : null,
            q > 0.30,
            (3.5 + q * 1.5).toFixed(2),
            Math.floor(q * q * 300),
            Math.floor(q * 400),
            plan.tier,
            expires,
            plan.tier !== 'silver',      // only India-only pandits skip online
          ],
        );
        const panditId = panditRows[0].id;

        await client.query(
          `INSERT INTO pandit_temples (pandit_id, temple_id, is_primary, association_type, is_active)
           VALUES ($1,$2,TRUE,'resident',TRUE) ON CONFLICT DO NOTHING`,
          [panditId, temple.id],
        );

        // 3–8 services each, so not every pandit matches every search.
        const count = 3 + Math.floor(q * 5);
        for (let s = 0; s < count; s += 1) {
          const svc = services[(n + s * 3) % services.length];
          await client.query(
            `INSERT INTO pandit_services (pandit_id, service_id, is_active, offers_online)
             VALUES ($1,$2,TRUE,$3) ON CONFLICT DO NOTHING`,
            [panditId, svc.id, plan.tier !== 'silver'],
          );
        }

        await client.query('COMMIT');
        created += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`  ✗ pandit ${n}: ${err.message}`);
      } finally {
        client.release();
      }

      if (n % 50 === 0) process.stdout.write(`  …${n}/${total}\n`);
    }
  }

  console.log(`\nCreated ${created}/${total} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Login for any of them: ${MARK}1@panditsuggest.test / ${PASSWORD}`);
  console.log(`\nVerify:  npm run verify:distribution`);
}

main()
  .catch((err) => { console.error('\nSeed failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
