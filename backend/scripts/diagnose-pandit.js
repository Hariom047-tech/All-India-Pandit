#!/usr/bin/env node
/**
 * Prints exactly what the public profile endpoint returns for one pandit, and
 * compares it against what is actually in the database.
 *
 *   node scripts/diagnose-pandit.js hariom-sharma
 *
 * Written because "the videos are not showing" has several possible causes
 * (backend not reloaded, rows missing, wrong pandit_id, media_type mismatch)
 * and they are indistinguishable from the browser.
 */
require('dotenv').config();
const { Client } = require('pg');

const slug = process.argv[2] || 'hariom-sharma';
const API = process.env.API_BASE || 'http://localhost:4000/api';

(async () => {
  console.log(`\n=== 1. API: GET ${API}/pandits/${slug} ===`);
  let api = null;
  try {
    const res = await fetch(`${API}/pandits/${slug}`);
    console.log(`  status ${res.status}`);
    api = await res.json();
    console.log(`  keys: ${Object.keys(api).join(', ')}`);
    console.log(`  videos key present? ${'videos' in api ? 'YES' : 'NO  <-- backend has NOT reloaded getBySlug()'}`);
    console.log(`  videos: ${JSON.stringify(api.videos ?? null)}`);
    console.log(`  photos: ${JSON.stringify(api.photos ?? null)}`);
    console.log(`  langs:  ${JSON.stringify(api.langs ?? null)}`);
    console.log(`  img:    ${api.img ?? null}`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    console.log('  Is the backend running on port 4000?');
  }

  console.log('\n=== 2. Database ===');
  const client = new Client({
    connectionString: process.env.DATABASE_URL
      || 'postgresql://panditconnect:panditconnect@localhost:5433/panditconnect',
  });
  try {
    await client.connect();
    const { rows: p } = await client.query(
      'SELECT id, slug, profile_photo_url, video_intro_url FROM pandits WHERE slug = $1', [slug]);
    if (!p.length) { console.log(`  No pandit with slug "${slug}"`); return; }
    const pandit = p[0];
    console.log(`  pandit.id           = ${pandit.id}`);
    console.log(`  profile_photo_url   = ${pandit.profile_photo_url}`);
    console.log(`  video_intro_url     = ${pandit.video_intro_url}`);

    const { rows: media } = await client.query(
      'SELECT id, media_type, media_url, display_order FROM pandit_media WHERE pandit_id = $1 ORDER BY media_type, display_order',
      [pandit.id]);
    console.log(`\n  pandit_media rows: ${media.length}`);
    media.forEach((m) => console.log(`    [${m.media_type}] #${m.display_order} ${m.media_url}`));

    const { rows: langs } = await client.query(
      'SELECT language FROM pandit_languages WHERE pandit_id = $1', [pandit.id]);
    console.log(`\n  pandit_languages: ${langs.map((l) => l.language).join(', ') || '(none)'}`);

    console.log('\n=== 3. Verdict ===');
    const dbVideos = media.filter((m) => m.media_type === 'video_intro').length;
    if (dbVideos === 0) {
      console.log('  No video_intro rows in the database — the uploads did not save.');
    } else if (!api || !('videos' in api)) {
      console.log(`  ${dbVideos} video(s) in the DB but the API response has no "videos" key.`);
      console.log('  => The backend is running OLD code. Restart it:  cd backend && npm run dev');
    } else if (!api.videos?.length) {
      console.log(`  ${dbVideos} video(s) in the DB but the API returned an empty array.`);
      console.log('  => Query mismatch — send this output over.');
    } else {
      console.log(`  OK: ${api.videos.length} video(s) served by the API.`);
      console.log('  If the page still shows nothing, hard-refresh the browser (Ctrl+Shift+R).');
    }
  } catch (err) {
    console.log(`  DB check failed: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
})();
