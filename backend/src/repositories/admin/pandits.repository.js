const { toSourceSurface, LEAD_REPORTING_TIMEZONE } = require('../../config/leads');
const { resolveRange } = require('../../utils/dateRange');
const qualifiedLeadsRepo = require('../qualifiedLeads.repository');

async function list(q, { search, verificationStatus, tier, isFeatured, city, minRating, page, perPage }) {
  const where = ['p.deleted_at IS NULL'];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(u.full_name ILIKE $${params.length} OR p.slug ILIKE $${params.length})`); }
  if (verificationStatus) { params.push(verificationStatus); where.push(`p.verification_status = $${params.length}`); }
  if (tier) { params.push(tier); where.push(`p.current_tier = $${params.length}`); }
  if (isFeatured !== undefined) { params.push(isFeatured === 'true'); where.push(`p.is_featured = $${params.length}`); }
  if (city) { params.push(city); where.push(`u.city = $${params.length}`); }
  if (minRating) { params.push(minRating); where.push(`p.avg_rating >= $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  params.push(perPage, (page - 1) * perPage);
  const { rows } = await q(
    `SELECT p.id, p.slug, u.full_name AS name, u.city, u.state, p.verification_status, p.current_tier,
            p.avg_rating, p.review_count, p.is_featured, p.is_available, p.rank_score, p.created_at
     FROM pandits p JOIN users u ON u.id = p.user_id
     ${whereSql} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const { rows: countRows } = await q(
    `SELECT COUNT(*)::int AS total FROM pandits p JOIN users u ON u.id = p.user_id ${whereSql}`,
    params.slice(0, params.length - 2),
  );
  return { data: rows, total: countRows[0].total };
}

async function verificationQueue(q) {
  const { rows } = await q(
    `SELECT p.id, p.slug, u.full_name AS name, u.email, u.phone, p.verification_status,
            p.id_proof_type, p.video_kyc_completed, p.created_at
     FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.verification_status IN ('documents_submitted', 'under_review') AND p.deleted_at IS NULL
     ORDER BY p.created_at`,
  );
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const { rows: certs } = await q(
    'SELECT pandit_id, certificate_name, institution, year_obtained, document_url FROM pandit_certificates WHERE pandit_id = ANY($1)',
    [ids],
  );
  return rows.map((p) => ({ ...p, certificates: certs.filter((c) => c.pandit_id === p.id) }));
}

async function findIdBySlug(q, slug) {
  const { rows } = await q('SELECT id, user_id FROM pandits WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function setVerification(q, id, { status, verifiedBy }) {
  // $2 needs two different implied types (verification_status enum for the
  // assignment, text for the CASE comparison) — Postgres can't reconcile
  // that without explicit casts on each usage ("inconsistent types deduced
  // for parameter $2" otherwise).
  const { rowCount } = await q(
    `UPDATE pandits SET verification_status = $2::verification_status,
            verified_at = CASE WHEN $2::text = 'verified' THEN NOW() ELSE verified_at END,
            verified_by = CASE WHEN $2::text = 'verified' THEN $3::uuid ELSE verified_by END
     WHERE id = $1`,
    [id, status, verifiedBy],
  );
  if (rowCount > 0) await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [id]);
  return rowCount > 0;
}

async function toggleFeatured(q, id, featured, featuredUntil) {
  const { rowCount } = await q('UPDATE pandits SET is_featured = $2, featured_until = $3 WHERE id = $1', [id, featured, featuredUntil || null]);
  return rowCount > 0;
}

async function setTier(q, id, tier, expiresAt) {
  const { rowCount } = await q('UPDATE pandits SET current_tier = $2, subscription_expires_at = $3 WHERE id = $1', [id, tier, expiresAt || null]);
  if (rowCount > 0) await q('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [id]);
  return rowCount > 0;
}

/** Legacy shape — kept for any caller still asking for the plain daily
 *  rollup rather than the full analytics() below. */
async function dailyRollup(q, id, days = 30) {
  const { rows } = await q(
    `SELECT date, profile_views, whatsapp_clicks, call_clicks, message_clicks, inquiry_count, review_count
     FROM pandit_analytics WHERE pandit_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval
     ORDER BY date`,
    [id, days],
  );
  return rows;
}

/**
 * Full admin Pandit analytics — one endpoint answering every question in
 * Section 140 for a single Pandit: lead counts by range, conversion funnel,
 * location breakdown, source-surface breakdown, per-service breakdown, and
 * exposure/fairness (reusing pandit_exposure — no duplicate accounting, per
 * Section 22's explicit instruction).
 *
 * Deliberately composes EXISTING functions rather than re-deriving lead
 * counts from scratch: countsForPandit/analyticsForPandit/listForPandit
 * already implement the today/week/month math correctly (right timezone,
 * right FILTER-not-double-count pattern) for the pandit's own dashboard —
 * reusing them here is what keeps the pandit's own numbers and the admin's
 * view of the same pandit numerically identical by construction.
 */
async function analytics(q, id, { range = '30d', from, to } = {}) {
  const bounds = await resolveRange({ range, from, to }, q);

  // Sequential, not Promise.all: `q` here is a single client bound by
  // withUserContext (see middleware/admin.js's adminHandler) and one pg
  // connection cannot run overlapping queries — the exact rule
  // me.controller.js's panditDashboard() already documents and follows.
  const counts = await qualifiedLeadsRepo.countsForPandit(id, q);
  const funnel = await qualifiedLeadsRepo.analyticsForPandit(id, q);
  // countsForPandit's "week"/"month" are the CURRENT CALENDAR week/month
  // (Monday-based, per its own comment) — genuinely different numbers from
  // a rolling "last 7 days"/"last 30 days" window, and Section 65 is
  // explicit that conflating them is a labeling bug, not a rounding detail.
  // Computed here, separately, rather than overloading countsForPandit.
  const rolling = await q(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= NOW() - interval '7 days')::int  AS rolling_7d,
       COUNT(*) FILTER (WHERE created_at >= NOW() - interval '30 days')::int AS rolling_30d
     FROM qualified_leads WHERE pandit_id = $1`,
    [id],
  ).then((r) => r.rows[0]);

  // Daily trend for the selected range — leads + clicks (pandit_analytics
  // already carries the daily view/click rollup, see Section 47: reuse the
  // existing daily-aggregate table rather than re-scanning raw events).
  const { rows: dailyClicksViews } = await q(
    `SELECT date, profile_views, whatsapp_clicks, call_clicks
       FROM pandit_analytics
      WHERE pandit_id = $1 AND date >= $2::date AND date <= $3::date
      ORDER BY date`,
    [id, bounds.from, bounds.to],
  );
  const { rows: dailyLeads } = await q(
    `SELECT (created_at AT TIME ZONE $4)::date AS date, COUNT(*)::int AS qualified_leads
       FROM qualified_leads
      WHERE pandit_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY 1`,
    [id, bounds.from, bounds.to, LEAD_REPORTING_TIMEZONE],
  );
  const { rows: dailyExposure } = await q(
    `SELECT (created_at AT TIME ZONE $4)::date AS date,
            COUNT(*)::int AS impressions, COALESCE(SUM(position_weight), 0)::float AS weighted_exposure
       FROM pandit_exposure
      WHERE pandit_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY 1`,
    [id, bounds.from, bounds.to, LEAD_REPORTING_TIMEZONE],
  );
  const leadsByDate = new Map(dailyLeads.map((r) => [String(r.date), r.qualified_leads]));
  const exposureByDate = new Map(dailyExposure.map((r) => [String(r.date), r]));
  const trends = dailyClicksViews.map((r) => ({
    date: r.date,
    profileViews: r.profile_views,
    chatClicks: r.whatsapp_clicks,
    callClicks: r.call_clicks,
    qualifiedLeads: leadsByDate.get(String(r.date)) || 0,
    weightedExposure: exposureByDate.get(String(r.date))?.weighted_exposure || 0,
    impressions: exposureByDate.get(String(r.date))?.impressions || 0,
  }));

  // Location — country/state/city, from EXISTING data (qualified_leads.market
  // for India/International, users.city/state joined for finer grain). This
  // works for every historical lead, not just ones logged after this feature
  // shipped — see db/22-user-activity-events.sql's comment on why that table
  // is NOT the source for this specific breakdown.
  const { rows: byCity } = await q(
    `SELECT COALESCE(u.city, 'Unknown') AS city, COALESCE(u.state, 'Unknown') AS state,
            COUNT(*)::int AS leads
       FROM qualified_leads ql LEFT JOIN users u ON u.id = ql.user_id
      WHERE ql.pandit_id = $1 AND ql.created_at >= $2 AND ql.created_at <= $3
      GROUP BY 1, 2 ORDER BY leads DESC LIMIT 20`,
    [id, bounds.from, bounds.to],
  );
  const { rows: byMarket } = await q(
    `SELECT COALESCE(market::text, 'UNKNOWN') AS market, COUNT(*)::int AS leads
       FROM qualified_leads
      WHERE pandit_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY 1`,
    [id, bounds.from, bounds.to],
  );

  // Source surface — bucketed from the existing free-text source column via
  // the shared canonical map (config/leads.js) rather than a second lookup.
  const { rows: sourceRows } = await q(
    `SELECT COALESCE(source, '') AS source, COUNT(*)::int AS leads
       FROM qualified_leads
      WHERE pandit_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY 1`,
    [id, bounds.from, bounds.to],
  );
  const sourceBuckets = {};
  for (const r of sourceRows) {
    const bucket = toSourceSurface(r.source);
    sourceBuckets[bucket] = (sourceBuckets[bucket] || 0) + r.leads;
  }
  const totalSourced = Object.values(sourceBuckets).reduce((a, b) => a + b, 0) || 1;
  const sources = Object.entries(sourceBuckets)
    .map(([surface, leads]) => ({ surface, leads, pct: Math.round((leads / totalSourced) * 1000) / 10 }))
    .sort((a, b) => b.leads - a.leads);

  // Per-service breakdown — views are not service-attributed today (only
  // clicks/leads carry a service_id), so this is contacts/leads only,
  // documented as such rather than inventing a views number.
  const { rows: services } = await q(
    `SELECT s.slug, s.name,
            COUNT(*)::int AS qualified_leads,
            COUNT(*) FILTER (WHERE ql.first_contact_method = 'whatsapp')::int AS chat_leads,
            COUNT(*) FILTER (WHERE ql.first_contact_method = 'phone_call')::int AS call_leads
       FROM qualified_leads ql JOIN services s ON s.id = ql.service_id
      WHERE ql.pandit_id = $1 AND ql.created_at >= $2 AND ql.created_at <= $3
      GROUP BY s.slug, s.name ORDER BY qualified_leads DESC`,
    [id, bounds.from, bounds.to],
  );

  // Exposure/fairness — reused from pandit_exposure, the table the
  // distribution engine already writes (see services/distribution/engine.js).
  // No duplicate accounting: this reads it, never writes it.
  const { rows: exposureRows } = await q(
    `SELECT COUNT(*)::int AS impressions,
            COALESCE(SUM(position_weight), 0)::float AS weighted_exposure,
            COUNT(*) FILTER (WHERE position = 1)::int AS slot1_appearances,
            COUNT(*) FILTER (WHERE position <= 3)::int AS prime_slot_impressions,
            COALESCE(AVG(position), 0)::float AS avg_position
       FROM pandit_exposure
      WHERE pandit_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [id, bounds.from, bounds.to],
  );
  const exposure = exposureRows[0];

  // Daily cap — reused from plan_market_entitlements (the same table the
  // distribution engine reads via engine.js's attachDailyCaps), not a
  // separate cap concept invented for this page. A pandit's tier can be
  // entitled in more than one market with a different cap in each, so this
  // is reported per market rather than picked arbitrarily.
  const { rows: capRows } = await q(
    `SELECT pme.market::text AS market, pme.daily_lead_cap AS cap
       FROM plan_market_entitlements pme
       JOIN pandits p ON p.current_tier = pme.tier
      WHERE p.id = $1 AND pme.is_active`,
    [id],
  );
  const todaysLeadsByMarket = await q(
    `SELECT COALESCE(market::text, 'UNKNOWN') AS market, COUNT(*)::int AS leads
       FROM qualified_leads
      WHERE pandit_id = $1 AND created_at >= (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2)
      GROUP BY 1`,
    [id, LEAD_REPORTING_TIMEZONE],
  );
  const todaysByMarket = new Map(todaysLeadsByMarket.rows.map((r) => [r.market, r.leads]));
  const dailyCaps = capRows.map((r) => {
    const used = todaysByMarket.get(r.market) || 0;
    return {
      market: r.market,
      cap: r.cap,
      usedToday: used,
      remaining: Math.max(0, r.cap - used),
      capReached: used >= r.cap,
    };
  });

  return {
    dailyCaps,
    range: { range: bounds.range, from: bounds.from, to: bounds.to },
    summary: {
      profileViews: funnel.profileViews,
      chatClicks: funnel.whatsappInteractions,
      callClicks: funnel.callInteractions,
      qualifiedLeadsToday: counts.today,
      qualifiedLeadsLast7Days: rolling.rolling_7d,
      qualifiedLeadsLast30Days: rolling.rolling_30d,
      qualifiedLeadsCalendarWeek: counts.week,
      qualifiedLeadsCalendarMonth: counts.month,
      qualifiedLeadsTotal: counts.total,
      weightedExposure: Number(exposure.weighted_exposure || 0),
      impressions: exposure.impressions,
    },
    funnel: {
      profileViews: funnel.profileViews,
      ctaClicks: funnel.ctaClicks,
      verifiedInteractions: funnel.verifiedInteractions,
      qualifiedLeads: funnel.qualifiedLeadCount,
      // Percentages, guarded against divide-by-zero (Section 75).
      viewToContactPct: funnel.profileViews > 0 ? Math.round((funnel.ctaClicks / funnel.profileViews) * 1000) / 10 : null,
      contactToQualifiedPct: funnel.ctaClicks > 0 ? Math.round((funnel.qualifiedLeadCount / funnel.ctaClicks) * 1000) / 10 : null,
      impressionToLeadPct: exposure.impressions > 0 ? Math.round((funnel.qualifiedLeadCount / exposure.impressions) * 1000) / 10 : null,
    },
    trends,
    locations: {
      byCity: byCity.map((r) => ({ city: r.city, state: r.state, leads: r.leads })),
      byMarket: byMarket.map((r) => ({ market: r.market, leads: r.leads })),
    },
    sources,
    services: services.map((r) => ({
      slug: r.slug, name: r.name, qualifiedLeads: r.qualified_leads,
      chatLeads: r.chat_leads, callLeads: r.call_leads,
    })),
    exposure: {
      impressions: exposure.impressions,
      weightedExposure: Number(exposure.weighted_exposure || 0),
      slot1Appearances: exposure.slot1_appearances,
      primeSlotImpressions: exposure.prime_slot_impressions,
      avgPosition: Number(exposure.avg_position || 0),
    },
  };
}

async function notifyUser(q, panditUserId, { type, title, body }) {
  await q(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)`,
    [panditUserId, type, title, body],
  );
}

