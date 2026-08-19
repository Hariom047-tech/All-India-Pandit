const { query } = require('../config/db');

/** Every publicly indexable entity URL, with its own updated_at for
 *  <lastmod> — matches the same visibility gates the public list/detail
 *  endpoints already use (temples.repository.js, services.repository.js,
 *  pandits.repository.js), so nothing appears in the sitemap that a visitor
 *  couldn't actually browse to.
 *
 *  Also applies the Phase 11 indexability engine's thin-content rule
 *  (backend/src/utils/indexability.js) — a visible-but-thin entity gets
 *  `noindex` on its own page, and was still being listed here regardless,
 *  telling crawlers to index a page that explicitly tells them not to (Phase
 *  12 technical SEO batch, docs/SEO_ARCHITECTURE.md). Expressed directly in
 *  SQL rather than calling isTempleIndexable/isServiceIndexable/
 *  isPanditIndexable per row — those expect each entity's full getBySlug()
 *  shape, and running that per row for a sitemap covering ~1,000+ pandits
 *  would mean 1,000+ extra queries; the WHERE clauses below are the exact
 *  same signals (same 40-char meaningful-text threshold, same
 *  verified-status gate, same relationship checks), just computed in bulk. */
async function listIndexableUrls() {
  const [{ rows: temples }, { rows: services }, { rows: pandits }] = await Promise.all([
    query(`
      SELECT t.slug, t.updated_at FROM temples t
      WHERE t.is_active = TRUE AND t.deleted_at IS NULL
        AND (
          LENGTH(TRIM(COALESCE(t.description, ''))) >= 40
          OR LENGTH(TRIM(COALESCE(t.short_description, ''))) >= 40
          OR COALESCE(t.pandit_count, 0) > 0
          OR EXISTS (SELECT 1 FROM temple_services ts WHERE ts.temple_id = t.id)
        )
      ORDER BY t.slug`),
    query(`
      SELECT s.slug, s.updated_at FROM services s
      WHERE s.is_active = TRUE
        AND (
          LENGTH(TRIM(COALESCE(s.description, ''))) >= 40
          OR LENGTH(TRIM(COALESCE(s.short_description, ''))) >= 40
          OR EXISTS (SELECT 1 FROM pandit_services ps WHERE ps.service_id = s.id AND ps.is_active = TRUE)
        )
      ORDER BY s.slug`),
    query(`
      SELECT p.slug, p.updated_at
        FROM pandits p JOIN users u ON u.id = p.user_id
       WHERE u.status = 'active' AND p.deleted_at IS NULL AND u.deleted_at IS NULL
         AND p.verification_status = 'verified'
         AND (
           LENGTH(TRIM(COALESCE(p.bio, ''))) >= 40
           OR EXISTS (SELECT 1 FROM pandit_services ps WHERE ps.pandit_id = p.id)
           OR EXISTS (SELECT 1 FROM pandit_temples pt WHERE pt.pandit_id = p.id)
         )
       ORDER BY p.slug`),
  ]);
  return { temples, services, pandits };
}

module.exports = { listIndexableUrls };
