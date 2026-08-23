const { addBillingPeriod } = require('../../utils/billingPeriod');

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

module.exports = { resolveNewPeriod };
