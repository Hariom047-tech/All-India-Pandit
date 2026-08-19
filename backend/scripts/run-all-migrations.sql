-- Combined migration runner: applies 04 through 10
-- Run as postgres superuser (owner of the schema)

\echo 'Applying 04-dynamic-content.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/04-dynamic-content.sql

\echo 'Applying 05-temple-content.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/05-temple-content.sql

\echo 'Applying 06-service-categories.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/06-service-categories.sql

\echo 'Applying 07-online-puja.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/07-online-puja.sql

\echo 'Applying 08-pandit-credentials.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/08-pandit-credentials.sql

\echo 'Applying 09-platform-reviews.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/09-platform-reviews.sql

\echo 'Applying 10-temple-media-placement.sql...'
\i C:/maa-baglamukhi-project/backend/src/db/10-temple-media-placement.sql

\echo 'All migrations applied successfully!'
