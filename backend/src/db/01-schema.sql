-- PanditConnect schema — full relational redesign (see database_architecture.md
-- for the original proposal this is adapted from; deviations from that doc are
-- called out inline where they fix a real bug or a conflict with how this app
-- actually runs — see docs/ARCHITECTURE.md "The database" for the summary).
--
-- Re-runnable in dev: drops and recreates the entire `public` schema, then
-- everything in it. Executed automatically by the postgres image on first
-- container start (mounted at /docker-entrypoint-initdb.d/ — files there run
-- once, in filename order, only against an EMPTY data directory). For an
-- existing container, apply by hand: `npm run db:init` from backend/.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";    -- ST_MakePoint / geospatial indexes
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram fuzzy/ILIKE search indexes
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- scalar columns inside GIN indexes
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- accent-insensitive search (available for future use)

-- ============================================================
-- APPLICATION ROLE
-- ============================================================
-- The backend connects as this role, not as the bootstrap superuser
-- (POSTGRES_USER) that owns the schema — RLS policies below only apply to
-- non-owner roles, so this is what actually makes them bite. Password is a
-- local-dev placeholder, same posture as POSTGRES_PASSWORD in docker-compose.yml.
DO $$
BEGIN
  CREATE ROLE panditconnect_app LOGIN PASSWORD 'panditconnect_app_dev';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;
ALTER ROLE panditconnect_app WITH PASSWORD 'panditconnect_app_dev';

-- ============================================================
-- CUSTOM ENUMS & TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM (
    'devotee', 'pandit', 'temple_admin', 'admin', 'super_admin'
);

CREATE TYPE account_status AS ENUM (
    'pending_verification', 'active', 'suspended', 'deactivated', 'banned'
);

CREATE TYPE verification_status AS ENUM (
    'unverified', 'documents_submitted', 'under_review', 'verified', 'rejected'
);

CREATE TYPE subscription_tier AS ENUM ('free', 'silver', 'gold', 'diamond');

CREATE TYPE payment_status AS ENUM (
    'pending', 'completed', 'failed', 'refunded', 'cancelled'
);

CREATE TYPE media_type AS ENUM (
    'photo', 'video', 'video_intro', 'certificate', 'virtual_tour_360', 'thumbnail'
);

CREATE TYPE contact_method AS ENUM ('whatsapp', 'phone_call', 'in_app_message', 'email');

CREATE TYPE reviewable_type AS ENUM ('pandit', 'temple');

CREATE TYPE inquiry_status AS ENUM ('new', 'seen', 'replied', 'completed', 'expired');

CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived', 'flagged', 'removed');

CREATE TYPE day_of_week AS ENUM (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);

CREATE TYPE notification_type AS ENUM (
    'festival_alert', 'new_review', 'inquiry_received', 'profile_verified',
    'subscription_expiring', 'subscription_renewed', 'featured_placement',
    'system_announcement', 'panchang_alert'
);

-- ============================================================
-- FUNCTIONS (created before the tables/triggers that use them)
-- ============================================================

