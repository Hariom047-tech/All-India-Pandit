-- ============================================================
-- Module 20: Online puja / havan
-- ============================================================
-- Two separate facts, deliberately modelled separately:
--
--   services.is_online_available   — CAN this ritual meaningfully be performed
--                                    remotely at all? (a griha pravesh cannot;
--                                    a Baglamukhi havan can)
--   pandit_services.offers_online  — does THIS pandit perform THIS service
--                                    online?
--
-- Collapsing them into one flag would mean either every pandit mapped to an
-- online service is assumed to offer it remotely, or an admin has to mark the
-- same thing on every pandit. `pandits.accepts_online` already existed as a
-- coarse profile-level flag and is kept as the pandit's own opt-in.

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS is_online_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS online_note VARCHAR(300);

COMMENT ON COLUMN services.is_online_available IS
  'Ritual can be performed remotely (video call / live stream).';
COMMENT ON COLUMN services.online_note IS
  'How the online version works — shown on the service page.';

ALTER TABLE pandit_services ADD COLUMN IF NOT EXISTS offers_online BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pandit_services.offers_online IS
  'This pandit performs this specific service online.';

-- Partial indexes: both flags are overwhelmingly FALSE, so indexing only the
-- TRUE rows keeps them small and makes the "online pujas" listing cheap.
CREATE INDEX IF NOT EXISTS idx_services_online
  ON services(is_online_available) WHERE is_online_available = TRUE;
CREATE INDEX IF NOT EXISTS idx_pandit_services_online
  ON pandit_services(service_id, pandit_id) WHERE offers_online = TRUE;

COMMIT;

-- ============================================================
-- Self-check
-- ============================================================
DO $verify$
DECLARE missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'services' AND column_name = 'is_online_available')
    THEN missing := missing || ' services.is_online_available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'pandit_services' AND column_name = 'offers_online')
    THEN missing := missing || ' pandit_services.offers_online'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Migration 07 incomplete — missing:%', missing;
  END IF;
  RAISE NOTICE 'Migration 07 applied: online puja/havan is available.';
END
$verify$;
