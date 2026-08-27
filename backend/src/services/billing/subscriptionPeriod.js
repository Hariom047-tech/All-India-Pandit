const { addBillingPeriod } = require('../../utils/billingPeriod');

/** Ascending value order — index comparison is how payments.controller.js
 *  tells an upgrade from a downgrade. */
const TIER_ORDER = ['free', 'silver', 'gold', 'diamond'];

function tierRank(tier) {
  return TIER_ORDER.indexOf(tier);
}

/** How many days before expiry a pandit may renew their CURRENT tier.
 * Buying the same tier again while it still has plenty of time left just
 * stacks a second payment on top of unused time for no real reason — the
 * same pattern domain registrars, telecom recharges and OTT subscriptions
 * use an early-renewal window for. Product decision: 4 days. */
const RENEWAL_WINDOW_DAYS = 4;

/** True once a same-tier renewal purchase is actually allowed — inside the
 *  window, or already expired. payments.controller.js rejects the purchase
 *  attempt outside it rather than silently stacking time on an active plan. */
function isWithinRenewalWindow(currentExpiresAt) {
  if (!currentExpiresAt) return true; // nothing on record to protect
  const msRemaining = new Date(currentExpiresAt).getTime() - Date.now();
  return msRemaining <= RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Decides the (starts_at, expires_at) pair for a new purchase.
 *
 * Same-plan renewal preserves unused time: if the pandit already has an
 * unexpired subscription for the SAME tier, the new period starts from the
 * current expiry, not from now — a devotee who renews 5 days early does not
 * lose those 5 days.
 *
 * An upgrade to a DIFFERENT tier takes effect immediately (starts now),
 * forfeiting whatever time remained on the old plan — this is the
 * deliberately simple, disclosed Phase-1 policy (no prorated credit; see
 * the subscription-billing plan doc). A downgrade never reaches this
 * function today — Plan.tsx disables the downgrade button and routes that
 * case to support instead.
 */
function resolveNewPeriod({ currentTier, currentExpiresAt, targetTier, billingCycle }) {
  const now = new Date();
  const hasActiveSamePlan = Boolean(
    currentTier === targetTier
    && currentExpiresAt
    && new Date(currentExpiresAt).getTime() > now.getTime(),
  );
  const startsAt = hasActiveSamePlan ? new Date(currentExpiresAt) : now;
  const expiresAt = addBillingPeriod(startsAt, billingCycle);
  return { startsAt, expiresAt, isRenewal: hasActiveSamePlan };
}

module.exports = { resolveNewPeriod, TIER_ORDER, tierRank, RENEWAL_WINDOW_DAYS, isWithinRenewalWindow };