-- Reads the per-request user id set by the backend via `SET LOCAL
-- app.current_user_id` inside a transaction (see backend/src/config/db.js
-- withUserContext). Returns NULL — never throws — when unset, so RLS
-- policies below degrade to "no rows" instead of erroring for anonymous
-- requests or queries against tables RLS doesn't cover.
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pandit rank score calculator (for search ordering). Not wired to a trigger
-- on `pandits` itself (its own inputs — rating, tier, verification — change
-- one at a time via other tables' triggers/app code, each of which calls this
-- explicitly after the input it owns has changed).
CREATE OR REPLACE FUNCTION calculate_pandit_rank(p_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    rank DECIMAL(10, 4);
    p RECORD;
BEGIN
    SELECT * INTO p FROM pandits WHERE id = p_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    rank := 0;
    rank := rank + (COALESCE(p.avg_rating, 0) * 8);                    -- rating, max 40
    rank := rank + LEAST(COALESCE(p.review_count, 0) * 0.5, 20);       -- review volume, max 20
    IF p.verification_status = 'verified' THEN rank := rank + 15; END IF;

    CASE p.current_tier
        WHEN 'diamond' THEN rank := rank + 15;
        WHEN 'gold' THEN rank := rank + 10;
        WHEN 'silver' THEN rank := rank + 5;
        ELSE rank := rank + 0;
    END CASE;

    IF p.video_intro_url IS NOT NULL THEN rank := rank + 3; END IF;
    IF p.bio IS NOT NULL AND LENGTH(p.bio) > 100 THEN rank := rank + 3; END IF;
    IF p.profile_photo_url IS NOT NULL THEN rank := rank + 2; END IF;
    IF p.whatsapp_number IS NOT NULL THEN rank := rank + 2; END IF;

    RETURN rank;
END;
$$ LANGUAGE plpgsql;

-- Recomputes review_count/avg_rating (and, for pandits, rank_score) on the
-- reviewed entity whenever a review is inserted/updated/deleted.
-- Fix vs. the original proposal: that version read NEW.reviewable_type /
-- NEW.reviewable_id unconditionally, which is NULL on DELETE (NEW doesn't
-- exist for DELETE triggers) and would throw. Using COALESCE(NEW, OLD) per
-- field, and returning COALESCE(NEW, OLD), makes it correct for all three events.
CREATE OR REPLACE FUNCTION update_pandit_review_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_type reviewable_type := COALESCE(NEW.reviewable_type, OLD.reviewable_type);
    v_id   UUID := COALESCE(NEW.reviewable_id, OLD.reviewable_id);
BEGIN
    IF v_type = 'pandit' THEN
        UPDATE pandits SET
            review_count = (
                SELECT COUNT(*) FROM reviews
                WHERE reviewable_type = 'pandit' AND reviewable_id = v_id
                  AND is_approved = TRUE AND deleted_at IS NULL
            ),
            avg_rating = (
                SELECT COALESCE(AVG(rating), 0) FROM reviews
                WHERE reviewable_type = 'pandit' AND reviewable_id = v_id
                  AND is_approved = TRUE AND deleted_at IS NULL
            )
        WHERE id = v_id;
        UPDATE pandits SET rank_score = calculate_pandit_rank(v_id) WHERE id = v_id;
    END IF;

    IF v_type = 'temple' THEN
        UPDATE temples SET
            review_count = (
                SELECT COUNT(*) FROM reviews
                WHERE reviewable_type = 'temple' AND reviewable_id = v_id
                  AND is_approved = TRUE AND deleted_at IS NULL
            ),
            avg_rating = (
                SELECT COALESCE(AVG(rating), 0) FROM reviews
                WHERE reviewable_type = 'temple' AND reviewable_id = v_id
                  AND is_approved = TRUE AND deleted_at IS NULL
            )
        WHERE id = v_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_temple_pandit_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE temples SET pandit_count = (
        SELECT COUNT(*) FROM pandit_temples
        WHERE temple_id = COALESCE(NEW.temple_id, OLD.temple_id) AND is_active = TRUE
    )
    WHERE id = COALESCE(NEW.temple_id, OLD.temple_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Module 1: User & Authentication
-- ============================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(15) UNIQUE,
    password_hash       VARCHAR(255),

    full_name           VARCHAR(150) NOT NULL,
    display_name        VARCHAR(100),
    avatar_url          TEXT,
    role                user_role NOT NULL DEFAULT 'devotee',
    status              account_status NOT NULL DEFAULT 'pending_verification',

    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(10),
    latitude            DECIMAL(10, 8),
    longitude           DECIMAL(11, 8),

    preferred_language  VARCHAR(20) DEFAULT 'hi',
    theme_preference    VARCHAR(20) DEFAULT 'light',

    email_verified      BOOLEAN DEFAULT FALSE,
    phone_verified      BOOLEAN DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    login_count         INTEGER DEFAULT 0,

    google_id           VARCHAR(255) UNIQUE,
    facebook_id         VARCHAR(255) UNIQUE,

    -- Admin-only TOTP (see admin_architecture.md / docs/ADMIN.md) — secret is
    -- AES-256-GCM encrypted at rest (backend/src/utils/crypto.js), unlike the
    -- rest of this schema's "_hash" columns, because unlocking it is exactly
    -- what verifying a login code requires (a one-way hash can't do that).
    totp_secret_encrypted TEXT,
    totp_enabled        BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_city_state ON users(city, state);
CREATE INDEX idx_users_location ON users USING GIST (ST_MakePoint(longitude, latitude));
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Login and registration both need to look a user up by email before any
-- session/identity exists — before current_app_user_id() has anything to
-- return. SECURITY DEFINER runs this as the function's owner (the bootstrap
-- schema owner), bypassing users' RLS, but only for this one lookup shape;
-- panditconnect_app gets EXECUTE on it below and nothing broader.
CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email TEXT)
RETURNS SETOF users AS $$
    SELECT * FROM users WHERE lower(email) = lower(p_email) AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION auth_find_user_by_email(TEXT) FROM PUBLIC;

-- Admin-aware RLS (see "Row-Level Security" further down, and docs/ADMIN.md):
-- lets a request whose current_app_user_id() resolves to an admin/super_admin
-- see or manage rows beyond "just their own", without making the app's DB
-- role a superuser (which would silently disable RLS everywhere, not just
-- for admins). MUST be SECURITY DEFINER: a users-table RLS policy that calls
-- this, which then queries `users` again under RLS, would recheck that same
-- policy on its own inner query — infinite recursion. Bypassing RLS for
-- this one read is safe because it only reads the role of the id our own
-- backend already put in current_app_user_id() post-authentication, and
-- returns nothing but a boolean.
CREATE OR REPLACE FUNCTION current_app_user_is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = current_app_user_id() AND role IN ('admin', 'super_admin') AND deleted_at IS NULL
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION current_app_user_is_admin() FROM PUBLIC;

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash      VARCHAR(255) NOT NULL UNIQUE,  -- sha256 of the bearer token; raw token never stored
    device_info     JSONB,
    ip_address      INET,

    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

CREATE TABLE otp_verifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,

    target          VARCHAR(255) NOT NULL,
    target_type     VARCHAR(10) NOT NULL,
    otp_hash        VARCHAR(255) NOT NULL,

    attempts        INTEGER DEFAULT 0,
    max_attempts    INTEGER DEFAULT 5,
    verified        BOOLEAN DEFAULT FALSE,

    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_target ON otp_verifications(target, target_type);

-- ============================================================
-- Module 2: Temples
-- ============================================================
CREATE TABLE temples (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name                VARCHAR(300) NOT NULL,
    slug                VARCHAR(350) UNIQUE NOT NULL,
    description         TEXT,
    short_description   VARCHAR(500),

    primary_deity       VARCHAR(150),
    secondary_deities   TEXT[],
    temple_type         VARCHAR(100),
    architectural_style VARCHAR(100),

    address_line1       VARCHAR(300) NOT NULL,
    address_line2       VARCHAR(300),
    city                VARCHAR(100) NOT NULL,
    district            VARCHAR(100),
    state               VARCHAR(100) NOT NULL,
    country             VARCHAR(100) DEFAULT 'India',
    pincode             VARCHAR(10),
    latitude            DECIMAL(10, 8) NOT NULL,
    longitude           DECIMAL(11, 8) NOT NULL,

    phone               VARCHAR(15),
    email               VARCHAR(255),
    website             VARCHAR(500),

    cover_image_url     TEXT,
    thumbnail_url       TEXT,
    virtual_tour_url    TEXT,

    established_year    INTEGER,
    history             TEXT,
    significance        TEXT,
    how_to_reach        TEXT,
    nearest_railway     VARCHAR(200),
    nearest_airport     VARCHAR(200),

    pandit_count        INTEGER DEFAULT 0,
    review_count        INTEGER DEFAULT 0,
    avg_rating          DECIMAL(3, 2) DEFAULT 0.00,
    total_views         BIGINT DEFAULT 0,

    is_verified         BOOLEAN DEFAULT FALSE,
    is_featured         BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    managed_by          UUID REFERENCES users(id),

    meta_title          VARCHAR(200),
    meta_description    VARCHAR(500),
    meta_keywords       TEXT[],

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_temples_slug ON temples(slug);
CREATE INDEX idx_temples_city ON temples(city);
CREATE INDEX idx_temples_state ON temples(state);
CREATE INDEX idx_temples_city_state ON temples(city, state);
CREATE INDEX idx_temples_deity ON temples(primary_deity);
CREATE INDEX idx_temples_type ON temples(temple_type);
CREATE INDEX idx_temples_featured ON temples(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_temples_active ON temples(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_temples_rating ON temples(avg_rating DESC);
CREATE INDEX idx_temples_location ON temples USING GIST (ST_MakePoint(longitude, latitude));
CREATE INDEX idx_temples_search ON temples USING GIN (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(primary_deity, ''))
);
CREATE INDEX idx_temples_name_trgm ON temples USING GIN (name gin_trgm_ops);
CREATE TRIGGER trg_temples_updated BEFORE UPDATE ON temples
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE temple_timings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temple_id       UUID NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
    day             day_of_week NOT NULL,

    morning_open    TIME,
    morning_close   TIME,
    evening_open    TIME,
    evening_close   TIME,

    is_closed       BOOLEAN DEFAULT FALSE,
    special_note    VARCHAR(300),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(temple_id, day)
);

CREATE INDEX idx_temple_timings_temple ON temple_timings(temple_id);

CREATE TABLE temple_media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temple_id       UUID NOT NULL REFERENCES temples(id) ON DELETE CASCADE,

    media_url       TEXT NOT NULL,
    media_type      media_type NOT NULL,
    title           VARCHAR(200),
    caption         VARCHAR(500),
    display_order   INTEGER DEFAULT 0,

    is_cover        BOOLEAN DEFAULT FALSE,
    file_size_bytes BIGINT,
    mime_type       VARCHAR(50),

    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_temple_media_temple ON temple_media(temple_id);
CREATE INDEX idx_temple_media_type ON temple_media(media_type);

-- ============================================================
-- Module 3: Services & categories (created before pandits: pandit_services FKs it)
-- ============================================================
CREATE TABLE service_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL UNIQUE,
    slug            VARCHAR(200) UNIQUE NOT NULL,
    description     TEXT,
    icon_name       VARCHAR(100),
    display_order   INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE services (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id         UUID NOT NULL REFERENCES service_categories(id),

    name                VARCHAR(200) NOT NULL,
    slug                VARCHAR(250) UNIQUE NOT NULL,
    description         TEXT,
    short_description   VARCHAR(500),

    icon_name           VARCHAR(100),
    image_url           TEXT,

    estimated_duration  VARCHAR(100),
    difficulty_level    VARCHAR(50),

    samagri_list        JSONB,
    recommended_muhurat TEXT,
    recommended_tithi   TEXT[],

    meta_title          VARCHAR(200),
    meta_description    VARCHAR(500),

    is_popular          BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    display_order       INTEGER DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_category ON services(category_id);
CREATE INDEX idx_services_slug ON services(slug);
CREATE INDEX idx_services_popular ON services(is_popular) WHERE is_popular = TRUE;
CREATE INDEX idx_services_search ON services USING GIN (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
);
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE service_samagri (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,

    item_name       VARCHAR(200) NOT NULL,
    item_name_hindi VARCHAR(200),
    quantity        VARCHAR(100),
    is_essential    BOOLEAN DEFAULT TRUE,
    display_order   INTEGER DEFAULT 0,

    store_link      TEXT
);

CREATE INDEX idx_samagri_service ON service_samagri(service_id);

-- ============================================================
-- Module 4: Pandits
-- ============================================================
CREATE TABLE pandits (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    title                   VARCHAR(50) DEFAULT 'Pandit',
    bio                     TEXT,
    short_bio               VARCHAR(300),
    experience_years        INTEGER DEFAULT 0,

    primary_specialization  VARCHAR(200),
    specializations         TEXT[],
    traditions              TEXT[],
    vedic_knowledge         TEXT[],

    public_phone            VARCHAR(15),
    whatsapp_number         VARCHAR(15),
    public_email            VARCHAR(255),

    profile_photo_url       TEXT,
    video_intro_url         TEXT,
    video_intro_thumbnail   TEXT,
    qr_code_url             TEXT,

    verification_status     verification_status DEFAULT 'unverified',
    verified_at             TIMESTAMPTZ,
    verified_by             UUID REFERENCES users(id),
    id_proof_type           VARCHAR(50),
    id_proof_number_hash    VARCHAR(255),
    video_kyc_completed     BOOLEAN DEFAULT FALSE,

    review_count            INTEGER DEFAULT 0,
    avg_rating              DECIMAL(3, 2) DEFAULT 0.00,
    total_profile_views     BIGINT DEFAULT 0,
    total_contact_clicks    BIGINT DEFAULT 0,
    total_whatsapp_clicks   BIGINT DEFAULT 0,
    total_call_clicks       BIGINT DEFAULT 0,
    completed_ceremonies    INTEGER DEFAULT 0,

    current_tier            subscription_tier DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,

    is_featured             BOOLEAN DEFAULT FALSE,
    featured_until          TIMESTAMPTZ,
    rank_score              DECIMAL(10, 4) DEFAULT 0.0,

    is_available            BOOLEAN DEFAULT TRUE,
    accepts_online          BOOLEAN DEFAULT FALSE,
    travel_radius_km        INTEGER DEFAULT 50,
    min_advance_booking_hrs INTEGER DEFAULT 24,

    slug                    VARCHAR(200) UNIQUE NOT NULL,
    meta_title              VARCHAR(200),
    meta_description        VARCHAR(500),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_pandits_user ON pandits(user_id);
CREATE INDEX idx_pandits_slug ON pandits(slug);
CREATE INDEX idx_pandits_verification ON pandits(verification_status);
CREATE INDEX idx_pandits_tier ON pandits(current_tier);
CREATE INDEX idx_pandits_rating ON pandits(avg_rating DESC);
CREATE INDEX idx_pandits_featured ON pandits(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_pandits_available ON pandits(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_pandits_rank ON pandits(rank_score DESC);
CREATE INDEX idx_pandits_experience ON pandits(experience_years DESC);
CREATE INDEX idx_pandits_search ON pandits USING GIN (
    to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(primary_specialization, ''))
);
CREATE TRIGGER trg_pandits_updated BEFORE UPDATE ON pandits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE pandit_languages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id   UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    language    VARCHAR(50) NOT NULL,
    proficiency VARCHAR(30) DEFAULT 'fluent',
    UNIQUE(pandit_id, language)
);

CREATE INDEX idx_pandit_languages_pandit ON pandit_languages(pandit_id);
CREATE INDEX idx_pandit_languages_lang ON pandit_languages(language);

CREATE TABLE pandit_certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id           UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,

    certificate_name    VARCHAR(300) NOT NULL,
    institution         VARCHAR(300),
    year_obtained       INTEGER,
    document_url        TEXT,

    is_verified         BOOLEAN DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID REFERENCES users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pandit_certs_pandit ON pandit_certificates(pandit_id);

CREATE TABLE pandit_media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,

    media_url       TEXT NOT NULL,
    media_type      media_type NOT NULL,
    title           VARCHAR(200),
    caption         VARCHAR(500),
    display_order   INTEGER DEFAULT 0,

    file_size_bytes BIGINT,
    mime_type       VARCHAR(50),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pandit_media_pandit ON pandit_media(pandit_id);

CREATE TABLE pandit_availability (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,

    day             day_of_week NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    is_available    BOOLEAN DEFAULT TRUE,
    note            VARCHAR(300),

    UNIQUE(pandit_id, day),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_pandit_avail_pandit ON pandit_availability(pandit_id);

CREATE TABLE pandit_blocked_dates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id   UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,

    blocked_date DATE NOT NULL,
    reason       VARCHAR(300),
    UNIQUE(pandit_id, blocked_date)
);

CREATE INDEX idx_blocked_dates_pandit ON pandit_blocked_dates(pandit_id);
CREATE INDEX idx_blocked_dates_date ON pandit_blocked_dates(blocked_date);

-- ============================================================
-- Module 5: Service ↔ Pandit/Temple mappings
-- ============================================================
CREATE TABLE pandit_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,

    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    price_note      VARCHAR(300),

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pandit_id, service_id)
);

CREATE INDEX idx_pandit_services_pandit ON pandit_services(pandit_id);
CREATE INDEX idx_pandit_services_service ON pandit_services(service_id);

CREATE TABLE pandit_temples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    temple_id       UUID NOT NULL REFERENCES temples(id) ON DELETE CASCADE,

    is_primary      BOOLEAN DEFAULT FALSE,
    association_type VARCHAR(50) DEFAULT 'visiting',
    since_year      INTEGER,

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pandit_id, temple_id)
);

