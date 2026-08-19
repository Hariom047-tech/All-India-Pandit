/**
 * Single source of truth for every Qualified Lead tunable.
 *
 * Deliberately centralised: the deduplication window in particular is a
 * business rule that appears in the contact endpoint, the pandit dashboard
 * copy, the fairness engine's daily cap and the test suite. Hardcoding "24"
 * in four places is how those four places quietly drift apart.
 */

function intFromEnv(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) {
    throw new Error(`[config] ${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return n;
}

/** Same verified user + same pandit inside this window = ONE qualified lead. */
const QUALIFIED_LEAD_DEDUP_HOURS = intFromEnv('QUALIFIED_LEAD_DEDUP_HOURS', 24, { min: 1, max: 720 });

/**
 * Reporting timezone for "today / this week / this month".
 *
 * Hardcoded to the business's market rather than read from the server clock:
 * a container running UTC would otherwise roll "today" over at 05:30 IST,
 * midway through a pandit's working morning, and the dashboard would appear
 * to lose leads. Overridable for a future multi-region deployment.
 */
const LEAD_REPORTING_TIMEZONE = process.env.LEAD_REPORTING_TIMEZONE || 'Asia/Kolkata';

/** Contact methods that can produce a lead. Views and in-app messages cannot. */
const QUALIFYING_CONTACT_METHODS = Object.freeze(['phone_call', 'whatsapp']);

/**
 * Frontend-friendly aliases. The UI has always posted `call`; the database
 * enum has always been `phone_call`. Normalising in one place stops that
 * mismatch leaking into new code.
 */
const CONTACT_METHOD_ALIASES = Object.freeze({
  call: 'phone_call',
  phone: 'phone_call',
  phone_call: 'phone_call',
  whatsapp: 'whatsapp',
});

function normalizeContactMethod(method) {
  if (typeof method !== 'string') return null;
  return CONTACT_METHOD_ALIASES[method.trim().toLowerCase()] || null;
}

/** Reasons a contact did not become a qualified lead. Mirrored by record_qualified_lead(). */
const LEAD_REJECTION = Object.freeze({
  NOT_AUTHENTICATED: 'not_authenticated',
  USER_NOT_ACTIVE: 'user_not_active',
  USER_NOT_VERIFIED: 'user_not_verified',
  PANDIT_NOT_FOUND: 'pandit_not_found',
  SELF_CONTACT: 'self_contact',
  METHOD_NOT_QUALIFYING: 'method_not_qualifying',
  DUPLICATE_WINDOW: 'duplicate_window',
});

/**
 * Canonical source-surface enum, mapped from the free-text `source` strings
 * the frontend sends today (PanditCard's `sourceSurface` prop, PanditProfile's
 * own CTA, AiRecommender) into a fixed set. Section 107's exact complaint —
 * "do not store 'Temple page'/'temple'/'TempleDetail' as three different
 * values" — is why this exists as one shared lookup, used both when writing
 * user_activity_events (pandits.controller.js) and when reading the lead
 * source-surface breakdown back out for admin analytics
 * (admin/pandits.repository.js) — one mapping, not two that can drift apart.
 * qualified_leads.source / contact_clicks.source_page stay free text,
 * unchanged — this only governs the canonical bucket a value is read into.
 */
const SOURCE_SURFACE_MAP = {
  home: 'HOME',
  pandit_directory: 'PANDIT_DIRECTORY',
  temple_detail: 'TEMPLE_DETAIL',
  service_detail: 'SERVICE_DETAIL',
  search: 'SEARCH',
  pandit_profile: 'PANDIT_PROFILE',
  sticky_bar: 'PANDIT_PROFILE',
  similar_pandits: 'PANDIT_PROFILE',
  ai_guide: 'AI_GUIDE',
};
function toSourceSurface(rawSource) {
  return SOURCE_SURFACE_MAP[String(rawSource || '').toLowerCase()] || 'OTHER';
}

module.exports = {
  QUALIFIED_LEAD_DEDUP_HOURS,
  LEAD_REPORTING_TIMEZONE,
  QUALIFYING_CONTACT_METHODS,
  CONTACT_METHOD_ALIASES,
  normalizeContactMethod,
  LEAD_REJECTION,
  SOURCE_SURFACE_MAP,
  toSourceSurface,
};