/** Full profile, hydrated with the joined user fields plus languages/
 *  services/temples — what the admin edit form loads and what update()
 *  below returns after saving. */
async function getFullById(q, id) {
  const { rows } = await q(
    `SELECT p.id, p.slug, p.title, p.bio, p.short_bio, p.experience_years, p.primary_specialization,
            p.specializations, p.whatsapp_number, p.public_phone, p.public_email,
            p.vedic_education, p.gotra, p.tradition, p.responds_within,
            p.verification_status, p.current_tier, p.is_featured, p.is_available, p.avg_rating, p.review_count,
            u.id AS user_id, u.full_name AS name, u.email, u.phone, u.city, u.state
     FROM pandits p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const pandit = rows[0];
  const { rows: langs } = await q('SELECT language FROM pandit_languages WHERE pandit_id = $1 ORDER BY language', [id]);
  const { rows: services } = await q(
    `SELECT s.slug, s.name, ps.offers_online, s.is_online_available
       FROM pandit_services ps JOIN services s ON s.id = ps.service_id
      WHERE ps.pandit_id = $1 AND ps.is_active = TRUE ORDER BY s.name`,
    [id],
  );
  const { rows: temples } = await q(
    `SELECT t.slug, t.name, pt.association_type, pt.is_primary FROM pandit_temples pt JOIN temples t ON t.id = pt.temple_id
     WHERE pt.pandit_id = $1 AND pt.is_active = TRUE ORDER BY t.name`,
    [id],
  );
  return { ...pandit, languages: langs.map((l) => l.language), services, temples };
}

/** users + pandits are both RLS-scoped (see docs/ADMIN.md) — q here must be
 *  req.db (the admin-context-bound query fn), never the plain `query` import. */
async function update(q, id, userId, fields) {
  const userSets = [];
  const userParams = [userId];
  const userMap = { name: 'full_name', city: 'city', state: 'state', phone: 'phone' };
  for (const [key, column] of Object.entries(userMap)) {
    if (fields[key] !== undefined) { userParams.push(fields[key]); userSets.push(`${column} = $${userParams.length}`); }
  }
  if (userSets.length) await q(`UPDATE users SET ${userSets.join(', ')} WHERE id = $1`, userParams);

  const panditSets = [];
  const panditParams = [id];
  const panditMap = {
    bio: 'bio', shortBio: 'short_bio', experienceYears: 'experience_years',
    primarySpecialization: 'primary_specialization', whatsappNumber: 'whatsapp_number',
    publicPhone: 'public_phone', isAvailable: 'is_available',
    // Real credential fields (migration 08) — these used to be scraped out of
    // the bio with a regex that never matched, so the boxes rendered empty.
    vedicEducation: 'vedic_education', gotra: 'gotra', tradition: 'tradition',
    respondsWithin: 'responds_within', acceptsOnline: 'accepts_online',
  };
  for (const [key, column] of Object.entries(panditMap)) {
    if (fields[key] !== undefined) { panditParams.push(fields[key]); panditSets.push(`${column} = $${panditParams.length}`); }
  }
  if (fields.specializations !== undefined) { panditParams.push(fields.specializations); panditSets.push(`specializations = $${panditParams.length}`); }
  if (panditSets.length) await q(`UPDATE pandits SET ${panditSets.join(', ')} WHERE id = $1`, panditParams);

  if (Array.isArray(fields.languages)) {
    await q('DELETE FROM pandit_languages WHERE pandit_id = $1', [id]);
    for (const language of fields.languages) {
      await q('INSERT INTO pandit_languages (pandit_id, language) VALUES ($1, $2) ON CONFLICT (pandit_id, language) DO NOTHING', [id, language]);
    }
  }
}

/** Replace-all sync — service/temple slugs that don't resolve to a real row
 *  are silently skipped (the `SELECT ... WHERE slug = $2` finds nothing to
 *  insert) rather than failing the whole request over one typo. */
/**
 * Replaces a pandit's service mapping.
 *
 * Accepts either ["slug", ...] or [{ slug, online }, ...] — the admin UI sends
 * the richer form so it can allocate who performs which ritual online, while
 * any older caller passing plain slugs keeps working.
 */
async function syncServices(q, panditId, serviceSlugs) {
  await q('DELETE FROM pandit_services WHERE pandit_id = $1', [panditId]);
  for (const entry of serviceSlugs || []) {
    const slug = typeof entry === 'string' ? entry : entry?.slug;
    if (!slug) continue;
    const online = typeof entry === 'string' ? false : Boolean(entry.online);
    await q(
      `INSERT INTO pandit_services (pandit_id, service_id, offers_online)
       SELECT $1, id, $3 FROM services WHERE slug = $2
       ON CONFLICT (pandit_id, service_id)
         DO UPDATE SET is_active = TRUE, offers_online = EXCLUDED.offers_online`,
      [panditId, slug, online],
    );
  }
}

async function syncTemples(q, panditId, templeSlugs) {
  await q('DELETE FROM pandit_temples WHERE pandit_id = $1', [panditId]);
  for (const slug of templeSlugs) {
    await q(
      `INSERT INTO pandit_temples (pandit_id, temple_id)
       SELECT $1, id FROM temples WHERE slug = $2
       ON CONFLICT (pandit_id, temple_id) DO UPDATE SET is_active = TRUE`,
      [panditId, slug],
    );
  }
}

/**
 * Admin-provisioned pandit account — user + pandit profile + (optional)
 * subscription, created ATOMICALLY.
 *
 * One explicit transaction on one client, because a half-created pandit is
 * the worst possible outcome here: an orphan `users` row blocks the email
 * forever (UNIQUE) while being unusable, and an orphan `pandits` row breaks
 * every join that assumes the 1:1. Any failure rolls the whole thing back.
 *
 * The password arrives ALREADY bcrypt-hashed from the controller. Plaintext
 * never reaches this layer, is never bound as a query parameter, and is
 * therefore never at risk of landing in a Postgres statement log.
 */
async function createFull({
  email, fullName, phone, slug, passwordHash, dateOfBirth,
  city, state, bio, shortBio, experienceYears, languages,
  specializations, publicPhone, whatsappNumber, verificationStatus,
  planTier, planBillingCycle, planExpiresAt, createdByAdminId,
  // Deliberate oversell escape hatch (see enforce_seat_cap(), migration 19) —
  // false for every real admin call. Test fixtures set this because the
  // seeded 500-pandit dataset already saturates every tier's seat cap, and a
  // fixture is not a sale the cap is meant to stop.
  allowSeatOverflow = false,
}) {
  const { pool } = require('../../config/db');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, status,
                          date_of_birth, city, state, phone_verified)
       VALUES ($1, $2, $3, $4, 'pandit', 'active', $5, $6, $7, $8)
       RETURNING id, email, full_name, role, status`,
      [email, phone || null, passwordHash, fullName, dateOfBirth || null,
        city || null, state || null, Boolean(phone)],
    );
    const user = userRows[0];

    // pandits_insert_self checks user_id = current_app_user_id(), and that id
    // only exists now — so the RLS context is set mid-transaction, exactly as
    // auth.repository.createPandit() does for self-registration.
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', user.id]);

    const { rows: panditRows } = await client.query(
      `INSERT INTO pandits (user_id, slug, bio, short_bio, experience_years,
                            specializations, public_phone, whatsapp_number,
                            verification_status, verified_at, verified_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::verification_status,
               CASE WHEN $9::text = 'verified' THEN NOW() ELSE NULL END,
               CASE WHEN $9::text = 'verified' THEN $10::uuid ELSE NULL END)
       RETURNING id, slug`,
      [user.id, slug, bio || null, shortBio || null, experienceYears || 0,
        specializations && specializations.length ? specializations : null,
        publicPhone || phone || null, whatsappNumber || phone || null,
        verificationStatus || 'verified', createdByAdminId],
    );
    const pandit = panditRows[0];

    if (languages && languages.length) {
      await client.query(
        `INSERT INTO pandit_languages (pandit_id, language)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [pandit.id, languages],
      );
    }

    if (planTier) {
      const { rows: planRows } = await client.query(
        'SELECT id, tier FROM subscription_plans WHERE tier = $1::subscription_tier AND is_active = TRUE',
        [planTier],
      );
      if (!planRows.length) {
        // Rolls back the user and the pandit too — no orphans.
        const err = new Error(`No active subscription plan for tier "${planTier}"`);
        err.status = 400;
        throw err;
      }
      const cycle = planBillingCycle || 'monthly';
      const expiry = planExpiresAt
        ? new Date(planExpiresAt)
        : new Date(Date.now() + { monthly: 30, quarterly: 90, yearly: 365 }[cycle] * 86400000);

      if (planTier !== 'free') {
        await client.query(
          `INSERT INTO pandit_subscriptions (pandit_id, plan_id, billing_cycle, starts_at, expires_at, is_active)
           VALUES ($1, $2, $3, NOW(), $4, TRUE)`,
          [pandit.id, planRows[0].id, cycle, expiry],
        );
      }
      if (allowSeatOverflow) {
        await client.query(`SELECT set_config('app.allow_seat_overflow', 'on', true)`);
      }
      await client.query(
        'UPDATE pandits SET current_tier = $2::subscription_tier, subscription_expires_at = $3 WHERE id = $1',
        [pandit.id, planTier, planTier === 'free' ? null : expiry],
      );
    }

    await client.query('UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = $1', [pandit.id]);

    await client.query('COMMIT');
    return { user, pandit };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin-initiated password reset. Rotates the hash and revokes every live
 * session for that pandit, so a compromised session cannot outlive the
 * reset. The old password is never read, returned or logged — an admin
 * cannot recover it, only replace it.
 */
async function resetPassword(q, panditId, passwordHash) {
  const { rows } = await q(
    `UPDATE users SET password_hash = $2
      WHERE id = (SELECT user_id FROM pandits WHERE id = $1)
      RETURNING id`,
    [panditId, passwordHash],
  );
  if (!rows.length) return false;
  await q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [rows[0].id]);
  return true;
}

/** Sets or clears the DOB used as the pandit's password-reset second factor. */
async function setDateOfBirth(q, panditId, dateOfBirth) {
  const { rowCount } = await q(
    `UPDATE users SET date_of_birth = $2::date
      WHERE id = (SELECT user_id FROM pandits WHERE id = $1)`,
    [panditId, dateOfBirth || null],
  );
  return rowCount > 0;
}

module.exports = {
  createFull, resetPassword, setDateOfBirth,
  list, verificationQueue, findIdBySlug, setVerification, toggleFeatured, setTier, analytics, notifyUser,
  getFullById, update, syncServices, syncTemples,
};