CREATE INDEX idx_pandit_temples_pandit ON pandit_temples(pandit_id);
CREATE INDEX idx_pandit_temples_temple ON pandit_temples(temple_id);
CREATE TRIGGER trg_temple_pandit_count
    AFTER INSERT OR UPDATE OR DELETE ON pandit_temples
    FOR EACH ROW EXECUTE FUNCTION update_temple_pandit_count();

CREATE TABLE temple_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temple_id       UUID NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(temple_id, service_id)
);

CREATE INDEX idx_temple_services_temple ON temple_services(temple_id);
CREATE INDEX idx_temple_services_service ON temple_services(service_id);

-- ============================================================
-- Module 6: Reviews & ratings
-- ============================================================
CREATE TABLE reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),

    reviewable_type     reviewable_type NOT NULL,
    reviewable_id       UUID NOT NULL,  -- pandit.id or temple.id — polymorphic, no DB-level FK

    rating              SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title               VARCHAR(200),
    body                TEXT,

    photo_urls          TEXT[],
    video_url           TEXT,

    service_id          UUID REFERENCES services(id),
    ceremony_date       DATE,

    is_verified         BOOLEAN DEFAULT FALSE,
    is_approved         BOOLEAN DEFAULT TRUE,
    is_flagged          BOOLEAN DEFAULT FALSE,
    flag_reason         VARCHAR(300),

    helpful_count       INTEGER DEFAULT 0,

    response_text       TEXT,
    response_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_target ON reviews(reviewable_type, reviewable_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_approved ON reviews(is_approved) WHERE is_approved = TRUE;
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_review_stats
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_pandit_review_stats();

CREATE TABLE review_helpfulness (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful  BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

-- ============================================================
-- Module 7: Inquiries & contact tracking
-- ============================================================
-- Deviation from the proposal: user_id is nullable here. The frontend has no
-- login yet (see docs/ARCHITECTURE.md) and temple/pandit inquiry forms are
-- submitted anonymously today — making this NOT NULL would break the one
-- write-path this app actually has in production right now.
CREATE TABLE inquiries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id         UUID REFERENCES users(id),
    pandit_id       UUID NOT NULL REFERENCES pandits(id),
    temple_id       UUID REFERENCES temples(id),
    service_id      UUID REFERENCES services(id),

    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(15) NOT NULL,
    email           VARCHAR(255),
    message         TEXT,
    preferred_date  DATE,
    preferred_time  TIME,

    status          inquiry_status DEFAULT 'new',

    contact_method  contact_method,
    contacted_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inquiries_user ON inquiries(user_id);
CREATE INDEX idx_inquiries_pandit ON inquiries(pandit_id);
CREATE INDEX idx_inquiries_status ON inquiries(status);
CREATE INDEX idx_inquiries_created ON inquiries(created_at DESC);
CREATE TRIGGER trg_inquiries_updated BEFORE UPDATE ON inquiries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- inquiries has no public SELECT policy (phone numbers/messages must never
-- be publicly readable — see inquiries_select_own_or_pandit/_admin below).
-- The lead-distribution fairness engine (Module 15) still needs to know how
-- many leads each pandit has received recently, from the *public*, anonymous
-- pandits listing — same chicken-and-egg as auth_find_user_by_email/
-- current_app_user_is_admin above, same fix: SECURITY DEFINER, scoped to
-- return nothing but an id and a count, never the row itself.
CREATE OR REPLACE FUNCTION get_pandit_lead_counts(p_since TIMESTAMPTZ, p_today_start TIMESTAMPTZ)
RETURNS TABLE(pandit_id UUID, window_leads BIGINT, today_leads BIGINT) AS $$
    SELECT p_id as pandit_id, SUM(cnt)::BIGINT AS window_leads, SUM(today_cnt)::BIGINT AS today_leads
    FROM (
      SELECT i.pandit_id as p_id, COUNT(*) as cnt, COUNT(*) FILTER (WHERE i.created_at >= p_today_start) as today_cnt 
      FROM inquiries i WHERE i.created_at >= p_since GROUP BY i.pandit_id
      UNION ALL
      SELECT c.pandit_id as p_id, COUNT(*) as cnt, COUNT(*) FILTER (WHERE c.created_at >= p_today_start) as today_cnt 
      FROM contact_clicks c WHERE c.created_at >= p_since GROUP BY c.pandit_id
    ) sub
    GROUP BY p_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION get_pandit_lead_counts(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

CREATE OR REPLACE FUNCTION increment_pandit_stats(p_id UUID, p_type VARCHAR, p_method VARCHAR DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_type = 'view' THEN
        UPDATE pandits SET total_profile_views = total_profile_views + 1 WHERE id = p_id;
    ELSIF p_type = 'click' THEN
        UPDATE pandits SET total_contact_clicks = total_contact_clicks + 1 WHERE id = p_id;
        IF p_method = 'whatsapp' THEN
            UPDATE pandits SET total_whatsapp_clicks = total_whatsapp_clicks + 1 WHERE id = p_id;
        ELSIF p_method = 'phone_call' THEN
            UPDATE pandits SET total_call_clicks = total_call_clicks + 1 WHERE id = p_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION increment_pandit_stats(UUID, VARCHAR, VARCHAR) FROM PUBLIC;

CREATE TABLE contact_clicks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pandit_id       UUID NOT NULL REFERENCES pandits(id),
    user_id         UUID REFERENCES users(id),

    contact_method  contact_method NOT NULL,
    source_page     VARCHAR(100),

    temple_id       UUID REFERENCES temples(id),
    service_id      UUID REFERENCES services(id),

    ip_address      INET,
    user_agent      TEXT,
    device_type     VARCHAR(20),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_clicks_pandit ON contact_clicks(pandit_id);
CREATE INDEX idx_contact_clicks_method ON contact_clicks(contact_method);
CREATE INDEX idx_contact_clicks_created ON contact_clicks(created_at DESC);

-- ============================================================
-- Module 8: Subscriptions & payments
-- ============================================================
CREATE TABLE subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name                VARCHAR(100) NOT NULL,
    tier                subscription_tier NOT NULL UNIQUE,

    price_monthly       DECIMAL(10, 2) NOT NULL,
    price_quarterly     DECIMAL(10, 2),
    price_yearly        DECIMAL(10, 2),
    currency            VARCHAR(3) DEFAULT 'INR',

    features            JSONB NOT NULL,

    max_temple_listings INTEGER DEFAULT 1,
    max_service_listings INTEGER DEFAULT 5,
    max_photos          INTEGER DEFAULT 5,

    is_popular          BOOLEAN DEFAULT FALSE,
    display_order       INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE pandit_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES subscription_plans(id),

    billing_cycle   VARCHAR(20) NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,

    is_active       BOOLEAN DEFAULT TRUE,
    auto_renew      BOOLEAN DEFAULT TRUE,
    cancelled_at    TIMESTAMPTZ,
    cancellation_reason TEXT,

    last_payment_id UUID,  -- no FK: payment_transactions references this table too (avoids a cycle)
    next_billing_at TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pandit_subs_pandit ON pandit_subscriptions(pandit_id);
CREATE INDEX idx_pandit_subs_active ON pandit_subscriptions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_pandit_subs_expires ON pandit_subscriptions(expires_at);
CREATE TRIGGER trg_pandit_subs_updated BEFORE UPDATE ON pandit_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE payment_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pandit_id           UUID NOT NULL REFERENCES pandits(id),
    subscription_id     UUID REFERENCES pandit_subscriptions(id),
    plan_id             UUID REFERENCES subscription_plans(id),

    amount              DECIMAL(10, 2) NOT NULL,
    currency            VARCHAR(3) DEFAULT 'INR',
    status              payment_status DEFAULT 'pending',

    gateway             VARCHAR(50) NOT NULL,
    gateway_order_id    VARCHAR(255),
    gateway_payment_id  VARCHAR(255),
    gateway_signature   VARCHAR(500),
    gateway_response    JSONB,

    invoice_number      VARCHAR(50) UNIQUE,
    invoice_url         TEXT,
    gst_amount          DECIMAL(10, 2),

    description         VARCHAR(500),

    paid_at             TIMESTAMPTZ,
    refunded_at         TIMESTAMPTZ,
    refund_amount       DECIMAL(10, 2),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_pandit ON payment_transactions(pandit_id);
CREATE INDEX idx_payments_status ON payment_transactions(status);
CREATE INDEX idx_payments_gateway ON payment_transactions(gateway_payment_id);
CREATE INDEX idx_payments_created ON payment_transactions(created_at DESC);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Module 9: Community, blog & content
-- ============================================================
CREATE TABLE blog_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID NOT NULL REFERENCES users(id),

    title           VARCHAR(300) NOT NULL,
    slug            VARCHAR(350) UNIQUE NOT NULL,
    excerpt         VARCHAR(500),
    body            TEXT NOT NULL,
    cover_image_url TEXT,

    category        VARCHAR(100),
    tags            TEXT[],

    meta_title      VARCHAR(200),
    meta_description VARCHAR(500),

    view_count      BIGINT DEFAULT 0,
    like_count      INTEGER DEFAULT 0,

    status          content_status DEFAULT 'draft',
    published_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blog_slug ON blog_posts(slug);
CREATE INDEX idx_blog_status ON blog_posts(status);
CREATE INDEX idx_blog_published ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_search ON blog_posts USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
);
CREATE TRIGGER trg_blog_posts_updated BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE community_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),

    title           VARCHAR(300) NOT NULL,
    body            TEXT NOT NULL,
    category        VARCHAR(100),

    view_count      BIGINT DEFAULT 0,
    like_count      INTEGER DEFAULT 0,
    comment_count   INTEGER DEFAULT 0,

    is_pinned       BOOLEAN DEFAULT FALSE,
    status          content_status DEFAULT 'published',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_user ON community_posts(user_id);
CREATE INDEX idx_community_category ON community_posts(category);
CREATE INDEX idx_community_created ON community_posts(created_at DESC);
CREATE TRIGGER trg_community_posts_updated BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE community_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    parent_id   UUID REFERENCES community_comments(id),

    body        TEXT NOT NULL,
    like_count  INTEGER DEFAULT 0,

    status      content_status DEFAULT 'published',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON community_comments(post_id);
CREATE INDEX idx_comments_parent ON community_comments(parent_id);

-- ============================================================
-- Module 10: Notifications
-- ============================================================
-- (Panchang/festivals tables removed — see 24-drop-panchang-festivals.sql.
-- A fresh install never creates them in the first place.)
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    type            notification_type NOT NULL,
    title           VARCHAR(300) NOT NULL,
    body            TEXT,

    action_url      VARCHAR(500),
    action_data     JSONB,

    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,

    sent_via_push   BOOLEAN DEFAULT FALSE,
    sent_via_email  BOOLEAN DEFAULT FALSE,
    sent_via_sms    BOOLEAN DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notif_type ON notifications(type);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);

-- ============================================================
-- Module 11: Saved items, AI & analytics
-- ============================================================
CREATE TABLE saved_pandits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pandit_id   UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, pandit_id)
);

