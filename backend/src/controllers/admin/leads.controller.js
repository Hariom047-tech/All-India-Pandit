const repo = require('../../repositories/leadDistribution.repository');
const { logAdminAction } = require('../../utils/adminLog');

const getSettings = async (req, res) => res.json(await repo.getSettings(req.db));

async function saveSettings(req, res) {
  const { enabled, windowDays, strength, maxShareMultiplier, dailyLimit, sessionResetTime } = req.body || {};
  if (windowDays !== undefined && (windowDays < 1 || windowDays > 180)) {
    return res.status(400).json({ error: 'windowDays must be between 1 and 180' });
  }
  if (strength !== undefined && (strength < 0 || strength > 1)) {
    return res.status(400).json({ error: 'strength must be between 0 and 1' });
  }
  if (maxShareMultiplier !== undefined && maxShareMultiplier < 1) {
    return res.status(400).json({ error: 'maxShareMultiplier must be at least 1' });
  }
  const settings = await repo.saveSettings({ enabled, windowDays, strength, maxShareMultiplier, dailyLimit, sessionResetTime }, req.adminUser.id, req.db);
  await logAdminAction({ adminUserId: req.adminUser.id, action: 'LEAD_DISTRIBUTION_SETTINGS_UPDATED', details: settings, ip: req.ip });
  res.json(settings);
}

/** Per-tier fairness breakdown — same computation the public ranked-order
 *  endpoint uses, formatted for a human to sanity-check: who's under/over
 *  their fair share right now, and by how much. */
async function overview(req, res) {
  const { settings, pandits } = await repo.computeFairRanking(req.db);

  const byTier = {};
  for (const p of pandits) {
    const tier = byTier[p.tier] || (byTier[p.tier] = { tier: p.tier, pandits: [], totalLeads: 0 });
    tier.pandits.push(p);
    tier.totalLeads += p.leads;
  }
  const tiers = Object.values(byTier)
    .map((t) => ({
      ...t,
      pandits: t.pandits.sort((a, b) => b.displayScore - a.displayScore),
      underServedCount: t.pandits.filter((p) => p.fairnessDelta > 0.02).length,
      overServedCount: t.pandits.filter((p) => p.overCap).length,
    }))
    .sort((a, b) => b.pandits.length - a.pandits.length);

  res.json({ settings, totalPandits: pandits.length, totalLeadsInWindow: pandits.reduce((s, p) => s + p.leads, 0), tiers });
}

module.exports = { getSettings, saveSettings, overview };
