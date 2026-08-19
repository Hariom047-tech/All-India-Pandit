const { query } = require('../config/db');

/**
 * Writes to user_activity_events — the admin-visible cross-role activity
 * timeline (see db/22-user-activity-events.sql).
 *
 * BEST-EFFORT, ALWAYS. This function never throws and is meant to be called
 * with `void logActivityEvent(...)` (fire-and-forget) from any user-facing
 * request handler — a page view or a chat click must succeed for the
 * devotee even if this insert fails or the DB is briefly unavailable. This
 * is the exact distinction Section 104-106 of the task draws: Qualified
 * Lead creation is transactional and must never be weakened into this path;
 * this path is telemetry, and telemetry failing must never be visible to
 * the user.
 *
 * Do NOT call this synchronously-awaited inside a transaction that also
 * writes a Qualified Lead — it deliberately has its own connection via the
 * plain `query` import, not the caller's transaction client, so a slow or
 * failing activity write can never hold a lock a lead-creation transaction
 * is waiting on.
 */
async function logActivityEvent({
  userId = null,
  sessionKey = null,
  panditId = null,
  eventType,
  sourceSurface = null,
  templeId = null,
  serviceId = null,
  country = null,
  region = null,
  city = null,
  market = null,
  locationSource = null,
  qualifiedLeadId = null,
  deviceType = null,
  metadata = null,
}) {
  try {
    await query(
      `INSERT INTO user_activity_events
         (user_id, session_key, pandit_id, event_type, source_surface, temple_id, service_id,
          country, region, city, market, location_source, qualified_lead_id, device_type, metadata)
       VALUES ($1, $2, $3, $4::activity_event_type, $5::activity_source_surface, $6, $7,
               $8, $9, $10, $11::lead_market, $12, $13, $14, $15::jsonb)`,
      [
        userId, sessionKey ? String(sessionKey).slice(0, 64) : null, panditId, eventType, sourceSurface,
        templeId, serviceId, country, region, city, market, locationSource, qualifiedLeadId, deviceType,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    // Never propagate — see the doc comment above. A failure here is a
    // monitoring concern (Section 103), not a user-facing one.
    console.error('[activity] event write failed (non-fatal):', eventType, err.message);
  }
}

/**
 * Coarse device category from a User-Agent string. Normalizes to
 * mobile/desktop/tablet — the raw UA string is never stored (Section 29:
 * "do not store raw user agent strings indefinitely unless needed").
 */
function deviceTypeFromUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet(?!.*mobile)/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Has this (pandit, event type, actor) combination already fired inside the
 * dedup window? Actor is the user id when logged in, else the session key —
 * mirrors pandit_exposure's own per-session dedup so a page reload / React
 * StrictMode double-invoke / retry does not inflate the admin-visible count
 * (Section 35/36).
 */
async function recentlyLogged({ panditId, eventType, userId, sessionKey, windowMinutes = 60 }) {
  if (!panditId || (!userId && !sessionKey)) return false;
  try {
    const { rows } = await query(
      `SELECT 1 FROM user_activity_events
        WHERE pandit_id = $1 AND event_type = $2::activity_event_type
          AND ${userId ? 'user_id = $3' : 'session_key = $3'}
          AND created_at > NOW() - ($4 || ' minutes')::interval
        LIMIT 1`,
      [panditId, eventType, userId ? userId : String(sessionKey).slice(0, 64), String(windowMinutes)],
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[activity] dedup check failed (treating as not-a-duplicate):', err.message);
    return false;
  }
}

module.exports = { logActivityEvent, deviceTypeFromUserAgent, recentlyLogged };
