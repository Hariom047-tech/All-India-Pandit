/**
 * What a proposed distribution setting would actually DO. Pure.
 *
 * This is the most important file in the admin panel, and it is deliberately
 * separate from the panel itself.
 *
 * The reason: the plan ladder on this platform is currently INVERTED — a ₹9,000
 * subscriber receives fewer leads than a ₹5,000 subscriber (₹143 vs ₹346 per
 * lead). That did not happen through carelessness. It happened because
 * percentages hide seat counts:
 *
 *     70% of India traffic ÷ 200 Bharat seats  = 35.0 leads per seat
 *     30% of India traffic ÷ 150 Global seats  = 20.0 leads per seat
 *
 * Both numbers look reasonable on a slider. The inversion only appears when you
 * divide by seats, which nobody does in their head. So the panel computes it on
 * every keystroke and shows it before the change is saved.
 *
 * Everything here is pure so the same maths can be unit-tested and reused by
 * the simulator — a projection that disagrees with the simulator would be worse
 * than no projection at all.
 */

const { POOL_MODE } = require('./rotation');

/**
 * Leads per seat, per plan, for one market.
 *
 * @param {object} opts
 * @param {number} opts.volume     qualified leads expected in this market
 * @param {object} opts.weights    plan → allocation weight
 * @param {object} opts.seats      plan → number of pandits holding it
 * @param {number} opts.mode       POOL_MODE.WEIGHTED | POOL_MODE.PRIORITY
 * @param {object} opts.priorities plan → order, lower first (priority mode)
 */
function leadsPerSeatFor({ volume, weights = {}, seats = {}, mode = POOL_MODE.WEIGHTED, priorities = {} }) {
  const plans = Object.keys(weights);
  const out = {};

  if (Number(mode) === POOL_MODE.PRIORITY) {
    /*
     * In priority mode the weights are not used at all. The highest-priority
     * plan that has ANY seats takes the entire market; everyone else gets zero.
     * Showing the weighted projection here would be a lie that makes priority
     * mode look far gentler than it is.
     */
    const ranked = plans
      .filter((p) => (seats[p] || 0) > 0)
      .sort((a, b) => (priorities[a] ?? Infinity) - (priorities[b] ?? Infinity) || a.localeCompare(b));

    for (const p of plans) out[p] = 0;
    if (ranked.length) out[ranked[0]] = volume / seats[ranked[0]];
    return out;
  }

  // Weighted. Normalise against the plans that actually have seats — a plan
  // with zero pandits cannot absorb its share, and pretending it does would
  // understate what everyone else receives.
  const live = plans.filter((p) => (seats[p] || 0) > 0);
  const total = live.reduce((a, p) => a + (weights[p] || 0), 0);

  for (const p of plans) {
    const n = seats[p] || 0;
    if (!n || total <= 0) { out[p] = 0; continue; }
    out[p] = (volume * ((weights[p] || 0) / total)) / n;
  }
  return out;
}

/**
 * Full projection across both markets, with the number that matters: rupees per
 * lead, per plan.
 *
 * @param {object} opts
 * @param {object} opts.entitlements  market → tier → { weight, seatCap, priority, priceInr }
 * @param {object} opts.seats         tier → pandits actually holding that tier
 * @param {object} opts.volumes       market → expected qualified leads in the period
 * @param {number} opts.mode
 * @param {object} opts.tierToPlan    tier → plan name
 */
