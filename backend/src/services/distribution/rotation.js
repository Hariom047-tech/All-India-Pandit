/**
 * Rotation and plan allocation. Pure.
 *
 * Two problems the fairness score alone does not solve:
 *
 * 1. PAGINATION. 500 pandits, 20 slots on page one. Pandit #250 is invisible
 *    no matter how large their deficit, because the deficit only reorders a
 *    list nobody scrolls. Fairness has to operate on FIRST-PAGE SLOTS, not on
 *    list position.
 *
 * 2. STABILITY. If ordering is random per request, a refresh reshuffles the
 *    page under the devotee's thumb and the site feels broken or rigged. But
 *    if ordering is fixed, whoever sits at #1 harvests the clicks forever.
 *    The answer is deterministic-per-session, different-between-sessions.
 */

const { hash01 } = require('./fairness');

/* ── plan allocation ──────────────────────────────────────────────────── */

/**
 * How a market's traffic is split between the plans entitled to it.
 *
 * Expressed as WEIGHTS, not fixed percentages, and normalised against how many
 * seats each plan actually has. This is deliberate: a fixed "70% to Bharat"
 * silently changes meaning every time seat counts change, and that is exactly
 * how a plan ladder inverts without anyone noticing.
 *
 * See docs/LEAD_DISTRIBUTION_V2.md §2 — with 200 Bharat seats and 150 Global
 * seats, a 70/30 split gives the CHEAPER plan more leads per seat.
 */
const DEFAULT_ALLOCATION = {
  INDIA: { bharat: 0.70, global: 0.30 },
  INTERNATIONAL: { international: 0.70, global: 0.30 },
};

/**
 * Pick which plan bucket serves this particular request.
 *
 * Deterministic on the session, so one visitor's page is drawn from a coherent
 * bucket rather than a random mix — and over many visitors the split converges
 * on the configured weights.
 *
 * Buckets with no eligible pandits are dropped and their weight redistributed;
 * otherwise 30% of international traffic would land on an empty Global bucket
 * and show nothing at all.
 */
function pickPlanBucket(market, availableByPlan, sessionSeed, allocation = DEFAULT_ALLOCATION) {
  const weights = allocation[market] || {};
  const live = Object.entries(weights)
    .filter(([plan]) => (availableByPlan[plan] || 0) > 0);

  if (!live.length) return null;

  const total = live.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return live[0][0];

  const roll = hash01(`bucket:${sessionSeed}`) * total;
  let acc = 0;
  for (const [plan, w] of live) {
    acc += w;
    if (roll <= acc) return plan;
  }
  return live[live.length - 1][0];
}

/**
 * PRIORITY mode: the highest-priority plan with anyone eligible takes the
 * request outright.
 *
 * The alternative to weighted share, selectable by the admin. It does what the
 * name says: if the ₹15,000 plan has a single eligible pandit, every visitor in
 * that market sees the ₹15,000 pool and the cheaper plans see nothing.
 *
 * THIS STARVES LOWER PLANS BY DESIGN. That is not a flaw to be smoothed over —
 * it is the whole point of a priority ladder, and it is why the admin panel
 * shows the projected leads-per-seat for both modes before the change is saved.
 * Weighted mode guarantees every plan a share; priority mode guarantees the top
 * plan everything. Neither is universally right, but the consequence has to be
 * visible at the moment of choosing.
 *
 * `priorities` maps plan → order, LOWER FIRST. A plan with no entry sorts last
 * rather than first: an unconfigured plan silently outranking a configured one
 * would be the most surprising possible default.
 */
function pickPriorityBucket(market, availableByPlan, priorities = {}, allocation = DEFAULT_ALLOCATION) {
  const entitled = Object.keys(allocation[market] || {});
  const live = entitled.filter((plan) => (availableByPlan[plan] || 0) > 0);
  if (!live.length) return null;

  return live.sort((a, b) => {
    const pa = priorities[a] ?? Number.MAX_SAFE_INTEGER;
    const pb = priorities[b] ?? Number.MAX_SAFE_INTEGER;
    // Ties broken by name so the result is deterministic. A tie means the admin
    // has not expressed an order, and an arbitrary-but-stable answer is better
    // than one that changes between requests.
    return pa - pb || a.localeCompare(b);
  })[0];
}

