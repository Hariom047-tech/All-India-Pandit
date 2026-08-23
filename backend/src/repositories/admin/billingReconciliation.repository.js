const { query } = require('../../config/db');

/**
 * Read-only reconciliation report — flags things an admin should look at,
 * never auto-fixes them (per the subscription-billing plan's own rule:
 * "flag unclear mismatches for Admin review", never repair recklessly).
 */
async function report(q = query) {
  // 1. The two independent "price" sources this project has never merged
  // (user decision: subscription_plans is the sole customer-facing source;
  // plan_market_entitlements.plan_price_inr is left alone, just surfaced).
  const priceMismatch = await q(`
    SELECT sp.tier, sp.price_monthly AS subscription_plans_price_monthly,
           pme.plan_price_inr AS plan_market_entitlements_price
      FROM subscription_plans sp
      JOIN plan_market_entitlements pme ON pme.tier = sp.tier AND pme.is_active
     WHERE pme.plan_price_inr IS NOT NULL
     GROUP BY sp.tier, sp.price_monthly, pme.plan_price_inr
     ORDER BY sp.tier
  `);

  // 2. A pandit whose current_tier says "paid" but has no pandit_subscriptions
  // row backing it at all — a legacy/manually-edited record from before this
  // project's activation path existed, not something a purchase produced.
  const untraceableTier = await q(`
    SELECT p.slug, u.full_name, p.current_tier, p.subscription_expires_at
      FROM pandits p JOIN users u ON u.id = p.user_id
     WHERE p.current_tier <> 'free' AND p.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM pandit_subscriptions ps WHERE ps.pandit_id = p.id)
     ORDER BY p.subscription_expires_at DESC NULLS LAST
     LIMIT 100
  `);

  // 3. A pandit whose current_tier/expiry disagrees with their own latest
  // pandit_subscriptions row — could mean an admin hand-edited pandits
  // directly, or the expiry-reconciliation scheduler hasn't ticked yet.
  const tierMismatch = await q(`
    SELECT p.slug, u.full_name, p.current_tier AS pandit_current_tier,
           sp.tier AS latest_subscription_tier, p.subscription_expires_at AS pandit_expires_at,
           ps.expires_at AS subscription_expires_at, ps.is_active
      FROM pandits p
      JOIN users u ON u.id = p.user_id
      JOIN LATERAL (
        SELECT * FROM pandit_subscriptions WHERE pandit_id = p.id
         ORDER BY is_active DESC, created_at DESC LIMIT 1
      ) ps ON true
      JOIN subscription_plans sp ON sp.id = ps.plan_id
     WHERE p.deleted_at IS NULL
       AND (p.current_tier IS DISTINCT FROM sp.tier OR NOT ps.is_active)
       AND p.current_tier <> 'free'
     ORDER BY p.subscription_expires_at DESC NULLS LAST
     LIMIT 100
  `);

  // 4. Payments stuck pending for more than a day — likely an abandoned
  // checkout (never worth chasing) or a webhook that never arrived (worth
  // reconciling via Razorpay's dashboard).
  const stalePending = await q(`
    SELECT pt.id, p.slug, u.full_name, pt.amount, pt.created_at, pt.gateway_order_id
      FROM payment_transactions pt
      JOIN pandits p ON p.id = pt.pandit_id JOIN users u ON u.id = p.user_id
     WHERE pt.status = 'pending' AND pt.created_at < NOW() - INTERVAL '1 day'
     ORDER BY pt.created_at DESC
     LIMIT 100
  `);

  return {
    priceMismatch: priceMismatch.rows,
    untraceableTier: untraceableTier.rows,
    tierMismatch: tierMismatch.rows,
    stalePending: stalePending.rows,
  };
}

module.exports = { report };
