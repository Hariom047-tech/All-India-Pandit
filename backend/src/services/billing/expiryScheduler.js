const { query } = require('../../config/db');

/**
 * Keeps `pandits.current_tier` from going stale after a paid period expires.
 *
 * This is NOT what enforces paid entitlement — the distribution engine
 * already checks `subscriptionActive` reactively at read time
 * (distribution.repository.js: `!expires_at || expires_at > NOW()`), so a
 * pandit stops getting paid-tier leads the instant they expire even if this
 * job never runs. What this job fixes is everything ELSE that reads
 * `current_tier` at face value without an expiry check — the admin pandit
 * list, the pandit's own dashboard/plan page, search result badges — which
 * would otherwise keep showing "Diamond" forever after expiry.
 *
 * Hourly is deliberately coarse: nothing here needs sub-hour precision, and
 * a tighter interval would just add load for no product benefit.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Delegates to the SECURITY DEFINER revert_expired_pandit_tiers() (migration
 * 29) rather than a plain UPDATE — this scheduler runs with no session
 * identity at all (no pandit, no admin), so it satisfies neither
 * pandits_update_self nor pandits_update_admin, and a bare UPDATE here would
 * silently match zero rows under RLS. Same class of bug as the webhook's
 * activateSubscription(), see that function's doc comment and migration
 * 29's comment for the full story.
 */
async function revertExpiredTiers() {
  const { rows } = await query('SELECT revert_expired_pandit_tiers() AS reverted_count');
  const count = rows[0].reverted_count;
  if (count) console.log(`[billing] reverted ${count} expired pandit(s) to the free tier`);
  return count;
}

let timer = null;

/** Called once from server.js at process startup — never during `npm test`,
 *  which imports app.js directly and never runs server.js's boot code. */
function start() {
  if (timer) return;
  const runSafely = () => revertExpiredTiers().catch((err) => console.error('[billing] expiry reconciliation failed:', err));
  runSafely();
  timer = setInterval(runSafely, CHECK_INTERVAL_MS);
  // Don't let this timer keep the process alive on its own (clean shutdown).
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, revertExpiredTiers };
