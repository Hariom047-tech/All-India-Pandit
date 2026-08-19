-- ============================================================
-- APPLY ALL MIGRATIONS (04 through 11) — idempotent
-- Run as: psql -U postgres -d panditconnect -f this_file.sql
-- ============================================================

\echo '→ Migration 04: Dynamic service content + home hero images'
\i C:/maa-baglamukhi-project/backend/src/db/04-dynamic-content.sql

\echo '→ Migration 05: Temple content (highlights, significance)'
\i C:/maa-baglamukhi-project/backend/src/db/05-temple-content.sql

\echo '→ Migration 06: Service categories (home_rank)'
\i C:/maa-baglamukhi-project/backend/src/db/06-service-categories.sql

\echo '→ Migration 07: Online puja support'
\i C:/maa-baglamukhi-project/backend/src/db/07-online-puja.sql

\echo '→ Migration 08: Pandit credentials (gotra, vedic_education)'
\i C:/maa-baglamukhi-project/backend/src/db/08-pandit-credentials.sql

\echo '→ Migration 09: Platform reviews'
\i C:/maa-baglamukhi-project/backend/src/db/09-platform-reviews.sql

\echo '→ Migration 10: Temple media placement (show_in_hero)'
\i C:/maa-baglamukhi-project/backend/src/db/10-temple-media-placement.sql

\echo '→ Migration 11: Temple services (custom_services)'
\i C:/maa-baglamukhi-project/backend/src/db/11-temple-services.sql

\echo ''
\echo '=========================================='
\echo 'ALL DONE! Refresh the admin panel now.'
\echo '=========================================='