CREATE INDEX idx_saved_pandits_user ON saved_pandits(user_id);

CREATE TABLE saved_temples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    temple_id   UUID NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, temple_id)
);

CREATE INDEX idx_saved_temples_user ON saved_temples(user_id);

CREATE TABLE ai_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),

    user_query      TEXT NOT NULL,
    user_situation  TEXT,

    recommended_services UUID[],
    recommendation_text  TEXT,
    confidence_score     DECIMAL(5, 4),

    model_version   VARCHAR(50),
    response_time_ms INTEGER,

    was_helpful     BOOLEAN,
    user_feedback   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_recs_user ON ai_recommendations(user_id);
CREATE INDEX idx_ai_recs_created ON ai_recommendations(created_at DESC);

CREATE TABLE pandit_analytics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id       UUID NOT NULL REFERENCES pandits(id) ON DELETE CASCADE,
    date            DATE NOT NULL,

    profile_views       INTEGER DEFAULT 0,
    search_appearances  INTEGER DEFAULT 0,
    whatsapp_clicks     INTEGER DEFAULT 0,
    call_clicks         INTEGER DEFAULT 0,
    message_clicks      INTEGER DEFAULT 0,
    inquiry_count       INTEGER DEFAULT 0,
    review_count        INTEGER DEFAULT 0,

    views_from_search   INTEGER DEFAULT 0,
    views_from_temple   INTEGER DEFAULT 0,
    views_from_direct   INTEGER DEFAULT 0,
    views_from_featured INTEGER DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pandit_id, date)
);

