/**
 * Lead Distribution Engine — keeps same-tier pandits from a permanent
 * winner-takes-all order by nudging the public display order toward
 * whoever's *under* their fair share of recent leads, and away from
 * whoever's over it. Operates entirely on top of the existing rank_score
 * (rating/reviews/tier/verification — untouched) as an additive adjustment,
 * so a paid tier still generally outranks a lower one; it only rebalances
 * *within* a tier, where "same plan, same visibility" is the actual ask.
 *
 * Reads inquiries counts through get_pandit_lead_counts() (see
 * 01-schema.sql) — a SECURITY DEFINER function, because inquiries has no
 * public SELECT policy and this needs to run for anonymous, unauthenticated
 * requests (the public pandits listing).
 */
const { query } = require('../config/db');

const SETTING_PREFIX = 'lead_distribution.';
const DEFAULTS = {
  enabled: true,
  windowDays: 14,       // rolling window leads are measured over
  strength: 0.6,         // 0..1 — how hard the fairness nudge pushes
  maxShareMultiplier: 3, // a pandit taking > this × their fair share gets an extra penalty
  dailyLimit: 5,         // max leads (clicks + inquiries) per day
  sessionResetTime: '00:00', // time of day the session resets (HH:mm)
};

async function getSettings(q = query) {
  const { rows } = await q(`SELECT key, value FROM platform_settings WHERE key LIKE $1`, [`${SETTING_PREFIX}%`]);
  const stored = Object.fromEntries(rows.map((r) => [r.key.slice(SETTING_PREFIX.length), r.value]));
  return { ...DEFAULTS, ...stored };
}

async function saveSettings(fields, updatedBy, q = query) {
  const allowed = Object.keys(DEFAULTS);
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    await q(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [`${SETTING_PREFIX}${key}`, JSON.stringify(fields[key]), updatedBy],
    );
  }
  return getSettings(q);
}

/** Core computation, shared by the public ranked-order endpoint and the
 *  admin overview. Returns every active, verified pandit with a
 *  displayScore — sort by that, descending, for the fairness-aware order. */
async function computeFairRanking(q = query) {
  const settings = await getSettings(q);

  const { rows: pandits } = await q(
    `SELECT p.id, p.slug, u.full_name AS name, p.current_tier, p.rank_score, p.total_profile_views
     FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL AND u.status = 'active'
       AND p.verification_status = 'verified' AND p.is_available = TRUE`,
  );

  if (!pandits.length) return { settings, pandits: [] };

  let leadsById = new Map();
  if (settings.enabled) {
    const since = new Date(Date.now() - settings.windowDays * 24 * 60 * 60 * 1000);
    const [hours, minutes] = (settings.sessionResetTime || '00:00').split(':').map(Number);
    let todayStart = new Date();
    todayStart.setHours(hours, minutes, 0, 0);
    if (new Date() < todayStart) {
      todayStart.setDate(todayStart.getDate() - 1);
    }

    const { rows: leadRows } = await q(`
      SELECT pandit_id, window_leads, today_leads
      FROM get_pandit_lead_counts($1, $2)
    `, [since, todayStart]);
    
    leadsById = new Map(leadRows.map((r) => [r.pandit_id, { window: Number(r.window_leads), today: Number(r.today_leads) }]));
  }

  const byTier = new Map();
  for (const p of pandits) {
    const list = byTier.get(p.current_tier) || [];
    list.push(p);
    byTier.set(p.current_tier, list);
  }

  const enriched = [];
  for (const [tier, group] of byTier) {
    const leads = group.map((p) => leadsById.get(p.id) || { window: 0, today: 0 });
    const totalTierLeads = leads.reduce((a, b) => a + b.window, 0);
    const fairShare = 1 / group.length;

    group.forEach((p, i) => {
      const { window: leadCount, today: todayLeads } = leads[i];
      const actualShare = totalTierLeads ? leadCount / totalTierLeads : 0;
      const fairnessDelta = fairShare - actualShare; // positive = under-served, negative = over-served
      const overCap = settings.enabled && totalTierLeads > 0 && actualShare > fairShare * settings.maxShareMultiplier;
      const dailyCapReached = settings.enabled && todayLeads >= (settings.dailyLimit || 5);
      
      const boost = settings.enabled ? fairnessDelta * settings.strength * 25 : 0;
      const capPenalty = overCap ? -10 : 0;
      const dailyPenalty = dailyCapReached ? -1000 : 0;

      enriched.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        tier,
        totalProfileViews: Number(p.total_profile_views) || 0,
        rankScore: Number(p.rank_score),
        leads: leadCount,
        todayLeads,
        dailyCapReached,
        tierSize: group.length,
        expectedShare: fairShare,
        actualShare,
        fairnessDelta,
        boost: boost + capPenalty + dailyPenalty,
        overCap,
        displayScore: Number(p.rank_score) + boost + capPenalty + dailyPenalty,
      });
    });
  }

  enriched.sort((a, b) => b.displayScore - a.displayScore);
  return { settings, pandits: enriched };
}

module.exports = { DEFAULTS, getSettings, saveSettings, computeFairRanking };
