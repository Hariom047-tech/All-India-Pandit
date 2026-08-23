const { query } = require('../config/db');

/** Both of these read/write `inquiries`, which has RLS enabled scoped to the
 *  pandit's own inbox (inquiries_select_own_or_pandit / _update_pandit) —
 *  callers must go through withUserContext(userId, (q) => ...). */
async function inboxForPandit(userId, q = query) {
  const { rows } = await q(
    `SELECT i.id, i.full_name, i.phone, i.email, i.message, i.preferred_date, i.status, i.created_at,
            sv.name AS service, t.name AS temple
     FROM inquiries i
     JOIN pandits p ON p.id = i.pandit_id
     LEFT JOIN services sv ON sv.id = i.service_id
     LEFT JOIN temples t ON t.id = i.temple_id
     WHERE p.user_id = $1
     ORDER BY i.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

async function updateInquiryStatus(userId, inquiryId, status, q = query) {
  const { rowCount } = await q(
    `UPDATE inquiries SET status = $1 WHERE id = $2
     AND pandit_id IN (SELECT id FROM pandits WHERE user_id = $3)`,
    [status, inquiryId, userId],
  );
  return rowCount > 0;
}

/** Backed by v_pandit_dashboard (01-schema.sql) — pandit_analytics has RLS
 *  enabled too, so this also needs withUserContext. */
async function forPandit(userId, q = query) {
  const { rows } = await q('SELECT * FROM v_pandit_dashboard WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

/**
 * Resolves the authenticated user to THEIR pandit profile.
 *
 * Every pandit-scoped read and write goes through this. Nothing in the
 * dashboard, the leads list or the plan page ever accepts a pandit id from
 * the client — ownership is derived from the session, once, here. That makes
 * "Pandit A opens Pandit B's leads by changing a URL" structurally
 * impossible rather than something each handler has to remember to check.
 */
async function panditForUser(userId, q = query) {
  const { rows } = await q(
    `SELECT p.id, p.slug, p.current_tier, p.verification_status, p.is_available,
            p.subscription_expires_at, p.is_paused, p.paused_reason, p.paused_at, u.full_name
       FROM pandits p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
    [userId],
  );
  return rows[0] || null;
}

/**
 * Live plan record for the pandit's dashboard header.
 *
 * `pandits.current_tier` (passed in, already read by panditForUser) is the
 * single source of truth for WHICH plan a pandit is on — the same field the
 * distribution engine, search and admin's quick tier-set all read/write.
 * `pandit_subscriptions` is only ever a purchase-history log, so this always
 * resolves the display name/price/features from subscription_plans by that
 * tier, never from a subscription row's own tier.
 *
 * Billing metadata (cycle, started, auto-renew) is separately pulled from
 * the pandit's most recent subscription row, but ONLY trusted when that
 * row's plan actually matches current_tier — an admin quick-set (which
 * only touches pandits.current_tier, not this table) would otherwise leave
 * a stale paid purchase's dates showing under a plan the pandit is no
 * longer on. Without a match, billing fields come back null and the
 * dashboard falls back to pandits.subscription_expires_at for the date.
 */
async function subscriptionForPandit(panditId, currentTier, q = query) {
  const { rows: planRows } = await q(
    `SELECT name, tier, price_monthly, price_quarterly, price_yearly,
            currency, features, description, tagline
       FROM subscription_plans WHERE tier = $1`,
    [currentTier],
  );
  const plan = planRows[0] || null;

  const { rows: subRows } = await q(
    `SELECT sp.tier, ps.billing_cycle, ps.starts_at, ps.expires_at, ps.is_active, ps.auto_renew
       FROM pandit_subscriptions ps
       JOIN subscription_plans sp ON sp.id = ps.plan_id
      WHERE ps.pandit_id = $1
      ORDER BY ps.is_active DESC, ps.expires_at DESC
      LIMIT 1`,
    [panditId],
  );
  const sub = subRows[0];
  const billing = sub && sub.tier === currentTier ? sub : null;

  return {
    name: plan?.name || null,
    tier: currentTier,
    price_monthly: plan?.price_monthly ?? null,
    price_quarterly: plan?.price_quarterly ?? null,
    price_yearly: plan?.price_yearly ?? null,
    currency: plan?.currency ?? 'INR',
    features: plan?.features ?? [],
    description: plan?.description ?? null,
    tagline: plan?.tagline ?? null,
    billing_cycle: billing?.billing_cycle ?? null,
    starts_at: billing?.starts_at ?? null,
    is_active: billing ? billing.is_active : currentTier !== 'free',
    auto_renew: billing?.auto_renew ?? null,
  };
}

/**
 * Fields a pandit may change about themselves.
 *
 * An ALLOW-LIST, and a short one. verification_status, current_tier,
 * is_featured, rank_score and slug are all absent on purpose: those are
 * admin-controlled or system-computed, and letting a pandit self-serve any
 * of them would let them award themselves a verified badge, a paid tier or
 * a better ranking. Postgres also enforces this — pandits_update_self only
 * grants row access, so the column list here is the real boundary.
 */
const PANDIT_EDITABLE = {
  bio: 'bio',
  shortBio: 'short_bio',
  experienceYears: 'experience_years',
  primarySpecialization: 'primary_specialization',
  specializations: 'specializations',
  publicPhone: 'public_phone',
  whatsappNumber: 'whatsapp_number',
  publicEmail: 'public_email',
  isAvailable: 'is_available',
  acceptsOnline: 'accepts_online',
  travelRadiusKm: 'travel_radius_km',
};

async function updateOwnProfile(userId, fields, q = query) {
  const sets = [];
  const params = [userId];
  for (const [key, column] of Object.entries(PANDIT_EDITABLE)) {
    if (fields[key] === undefined) continue;
    params.push(fields[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return null;

  const { rows } = await q(
    `UPDATE pandits SET ${sets.join(', ')}
      WHERE user_id = $1 AND deleted_at IS NULL
      RETURNING id, slug, bio, short_bio, experience_years, primary_specialization,
                specializations, public_phone, whatsapp_number, public_email,
                is_available, accepts_online, travel_radius_km,
                verification_status, current_tier`,
    params,
  );
  if (rows[0]) await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [rows[0].id]);
  return rows[0] || null;
}

/** Full own-profile read for the dashboard's profile screen. */
async function ownProfile(userId, q = query) {
  const { rows } = await q(
    `SELECT p.id, p.slug, p.title, p.bio, p.short_bio, p.experience_years,
            p.primary_specialization, p.specializations, p.public_phone,
            p.whatsapp_number, p.public_email, p.profile_photo_url, p.video_intro_url,
            p.is_available, p.accepts_online, p.travel_radius_km,
            p.verification_status, p.current_tier, p.is_featured,
            p.avg_rating, p.review_count,
            u.full_name, u.email, u.phone, u.city, u.state
       FROM pandits p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
    [userId],
  );
  if (!rows[0]) return null;
  const { rows: langs } = await q(
    'SELECT language FROM pandit_languages WHERE pandit_id = $1 ORDER BY language', [rows[0].id]);
  return { ...rows[0], languages: langs.map((l) => l.language) };
}

module.exports = {
  inboxForPandit, updateInquiryStatus, forPandit, panditForUser,
  subscriptionForPandit, updateOwnProfile, ownProfile, PANDIT_EDITABLE,
};