/** Pool selection modes, as stored in distribution_config.pool_mode. */
const POOL_MODE = { WEIGHTED: 0, PRIORITY: 1, BLENDED: 2 };

/* ── blended mode ─────────────────────────────────────────────────────── */

/**
 * Split one block of `blockSize` slots between the live plans, proportional to
 * their weight.
 *
 * Largest-remainder rounding: take the floor of each plan's exact share, then
 * hand the leftover slots (blockSize minus the sum of floors) one at a time to
 * whichever plans had the largest fractional remainder. This is the standard
 * seat-apportionment method — it is what guarantees the integers actually sum
 * to blockSize, which naive per-plan rounding does not.
 *
 * Plans with zero weight or zero live candidates get quota 0 — same as
 * WEIGHTED mode's bucket never being drawn for them.
 */
function computeBlockQuotas(weights = {}, blockSize = 20) {
  const live = Object.entries(weights).filter(([, w]) => w > 0);
  const out = {};
  for (const plan of Object.keys(weights)) out[plan] = 0;
  if (!live.length || blockSize <= 0) return out;

  const total = live.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return out;

  const exact = live.map(([plan, w]) => {
    const share = (w / total) * blockSize;
    return { plan, floor: Math.floor(share), remainder: share - Math.floor(share) };
  });

  let allocated = exact.reduce((a, e) => a + e.floor, 0);
  for (const e of exact) out[e.plan] = e.floor;

  let leftover = blockSize - allocated;
  const byRemainder = [...exact].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; leftover > 0 && i < byRemainder.length; i += 1, leftover -= 1) {
    out[byRemainder[i].plan] += 1;
  }
  return out;
}

/**
 * Merge each plan's own (already ranked + rotated) full order into one
 * sequence, in rounds of `quotas`.
 *
 * Each round takes `quota[plan]` candidates off the front of that plan's
 * queue, appended in ascending-priority order (lower priority number first —
 * same convention as pickPriorityBucket) so a page reads "best-priority
 * plan's block, then the next plan's block". If a plan's queue is shorter
 * than its quota for this round — it is running out — the shortfall is handed
 * to the other still-live plans in the SAME round, proportional to their own
 * weight, so a page is never short just because one plan is nearly exhausted.
 * A plan whose queue is empty is dropped from all further rounds.
 *
 * @param {Record<string, object[]>} tierOrders  plan → full rotated candidate order
 * @param {Record<string, number>} quotas        plan → slots per round (from computeBlockQuotas)
 * @param {Record<string, number>} priorities    plan → order, lower first
 */
function interleaveByQuota(tierOrders = {}, quotas = {}, priorities = {}) {
  const queues = {};
  for (const [plan, order] of Object.entries(tierOrders)) {
    if (order?.length) queues[plan] = [...order];
  }

  const priorityRank = (plan) => priorities[plan] ?? Number.MAX_SAFE_INTEGER;
  const byPriority = (a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b);

  const out = [];
  while (Object.keys(queues).length) {
    const live = Object.keys(queues);
    const roundQuota = {};
    let poolSize = 0;
    for (const plan of live) {
      roundQuota[plan] = quotas[plan] || 0;
      poolSize += roundQuota[plan];
    }

    // Nobody in this round has a positive quota (e.g. every live plan's
    // weight rounded to 0 against a lopsided block size) — fall back to
    // draining whatever is left, largest queue first, so candidates are
    // never silently dropped.
    if (poolSize <= 0) {
      for (const plan of live.sort(byPriority)) {
        out.push(...queues[plan]);
        delete queues[plan];
      }
      break;
    }

    // Redistribute shortfall from plans whose queue is shorter than their
    // round quota, proportional to the other live plans' own weight share.
    let shortfall = 0;
    for (const plan of live) {
      const short = Math.max(0, roundQuota[plan] - queues[plan].length);
      if (short > 0) { shortfall += short; roundQuota[plan] -= short; }
    }
    if (shortfall > 0) {
      const receivers = live.filter((p) => roundQuota[p] < queues[p].length);
      const receiverTotal = receivers.reduce((a, p) => a + (quotas[p] || 0), 0);
      if (receiverTotal > 0) {
        let remaining = shortfall;
        for (const plan of receivers) {
          if (remaining <= 0) break;
          const room = queues[plan].length - roundQuota[plan];
          const extra = Math.min(room, Math.round((shortfall * (quotas[plan] || 0)) / receiverTotal));
          const grant = Math.min(room, extra, remaining);
          roundQuota[plan] += grant;
          remaining -= grant;
        }
        // Rounding may leave a slot or two unassigned — hand them out in
        // priority order to whoever still has room.
        for (const plan of receivers.sort(byPriority)) {
          if (remaining <= 0) break;
          const room = queues[plan].length - roundQuota[plan];
          const grant = Math.min(room, remaining);
          roundQuota[plan] += grant;
          remaining -= grant;
        }
      }
    }

    for (const plan of live.sort(byPriority)) {
      const take = Math.min(roundQuota[plan], queues[plan].length);
      if (take > 0) out.push(...queues[plan].splice(0, take));
      if (!queues[plan].length) delete queues[plan];
    }
  }
  return out;
}

