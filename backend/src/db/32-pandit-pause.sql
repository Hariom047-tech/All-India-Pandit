-- ============================================================================
-- Module 32: Pandit profile pause — hide a pandit from every public surface
-- and the lead-distribution engine, automatically on subscription expiry and
-- manually via the admin panel.
-- ============================================================================
-- WHAT THIS ADDS
--   pandits.is_paused       — the one flag every public read and the
--                              distribution engine's hard-gate now check.
--   pandits.paused_reason   — free text, e.g. 'subscription_expired' (set by
--                              the system) or an admin's own note.
--   pandits.paused_at       — when the pause took effect, cleared on unpause.
--
-- AUTOMATIC:
--   - revert_expired_pandit_tiers() (migration 29, runs hourly from
--     services/billing/expiryScheduler.js) now ALSO sets is_paused = TRUE
--     with paused_reason = 'subscription_expired' the moment it reverts an
--     expired paid tier to free — a lapsed pandit is hidden, not just
--     silently downgraded to a visible free listing.
--   - activate_pandit_subscription() (migration 29 — the same function both
--     a captured Razorpay payment webhook and an admin's manual grant call)
--     now ALSO clears is_paused/paused_reason/paused_at on every activation,
--     so buying or being granted any plan un-hides the profile again. This
--     covers "took a paid plan again" (renewal) exactly as much as "admin
--     manually re-granted a plan" — both go through this one function.
--
-- MANUAL:
--   Admin panel's new POST <secret>/pandits/:slug/pause writes these columns
--   directly under the existing pandits_update_admin RLS policy (no new
--   SECURITY DEFINER function needed there — see admin/pandits.repository.js
--   setTier() for the established precedent that an admin-context UPDATE
--   already passes RLS fine; only SYSTEM contexts with no admin/user
--   identity, like a webhook or this cron, need the SECURITY DEFINER route).
--   A manual admin pause is NOT auto-cleared by anything but another manual
--   admin action or a fresh plan activation — an admin who paused someone
--   for a policy reason did not want that reason silently undone by an
--   unrelated tier read.
--
-- READ-PATH ENFORCEMENT (application code, not this migration):
--   backend/src/repositories/pandits.repository.js — every public query
--   (list, getBySlug, findIdBySlug, forService[Online], forTemple,
--   pickForTemple) now requires p.is_paused = FALSE, so a paused pandit's
--   profile page 404s, they drop out of search/temple/service listings, and
--   even a stale bookmarked enquiry/click link can no longer reach them.
--   backend/src/services/distribution/fairness.js — eligibilityFailure()
--   now hard-gates on isPaused first, same tier as isActive/isVerified, so
--   the fairness/rotation engine that decides WHO gets shown and WHO
--   receives leads never considers a paused pandit at all.
--
-- Idempotent; safe to run against an existing database.
-- ============================================================================

BEGIN;

ALTER TABLE pandits ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pandits ADD COLUMN IF NOT EXISTS paused_reason TEXT;
ALTER TABLE pandits ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Every public listing query filters on this — worth a partial index since
-- the common case (not paused) is the overwhelming majority of rows.
CREATE INDEX IF NOT EXISTS idx_pandits_is_paused ON pandits(is_paused) WHERE is_paused = TRUE;

-- ------------------------------------------------------------
-- 1. Renewal / re-grant clears any pause.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_pandit_subscription(
    p_pandit_id  UUID,
    p_tier       subscription_tier,
    p_expires_at TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.allow_seat_overflow', 'on', true);

    UPDATE pandits
       SET current_tier = p_tier,
           subscription_expires_at = p_expires_at,
           is_paused = FALSE,
           paused_reason = NULL,
           paused_at = NULL
     WHERE id = p_pandit_id;

    UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = p_pandit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION activate_pandit_subscription(UUID, subscription_tier, TIMESTAMPTZ) FROM PUBLIC;

-- ------------------------------------------------------------
-- 2. Expiry now pauses, not just downgrades.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION revert_expired_pandit_tiers()
RETURNS INTEGER AS $$
DECLARE
    v_ids UUID[];
    v_id  UUID;
BEGIN
    WITH reverted AS (
        UPDATE pandits
           SET current_tier = 'free',
               subscription_expires_at = NULL,
               is_paused = TRUE,
               paused_reason = 'subscription_expired',
               paused_at = NOW()
         WHERE current_tier <> 'free'
           AND subscription_expires_at IS NOT NULL
           AND subscription_expires_at <= NOW()
           AND NOT EXISTS (
             SELECT 1 FROM pandit_subscriptions ps
              WHERE ps.pandit_id = pandits.id AND ps.is_active = TRUE AND ps.expires_at > NOW()
           )
        RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM reverted;

    IF v_ids IS NOT NULL THEN
        FOREACH v_id IN ARRAY v_ids LOOP
            UPDATE pandits SET rank_score = calculate_pandit_rank(id) WHERE id = v_id;
        END LOOP;
    END IF;

    RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION revert_expired_pandit_tiers() FROM PUBLIC;

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pandits' AND column_name = 'is_paused'
  ) THEN
    RAISE EXCEPTION 'Migration 32 incomplete — pandits.is_paused missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pandits' AND column_name = 'paused_reason'
  ) THEN
    RAISE EXCEPTION 'Migration 32 incomplete — pandits.paused_reason missing';
  END IF;
  RAISE NOTICE 'Migration 32 applied: pandit pause columns added, activate/revert functions updated.';
END
$verify$;