function project({ entitlements = {}, seats = {}, volumes = {}, mode = POOL_MODE.WEIGHTED, tierToPlan = {} }) {
  // Leads per TIER, accumulated across every market that tier is entitled to.
  // A ₹9,000 Global pandit earns from both India and International, and judging
  // their plan on one market alone is how the ladder got missed.
  const leadsByTier = {};
  const perMarket = {};

  for (const [market, tiers] of Object.entries(entitlements)) {
    const volume = Number(volumes[market]) || 0;

    const weights = {};
    const planSeats = {};
    const priorities = {};
    const planToTier = {};

    for (const [tier, e] of Object.entries(tiers)) {
      const plan = tierToPlan[tier] || tier;
      weights[plan] = Number(e.weight) || 0;
      planSeats[plan] = Number(seats[tier]) || 0;
      if (e.priority != null) priorities[plan] = Number(e.priority);
      planToTier[plan] = tier;
    }

    const perSeat = leadsPerSeatFor({ volume, weights, seats: planSeats, mode, priorities });

    perMarket[market] = {};
    for (const [plan, value] of Object.entries(perSeat)) {
      const tier = planToTier[plan];
      perMarket[market][tier] = {
        plan,
        seats: planSeats[plan],
        weight: weights[plan],
        leadsPerSeat: round2(value),
      };
      leadsByTier[tier] = (leadsByTier[tier] || 0) + value;
    }
  }

  // Collapse to one row per tier — the view a pandit actually experiences.
  const plans = [];
  for (const [tier, leadsPerSeat] of Object.entries(leadsByTier)) {
    const anyMarket = Object.values(entitlements).find((t) => t[tier]);
    const e = anyMarket ? anyMarket[tier] : {};
    const price = e.priceInr == null ? null : Number(e.priceInr);
    const seatCap = e.seatCap == null ? null : Number(e.seatCap);
    const held = Number(seats[tier]) || 0;

    plans.push({
      tier,
      plan: tierToPlan[tier] || tier,
      priceInr: price,
      seatsHeld: held,
      seatCap,
      // Surfaced rather than enforced. A pandit above the cap has paid, and the
      // engine must keep serving them — the cap is a signal to stop SELLING.
      oversold: seatCap != null && held > seatCap,
      seatsRemaining: seatCap == null ? null : Math.max(0, seatCap - held),
      leadsPerSeat: round2(leadsPerSeat),
      // The headline number. Null rather than Infinity when a plan receives
      // nothing: "₹9,000 for Infinity per lead" reads like a rendering bug,
      // where null lets the UI say "no leads" plainly.
      rupeesPerLead: price != null && leadsPerSeat > 0 ? Math.round(price / leadsPerSeat) : null,
      receivesNothing: leadsPerSeat <= 0,
    });
  }

  plans.sort((a, b) => (b.priceInr || 0) - (a.priceInr || 0));

  // BLENDED's leads-per-seat maths is identical to WEIGHTED's — both allocate
  // volume proportional to weight ÷ seats, they only differ in HOW that share
  // is composed per visit (see rotation.js's interleaveByQuota). Only the
  // label differs, so the panel's mode chip reads correctly.
  const modeLabel = Number(mode) === POOL_MODE.PRIORITY
    ? 'priority'
    : Number(mode) === POOL_MODE.BLENDED ? 'blended' : 'weighted';

  return { mode: modeLabel, plans, perMarket, warnings: warningsFor(plans) };
}

/**
 * The things an admin should be told before saving, in plain terms.
 *
 * Warnings, not blocks. These are business decisions and the admin may have a
 * reason — but "I did not realise" must not be one of them.
 */
function warningsFor(plans) {
  const out = [];
  const priced = plans.filter((p) => p.rupeesPerLead != null).sort((a, b) => b.priceInr - a.priceInr);

  /*
   * The inversion check: walking down from the most expensive plan, cost per
   * lead should not rise.
   *
   * With a TOLERANCE, and the tolerance matters. A well-tuned ladder lands
   * close to parity — the recommended seat fix in LEAD_DISTRIBUTION_V2.md §2
   * produces ₹143 / ₹141 / ₹143. Flagging a ₹2 gap on ₹143 as "the cheaper
   * plan is the better deal" would put a red error on a correctly-configured
   * platform, and an admin who sees false alarms stops reading the real ones.
   *
   * 5% is the threshold: below that the plans are effectively equal value,
   * which is a legitimate design, not a mistake.
   */
  const INVERSION_TOLERANCE = 0.05;

  for (let i = 0; i < priced.length - 1; i += 1) {
    const dearer = priced[i];
    const cheaper = priced[i + 1];
    if (cheaper.rupeesPerLead <= 0) continue;

    const excess = (dearer.rupeesPerLead - cheaper.rupeesPerLead) / cheaper.rupeesPerLead;
    if (excess <= INVERSION_TOLERANCE) continue;

    out.push({
      level: 'error',
      code: 'ladder_inverted',
      message: `₹${dearer.priceInr.toLocaleString('en-IN')} costs ₹${dearer.rupeesPerLead.toLocaleString('en-IN')} per lead, but ₹${cheaper.priceInr.toLocaleString('en-IN')} costs only ₹${cheaper.rupeesPerLead.toLocaleString('en-IN')} — ${Math.round(excess * 100)}% cheaper. The cheaper plan is the better deal.`,
    });
  }

  for (const p of plans) {
    if (p.receivesNothing && p.seatsHeld > 0) {
      out.push({
        level: 'error',
        code: 'plan_starved',
        message: `${p.seatsHeld} pandit(s) on the ₹${(p.priceInr || 0).toLocaleString('en-IN')} plan would receive NO leads at all with these settings.`,
      });
    }
    if (p.oversold) {
      out.push({
        level: 'warn',
        code: 'oversold',
        message: `${p.tier}: ${p.seatsHeld} pandits hold a ${p.seatCap}-seat plan. They are all still being served — the cap only means stop selling.`,
      });
    }
  }
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { project, leadsPerSeatFor, warningsFor };