/**
 * Choose a bucket using whichever mode the admin has configured.
 *
 * One entry point so callers cannot accidentally implement half the modes —
 * the engine asks for "a bucket", not "a weighted bucket".
 */
function selectBucket({
  market, availableByPlan, sessionSeed: seed, allocation = DEFAULT_ALLOCATION,
  mode = POOL_MODE.WEIGHTED, priorities = {},
}) {
  return Number(mode) === POOL_MODE.PRIORITY
    ? pickPriorityBucket(market, availableByPlan, priorities, allocation)
    : pickPlanBucket(market, availableByPlan, seed, allocation);
}

/**
 * Leads per seat implied by an allocation — the number that reveals an
 * inverted ladder. Exposed so the admin panel can show it BEFORE a change goes
 * live, and so the simulation can assert on it.
 */
function leadsPerSeat({ marketVolume, allocation, seats }) {
  const out = {};
  for (const [plan, weight] of Object.entries(allocation || {})) {
    const n = seats[plan] || 0;
    out[plan] = n > 0 ? (marketVolume * weight) / n : 0;
  }
  return out;
}

/* ── session-stable rotation ──────────────────────────────────────────── */

/**
 * The seed that makes ordering stable for one visitor and different for the
 * next.
 *
 * The hour bucket is what stops a single session monopolising the top slots
 * indefinitely: within an hour the order holds, and at the boundary it moves
 * on. Without it, a devotee who leaves the tab open all day keeps showing the
 * same pandits at #1 and those impressions all accrue to the same people.
 */
function sessionSeed({ sessionKey, templeId, serviceId, now, bucketHours = 1 }) {
  const bucket = Math.floor(now / (bucketHours * 3600_000));
  return `${sessionKey || 'anon'}|${templeId || ''}|${serviceId || ''}|${bucket}`;
}

/**
 * How many distinct refresh generations a visitor can cycle through inside
 * one session-hour before the sequence repeats.
 *
 * Bounded on purpose: refreshGeneration is presentation input a client can
 * send, and an unbounded counter would let someone farm unlimited distinct
 * rankings by incrementing it forever. Centralised here rather than inlined
 * at every call site, so tuning it later is a one-line change.
 */
const MAX_REFRESH_GENERATIONS = 5;

/** Clamp/cycle an arbitrary client-supplied refresh counter into [0, MAX_REFRESH_GENERATIONS). */
function clampRefreshGeneration(value) {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  if (n <= 0) return 0;
  return n % MAX_REFRESH_GENERATIONS;
}

/**
 * The seed for WITHIN-BUCKET rotation only (selectOrder/selectPage) — never
 * for plan-bucket selection.
 *
 * Deliberately a different seed from the one passed to selectBucket(). Which
 * PLAN BUCKET (bharat/global/international) a visitor draws from must stay
 * fixed for the whole session-hour: that split is what converges on the
 * configured allocation weights ACROSS many sessions, and if refreshing
 * could bounce one visitor between buckets they would see an entirely
 * different price tier's pandits from one refresh to the next, which is a
 * much bigger jump than the "controlled position/profile diversity" this
 * feature is meant to add. Refresh generation only reshuffles the candidates
 * already selected for display within that fixed bucket.
 *
 * Generation 0 (a first page load, or any caller that never mentions
 * refreshGeneration) reproduces the exact pre-existing seed string —
 * byte-for-byte — so nothing about first-load ordering changes. Only
 * generation 1+ appends a suffix, which is what actually varies the shuffle.
 */
