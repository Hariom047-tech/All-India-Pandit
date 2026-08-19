BEGIN;
DELETE FROM reviews;
DELETE FROM pandit_services;
DELETE FROM pandit_temples;
DELETE FROM pandit_languages;
DELETE FROM pandit_certificates;
DELETE FROM pandit_media;
DELETE FROM pandit_availability;
DELETE FROM pandit_blocked_dates;
DELETE FROM pandit_analytics;
DELETE FROM pandit_subscriptions;
DELETE FROM payment_transactions;
DELETE FROM saved_pandits;
DELETE FROM inquiries;
DELETE FROM pandits;

DELETE FROM temple_services;
DELETE FROM temple_timings;
DELETE FROM temple_media;
DELETE FROM saved_temples;
DELETE FROM temples;

DELETE FROM service_samagri;
DELETE FROM services;
DELETE FROM service_categories;

DELETE FROM blog_posts;
DELETE FROM faqs;

DELETE FROM users WHERE role NOT IN ('admin', 'super_admin');
COMMIT;