CREATE INDEX idx_analytics_pandit ON pandit_analytics(pandit_id);
CREATE INDEX idx_analytics_date ON pandit_analytics(date DESC);
CREATE INDEX idx_analytics_pandit_date ON pandit_analytics(pandit_id, date DESC);

CREATE TABLE platform_analytics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE UNIQUE NOT NULL,

    total_users         INTEGER DEFAULT 0,
    new_users           INTEGER DEFAULT 0,
    active_users        INTEGER DEFAULT 0,
    total_pandits       INTEGER DEFAULT 0,
    new_pandits         INTEGER DEFAULT 0,
    total_temples       INTEGER DEFAULT 0,
    total_inquiries     INTEGER DEFAULT 0,
    total_reviews       INTEGER DEFAULT 0,
    total_contact_clicks INTEGER DEFAULT 0,

    total_revenue       DECIMAL(12, 2) DEFAULT 0,
    active_subscriptions INTEGER DEFAULT 0,

    page_views          BIGINT DEFAULT 0,
    unique_visitors     BIGINT DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_analytics_date ON platform_analytics(date DESC);

-- ============================================================
-- Module 12: app-specific reference/display tables
-- ============================================================
-- Not part of the generic 37-table design — these back existing frontend
-- pages/endpoints (site stats strip, taxonomy filters, the AI Pooja Guide's
-- rule table, the general contact form and newsletter signup) that the
-- enterprise schema doesn't model. Kept so the rest of the app keeps working.
CREATE TABLE faqs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stats (
    icon            VARCHAR(100) NOT NULL,
    number_label    VARCHAR(50) NOT NULL,
    label           VARCHAR(150) NOT NULL,
    display_order   INTEGER NOT NULL PRIMARY KEY
);