function rotationSeed({ sessionKey, templeId, serviceId, now, bucketHours = 1, refreshGeneration = 0 }) {
  const base = sessionSeed({ sessionKey, templeId, serviceId, now, bucketHours });
  const gen = clampRefreshGeneration(refreshGeneration);
  return gen === 0 ? base : `${base}|g${gen}`;
}

/**
 * Turn a scored, sorted pool into the slots this visitor actually sees.
 *
 * The important part is `rotationDepth`. Taking the top `pageSize` by score
 * would hand page one to the same under-served cohort for the whole hour, and
 * everyone below is invisible again — the same problem, one layer down. So we
 * take a WIDER band of comparably-deserving candidates and let the session seed
 * choose which of them get the slots.
 *
 * Result: over many visitors, everyone in the band reaches page one; for any
 * one visitor, the page is stable and sensibly ordered.
 */
function selectOrder(ranked, { pageSize = 20, rotationDepth = 3, seed, pinTop = true }) {
  if (!ranked.length) return [];

  /*
   * Pandits at their daily lead cap are held out of the rotating band.
   *
   * Scoring them −1000 sorts them last, which is enough in a large pool — rank
   * 500 of 500 never reaches a band of 60. It is NOT enough in a small one. At
   * a temple with six pandits the band covers everyone, the rotation shuffles
   * them, and a capped pandit was measured landing on 82% of first pages: the
   * "hard exclusion" the cap claims to be was not happening at all, and they
   * kept receiving contacts after hitting their limit.
   *
   * Held out rather than dropped, because an empty listing serves nobody. If
   * there are not enough uncapped pandits to fill the page, the capped ones
   * still appear — below every uncapped one. A devotee finding somebody beats
   * enforcing a billing cap perfectly.
   */
  const active = ranked.filter((c) => !c.dailyCapped);
  const capped = ranked.filter((c) => c.dailyCapped);
  const usable = active.length ? active : capped;
  const overflow = active.length ? capped : [];

  const bandSize = Math.min(usable.length, Math.max(pageSize, pageSize * rotationDepth));
  const band = usable.slice(0, bandSize);
  const rest = [...usable.slice(bandSize), ...overflow];

  // Shuffle the band deterministically: sort by a per-candidate hash of the
  // session seed. Same visitor, same order; different visitor, different order.
  const rotated = band
    .map((c) => ({ c, k: hash01(`${seed}:${c.panditId}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);

  /*
   * Keep the single strongest candidate genuinely first — for the FIRST look
   * a session gets (pinTop = true). Pure rotation across the whole band means
   * the most under-served pandit can land at slot 12, which defeats the
   * correction we just computed. One guaranteed slot for the top of the band
   * keeps fairness effective while everything below it rotates.
   *
   * On a later refresh generation (pinTop = false) the guarantee is relaxed:
   * this session's first load already put the top candidate at slot 1 once,
   * so letting them also rotate through slot 1 on refresh — same as everyone
   * else in the band — adds diversity without ever removing the chance they
   * were already guaranteed.
   */
  if (!pinTop) return [...rotated, ...rest];

  const top = band[0];
  const withoutTop = rotated.filter((c) => c.panditId !== top.panditId);

  return [top, ...withoutTop, ...rest];
}

/**
 * One page of that order.
 *
 * Paging slices the SAME rotated order rather than re-rotating per page —
 * otherwise a pandit could appear on both page 1 and page 2 while another
 * appears on neither, and their exposure counters would both be wrong.
 */
function selectPage(ranked, { pageSize = 20, rotationDepth = 3, seed, page = 1, pinTop = true }) {
  const order = selectOrder(ranked, { pageSize, rotationDepth, seed, pinTop });
  const offset = (Math.max(1, page) - 1) * pageSize;
  return order.slice(offset, offset + pageSize);
}

module.exports = {
  DEFAULT_ALLOCATION,
  pickPlanBucket,
  leadsPerSeat,
  sessionSeed,
  rotationSeed,
  MAX_REFRESH_GENERATIONS,
  clampRefreshGeneration,
  pickPriorityBucket,
  selectBucket,
  POOL_MODE,
  selectOrder,
  selectPage,
  computeBlockQuotas,
  interleaveByQuota,
};
