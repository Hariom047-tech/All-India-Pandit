/**
 * Server-side mirror of frontend/app/src/lib/indexability.ts — same
 * thresholds, same reasoning, operating on the raw repository return shapes
 * instead of the frontend's normalized Temple/Service/Pandit types (see that
 * file's docstring for the full rationale). Used by render.controller.js
 * (Phase 7) so a non-JS crawler sees the same noindex decision a real
 * browser would apply client-side — never a case where the server-injected
 * page is indexable but the client-rendered one isn't, or vice versa.
 */

const MEANINGFUL_TEXT_LENGTH = 40;

function hasMeaningfulText(text) {
  return Boolean(text && String(text).trim().length >= MEANINGFUL_TEXT_LENGTH);
}

/** `temple` is exactly what temples.repository.js's getBySlug() returns:
 *  `description` (raw), `about` (short_description alias), `pandits`
 *  (pandit_count alias), `services` (array of slugs). */
function isTempleIndexable(temple) {
  if (!temple) return false;
  return hasMeaningfulText(temple.description) || hasMeaningfulText(temple.about)
    || (temple.pandits || 0) > 0
    || (Array.isArray(temple.services) && temple.services.length > 0);
}

/** `service` is exactly what services.repository.js's getBySlug() returns:
 *  `desc` (description alias), `short_description`, `pandit_count`. */
function isServiceIndexable(service) {
  if (!service) return false;
  return hasMeaningfulText(service.desc) || hasMeaningfulText(service.short_description)
    || (service.pandit_count || 0) > 0;
}

/** `pandit` is exactly what pandits.repository.js's getBySlug() returns:
 *  `verification_status`, `about` (bio alias), `services`/`temples`
 *  (arrays of slugs from hydrate()). */
function isPanditIndexable(pandit) {
  if (!pandit) return false;
  if (pandit.verification_status !== 'verified') return false;
  return hasMeaningfulText(pandit.about)
    || (Array.isArray(pandit.services) && pandit.services.length > 0)
    || (Array.isArray(pandit.temples) && pandit.temples.length > 0);
}

module.exports = { isTempleIndexable, isServiceIndexable, isPanditIndexable };