CREATE TABLE taxonomy (
    kind            VARCHAR(20) NOT NULL,  -- 'city' | 'state' | 'language'
    value           VARCHAR(150) NOT NULL,
    display_order   INTEGER NOT NULL,
    PRIMARY KEY (kind, value)
);

CREATE TABLE recommend_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keywords        TEXT[] NOT NULL,
    service_slugs   TEXT[] NOT NULL,  -- services.slug — no FK (array of natural keys, not surrogate ids)
    why             TEXT NOT NULL
);

CREATE TABLE contact_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    phone       VARCHAR(15),
    subject     VARCHAR(200),
    message     TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE newsletter_subscribers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Module 13: Security audit log (adapted from security_architecture.md)
-- ============================================================
-- Append-only by design (see the REVOKE at the bottom of this file) — no
-- updated_at/deleted_at, and panditconnect_app can INSERT but never
-- UPDATE/DELETE a row here, even though it owns everything else it touches.
CREATE TABLE security_audit_log (
    id              BIGSERIAL PRIMARY KEY,

    event_type      VARCHAR(100) NOT NULL,
    severity        VARCHAR(20) NOT NULL,   -- info, warn, error

    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address      INET,
    user_agent      TEXT,
    request_path    VARCHAR(500),
    request_method  VARCHAR(10),

    details         JSONB NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_event ON security_audit_log(event_type);
CREATE INDEX idx_audit_severity ON security_audit_log(severity);
CREATE INDEX idx_audit_user ON security_audit_log(user_id);
CREATE INDEX idx_audit_created ON security_audit_log(created_at DESC);

-- ============================================================
-- Module 14: Admin panel (adapted from admin_architecture.md)
-- ============================================================
-- Deviations from that proposal, all documented in full in docs/ADMIN.md:
--  - No RLS on these six tables. Every other RLS-scoped table in this schema
--    protects "a row's owner vs. everyone else"; these are only ever reached
--    through requireAdmin/requireSuperAdmin route middleware in the first
--    place, so there's no per-row ownership question for RLS to answer.
--  - Sessions are the same opaque-bearer-token + sha256-hash design as
--    user_sessions (see docs/SECURITY.md "Why not JWT"), kept in a SEPARATE
--    table so an admin session and a regular user session are never
--    confusable and can be revoked independently.
--  - IP is recorded for every admin session (auditing) but a change in IP
--    does NOT force-logout — this app has no account-recovery flow, and a
--    hard IP-lock would risk permanently bricking the one admin account over
--    an ordinary mobile-network IP change. It's logged to
--    security_audit_log instead (see backend/src/controllers/admin/auth.controller.js).

-- Immutable, like security_audit_log — every admin action, forever.
CREATE TABLE admin_activity_log (
    id              BIGSERIAL PRIMARY KEY,
    admin_user_id   UUID NOT NULL REFERENCES users(id),

    action          VARCHAR(100) NOT NULL,
    target_type     VARCHAR(50),
    target_id       UUID,

    details         JSONB NOT NULL DEFAULT '{}',
    ip_address      INET,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_log_admin ON admin_activity_log(admin_user_id);
CREATE INDEX idx_admin_log_action ON admin_activity_log(action);
CREATE INDEX idx_admin_log_target ON admin_activity_log(target_type, target_id);
CREATE INDEX idx_admin_log_created ON admin_activity_log(created_at DESC);

CREATE TABLE admin_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,

    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);

-- Bridges admin login's password step and its TOTP step (see
-- backend/src/controllers/admin/auth.controller.js) without a JWT — the
-- pending, not-yet-confirmed TOTP secret for first-time setup lives here,
-- encrypted, and is only copied onto users.totp_secret_encrypted once the
-- admin proves they can generate a matching code.
CREATE TABLE admin_mfa_challenges (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_token_hash        VARCHAR(255) NOT NULL UNIQUE,

    pending_totp_secret_encrypted TEXT,  -- set only on first-time TOTP setup

    expires_at                  TIMESTAMPTZ NOT NULL,
    consumed_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_challenge_token ON admin_mfa_challenges(challenge_token_hash);

-- Verifying a TOTP code means reading users.totp_secret_encrypted before any
-- session/identity exists — same chicken-and-egg as auth_find_user_by_email,
-- same fix: SECURITY DEFINER, scoped to exactly this lookup shape. Holding a
-- valid, unexpired, unconsumed challenge token IS the credential at this
-- step (it's what step 1 — password verification — handed back), the same
-- way a session token hash is elsewhere in this schema.
CREATE OR REPLACE FUNCTION admin_find_challenge_with_user(p_token_hash TEXT)
RETURNS TABLE (
    challenge_id UUID, user_id UUID, pending_totp_secret_encrypted TEXT,
    email VARCHAR, full_name VARCHAR, role user_role, status account_status,
    totp_secret_encrypted TEXT, totp_enabled BOOLEAN
) AS $$
    SELECT c.id, u.id, c.pending_totp_secret_encrypted,
           u.email, u.full_name, u.role, u.status, u.totp_secret_encrypted, u.totp_enabled
    FROM admin_mfa_challenges c JOIN users u ON u.id = c.user_id
    WHERE c.challenge_token_hash = p_token_hash AND c.consumed_at IS NULL AND c.expires_at > NOW();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION admin_find_challenge_with_user(TEXT) FROM PUBLIC;

-- Logged, not auto-banned (see docs/ADMIN.md for why the proposal's
-- automatic-ban-on-first-hit was toned down to manual review + ban).
CREATE TABLE honeypot_logs (
    id              BIGSERIAL PRIMARY KEY,

    ip_address      INET NOT NULL,
    attempted_path  VARCHAR(500) NOT NULL,
    method          VARCHAR(10),
    user_agent      TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_honeypot_ip ON honeypot_logs(ip_address);
CREATE INDEX idx_honeypot_created ON honeypot_logs(created_at DESC);

CREATE TABLE banned_ips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    ip_address      INET NOT NULL,
    reason          VARCHAR(500),

    banned_by       UUID REFERENCES users(id),
    banned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,        -- NULL = permanent

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    unbanned_at     TIMESTAMPTZ,
    unbanned_by     UUID REFERENCES users(id)
);

CREATE INDEX idx_banned_ips_ip ON banned_ips(ip_address);
CREATE INDEX idx_banned_ips_active ON banned_ips(is_active) WHERE is_active = TRUE;

CREATE TABLE platform_settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     VARCHAR(500),
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row-Level Security
-- ============================================================
-- Deviation from the proposal in two ways, both required for these policies
-- to actually work once enforced against a non-owner role (see
-- current_app_user_id() above):
--  1. current_setting(..., true) throughout, via current_app_user_id(), so an
--     anonymous request (no `app.current_user_id` set) degrades to "no rows"
--     instead of throwing "unrecognized configuration parameter".
--  2. Extra policies the original list omitted. Enabling RLS with only the
--     policies it specified would, under a real non-owner connection, make
--     `pandits` and `users` unreadable by anyone (no SELECT policy existed
--     for either) — which would take down the public directory entirely —
--     and would make `inquiries` a total black hole (RLS enabled, zero
--     policies of any kind). Added: public SELECT on pandits, public SELECT
--     on users for public-facing roles, registration INSERT on users, and
--     insert/select/update policies on inquiries so anonymous enquiries and
--     a pandit's own inbox both keep working.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pandits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pandit_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_insert_self ON users
    FOR INSERT WITH CHECK (true);                                   -- registration
CREATE POLICY users_select_self ON users
    FOR SELECT USING (id = current_app_user_id());
CREATE POLICY users_select_public ON users
    FOR SELECT USING (role IN ('pandit', 'temple_admin'));           -- public directory needs these
-- Reviews/community posts/blog posts are all public content whose author
-- name is meant to be visible (same as it always was in the flat, pre-auth
-- reviews.json data this replaced) — without this, GET /api/reviews and
-- GET /api/community/posts silently return an empty list, because their
-- JOIN to users drops every row RLS hides (devotee authors match neither
-- users_select_self, no context yet, nor the pandit/temple_admin policy
-- above). Scoped to users who have actually published something, not a
-- blanket "all devotees are public" rule.
CREATE POLICY users_select_via_public_content ON users
    FOR SELECT USING (
        id IN (SELECT user_id FROM reviews WHERE is_approved = TRUE AND deleted_at IS NULL)
        OR id IN (SELECT user_id FROM community_posts WHERE status = 'published')
        OR id IN (SELECT user_id FROM community_comments WHERE status = 'published')
        OR id IN (SELECT author_id FROM blog_posts WHERE status = 'published')
    );
CREATE POLICY users_update_self ON users
    FOR UPDATE USING (id = current_app_user_id());
-- Login/session-check itself has a chicken-and-egg problem: verifying a
-- bearer token means reading `users` before current_app_user_id() can be
-- set (that's what this query determines). backend/src/config/db.js's
-- withSetting sets app.session_token_hash for just this lookup instead, and
-- this policy only opens the door for the specific user whose own active
-- session that token hash belongs to.
CREATE POLICY users_select_by_bearer_session ON users
    FOR SELECT USING (
        id IN (
            SELECT user_id FROM user_sessions
            WHERE token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
              AND revoked_at IS NULL AND expires_at > NOW()
        )
    );
-- Admin panel (backend/src/routes/admin/*.routes.js, docs/ADMIN.md) needs
-- full visibility/management of every account, not just its own.
CREATE POLICY users_select_admin ON users
    FOR SELECT USING (current_app_user_is_admin());
CREATE POLICY users_update_admin ON users
    FOR UPDATE USING (current_app_user_is_admin());
-- Same bearer-session chicken-and-egg as users_select_by_bearer_session
-- above, for the separate admin_sessions table (a different setting name so
-- the two token checks can never be confused with each other).
CREATE POLICY users_select_by_admin_bearer_session ON users
    FOR SELECT USING (
        id IN (
            SELECT user_id FROM admin_sessions
            WHERE token_hash = NULLIF(current_setting('app.admin_session_token_hash', true), '')
              AND revoked_at IS NULL AND expires_at > NOW()
        )
    );

CREATE POLICY pandits_select_public ON pandits
    FOR SELECT USING (true);                                        -- the directory IS the product
CREATE POLICY pandits_insert_self ON pandits
    FOR INSERT WITH CHECK (user_id = current_app_user_id());
CREATE POLICY pandits_update_self ON pandits
    FOR UPDATE USING (user_id = current_app_user_id());
CREATE POLICY pandits_update_admin ON pandits
    FOR UPDATE USING (current_app_user_is_admin());        -- verification, featuring, edits

CREATE POLICY inquiries_insert_any ON inquiries
    FOR INSERT WITH CHECK (true);                                    -- anonymous enquiries, by design
CREATE POLICY inquiries_select_own_or_pandit ON inquiries
    FOR SELECT USING (
        user_id = current_app_user_id()
        OR pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );
CREATE POLICY inquiries_update_pandit ON inquiries
    FOR UPDATE USING (
        pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );
CREATE POLICY inquiries_select_admin ON inquiries
    FOR SELECT USING (current_app_user_is_admin());
CREATE POLICY inquiries_update_admin ON inquiries
    FOR UPDATE USING (current_app_user_is_admin());

CREATE POLICY notifications_insert_system ON notifications
    FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_select_own ON notifications
    FOR SELECT USING (user_id = current_app_user_id());
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (user_id = current_app_user_id());
CREATE POLICY notifications_select_admin ON notifications
    FOR SELECT USING (current_app_user_is_admin());

CREATE POLICY analytics_select_own ON pandit_analytics
    FOR SELECT USING (
        pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );
CREATE POLICY analytics_write_system ON pandit_analytics
    FOR INSERT WITH CHECK (true);
CREATE POLICY analytics_update_system ON pandit_analytics
    FOR UPDATE USING (true);
CREATE POLICY analytics_select_admin ON pandit_analytics
    FOR SELECT USING (current_app_user_is_admin());

CREATE POLICY payments_select_own ON payment_transactions
    FOR SELECT USING (
        pandit_id IN (SELECT id FROM pandits WHERE user_id = current_app_user_id())
    );
CREATE POLICY payments_select_admin ON payment_transactions
    FOR SELECT USING (current_app_user_is_admin());
-- The Razorpay webhook (backend/src/controllers/payments.controller.js)
-- looks a payment up by gateway_order_id with no end-user session at all —
-- it's authenticated by HMAC signature, not by being "someone". Rather than
-- an unconditional SELECT policy (which would let ANY request read ANY
-- pandit's payment history), the controller sets app.webhook_verified only
-- after the signature check passes, so this only opens up in that one
-- already-authenticated code path.
CREATE POLICY payments_select_verified_webhook ON payment_transactions
    FOR SELECT USING (current_setting('app.webhook_verified', true) = 'true');
CREATE POLICY payments_write_system ON payment_transactions
    FOR INSERT WITH CHECK (true);
CREATE POLICY payments_update_system ON payment_transactions
    FOR UPDATE USING (true);

-- ============================================================
-- Views
-- ============================================================
CREATE VIEW v_pandit_search AS
SELECT
    p.id, p.slug, p.title, u.full_name, u.city, u.state, u.latitude, u.longitude,
    p.profile_photo_url, p.short_bio, p.experience_years, p.avg_rating, p.review_count,
    p.verification_status, p.current_tier, p.is_featured, p.is_available, p.rank_score,
    p.whatsapp_number, p.public_phone, p.video_intro_url IS NOT NULL AS has_video_intro,
    ARRAY_AGG(DISTINCT pl.language) FILTER (WHERE pl.language IS NOT NULL) AS languages,
    p.specializations,
    (SELECT COUNT(*) FROM pandit_temples pt WHERE pt.pandit_id = p.id AND pt.is_active = TRUE) AS temple_count,
    (SELECT COUNT(*) FROM pandit_services ps WHERE ps.pandit_id = p.id AND ps.is_active = TRUE) AS service_count
FROM pandits p
JOIN users u ON p.user_id = u.id
LEFT JOIN pandit_languages pl ON p.id = pl.pandit_id
WHERE u.status = 'active' AND p.deleted_at IS NULL AND u.deleted_at IS NULL
GROUP BY p.id, u.id;

CREATE VIEW v_temple_search AS
SELECT
    t.id, t.slug, t.name, t.short_description, t.primary_deity, t.temple_type,
    t.city, t.district, t.state, t.latitude, t.longitude, t.cover_image_url, t.thumbnail_url,
    t.pandit_count, t.review_count, t.avg_rating, t.is_verified, t.is_featured,
    (SELECT COUNT(*) FROM temple_services ts WHERE ts.temple_id = t.id AND ts.is_active = TRUE) AS service_count,
    (SELECT COUNT(*) FROM temple_media tm WHERE tm.temple_id = t.id) AS media_count
FROM temples t
WHERE t.is_active = TRUE AND t.deleted_at IS NULL;

CREATE VIEW v_pandit_dashboard AS
SELECT
    p.id AS pandit_id, p.user_id, u.full_name, p.current_tier, p.verification_status,
    p.avg_rating, p.review_count, p.total_profile_views, p.total_contact_clicks,
    p.total_whatsapp_clicks, p.total_call_clicks,
    ps.billing_cycle, ps.expires_at AS subscription_expires, ps.is_active AS subscription_active,
    sp.name AS plan_name,
    COALESCE(SUM(pa.profile_views), 0) AS views_30d,
    COALESCE(SUM(pa.whatsapp_clicks), 0) AS whatsapp_30d,
    COALESCE(SUM(pa.call_clicks), 0) AS calls_30d,
    COALESCE(SUM(pa.inquiry_count), 0) AS inquiries_30d,
    (SELECT COUNT(*) FROM inquiries i WHERE i.pandit_id = p.id AND i.status = 'new') AS pending_inquiries
FROM pandits p
JOIN users u ON p.user_id = u.id
LEFT JOIN pandit_subscriptions ps ON p.id = ps.pandit_id AND ps.is_active = TRUE
LEFT JOIN subscription_plans sp ON ps.plan_id = sp.id
LEFT JOIN pandit_analytics pa ON p.id = pa.pandit_id AND pa.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, u.id, ps.id, sp.id;

-- ============================================================
-- Application role grants
-- ============================================================
GRANT USAGE ON SCHEMA public TO panditconnect_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO panditconnect_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO panditconnect_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO panditconnect_app;

-- security_audit_log is append-only, even for the app role — an attacker
-- (or a bug) that can INSERT/UPDATE/DELETE everything else still can't
-- rewrite or erase the audit trail describing what they did.
REVOKE UPDATE, DELETE ON security_audit_log FROM panditconnect_app;
-- Same reasoning for the admin activity log and the honeypot log — an
-- admin account being used to cover its own (or an attacker's) tracks
-- shouldn't be possible at the DB layer, regardless of app-code bugs.
REVOKE UPDATE, DELETE ON admin_activity_log FROM panditconnect_app;
REVOKE UPDATE, DELETE ON honeypot_logs FROM panditconnect_app;
