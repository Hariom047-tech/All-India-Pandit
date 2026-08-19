-- ═══════════════════════════════════════════════════════════════════════
-- Admin Panel: role separation support + generalized user activity events
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two independent, additive changes:
--
--   1. users.country — the schema had city/state/pincode/lat-long but no
--      country. Market/billing already derive country transiently (phone
--      dial code, CDN header — see services/distribution/market.js) without
--      ever storing it; this column is for DISPLAY on a user's profile
--      (Section 8 of the admin analytics spec: "user.current_country"),
--      populated opportunistically from the same trusted sources, never
--      guessed. Nullable — "unknown" is a real, permanent, honest state,
--      not a migration gap to backfill.
--
--   2. user_activity_events — no equivalent table existed (confirmed by
--      inspecting the full db/*.sql tree before writing this). The closest
--      relatives — security_audit_log, admin_activity_log — are narrowly
--      scoped to security/admin actions, not "a devotee viewed a pandit
--      profile." This table is deliberately separate from qualified_leads
--      (which remains the transactional, business-critical table — see
--      qualifiedLeads.repository.js) and from contact_clicks (the existing
--      raw-click funnel table, which this does NOT replace — both are
--      written on a chat/call press: contact_clicks for the funnel math the
--      distribution engine already relies on, user_activity_events for the
--      admin-visible cross-event-type timeline).
--
-- Best-effort by design: nothing in the write path for this table may ever
-- be awaited in a way that blocks a user-facing action (see utils/activityLog.js).
-- No RLS — same posture as contact_clicks/pandit_exposure, which are also
-- system/admin-only tables with no per-row owner concept; access is gated at
-- the route layer (requireAdmin) and the app DB role's GRANTs, not per-row.

ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(2);
COMMENT ON COLUMN users.country IS
  'ISO-3166-1 alpha-2, resolved opportunistically from verified phone or trusted CDN geo header — see market.js. NULL is a real "unknown", never guessed.';

DO $$ BEGIN
  CREATE TYPE activity_event_type AS ENUM (
    'LOGIN', 'LOGOUT', 'SEARCH', 'TEMPLE_VIEW', 'SERVICE_VIEW',
    'PANDIT_PROFILE_VIEW', 'PANDIT_CHAT_CLICK', 'PANDIT_CALL_CLICK',
    'AI_RECOMMENDATION', 'INQUIRY_SUBMITTED', 'QUALIFIED_LEAD_CREATED',
    'BOOKING_CREATED', 'REVIEW_CREATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Canonical source-surface enum (Section 107: "do not store three different
-- strings for the same page" — TEMPLE_DETAIL, never "Temple page"/"temple").
DO $$ BEGIN
  CREATE TYPE activity_source_surface AS ENUM (
    'HOME', 'PANDIT_DIRECTORY', 'TEMPLE_DETAIL', 'SERVICE_DETAIL',
    'SEARCH', 'PANDIT_PROFILE', 'AI_GUIDE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_activity_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable: a guest browsing anonymously still generates traffic worth
    -- counting (Section 30 — "guest views can count as traffic/impressions")
    -- but has no user row. ON DELETE SET NULL, not CASCADE: a user closing
    -- their account must not silently rewrite admin history to make it look
    -- like the event never happened (Section 111 — anonymize, don't destroy
    -- aggregate analytics).
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    session_key         VARCHAR(64),
    pandit_id           UUID REFERENCES pandits(id) ON DELETE SET NULL,
    event_type          activity_event_type NOT NULL,
    source_surface      activity_source_surface,
    temple_id           UUID REFERENCES temples(id) ON DELETE SET NULL,
    service_id          UUID REFERENCES services(id) ON DELETE SET NULL,
    -- Coarse only — never lat/long, never full street address (Section 6/9).
    country             VARCHAR(2),
    region              VARCHAR(80),
    city                VARCHAR(100),
    market              lead_market,
    location_source     VARCHAR(20),   -- cloudfront | user_profile | user_selected | ip_geo | unknown
    qualified_lead_id   UUID REFERENCES qualified_leads(id) ON DELETE SET NULL,
    device_type         VARCHAR(20),   -- normalized (mobile/desktop/tablet), never a raw user-agent string
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- server clock is canonical, never client-supplied
);

-- Every admin query pattern this table exists to serve: a user's timeline, a
-- pandit's activity feed, "how many X events happened", and dedup lookups.
CREATE INDEX IF NOT EXISTS idx_activity_user_created ON user_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_pandit_created ON user_activity_events(pandit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type_created ON user_activity_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_session ON user_activity_events(session_key, created_at DESC) WHERE session_key IS NOT NULL;
-- Dedup lookup: "did this session already view this pandit's profile in the
-- last hour" — see utils/activityLog.js's dedupe window for PANDIT_PROFILE_VIEW.
CREATE INDEX IF NOT EXISTS idx_activity_dedup
  ON user_activity_events(pandit_id, event_type, COALESCE(user_id::text, session_key), created_at DESC)
  WHERE pandit_id IS NOT NULL;

-- Append-only: an activity record is a historical fact. Matches the posture
-- already used for security_audit_log/admin_activity_log/pandit_exposure.
REVOKE UPDATE, DELETE ON user_activity_events FROM panditconnect_app;
GRANT SELECT, INSERT ON user_activity_events TO panditconnect_app;
