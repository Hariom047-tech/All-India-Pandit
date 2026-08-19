/**
 * Deterministic indexability rules for entity detail pages — Temple/Service/
 * Pandit pages that exist but don't yet carry enough real content to be
 * worth a search result are noindexed automatically, rather than only ever
 * noindexing hardcoded routes (login/search/dashboard/etc — see Seo.tsx call
 * sites). Master SEO prompt Parts 44-45: "Do not index incomplete entities
 * merely because they exist... create a deterministic rule based on actual
 * entity type," returning index,follow or noindex,follow.
 *
 * Deliberately a low bar, not a quality score — the goal is only to keep a
 * bare name+city stub (Part 44's own example) out of search, not to
 * second-guess admin-published content. Mirrored server-side in
 * backend/src/utils/indexability.js against the raw repository field names;
 * these operate on the frontend's already-normalized Temple/Service/Pandit
 * shapes (lib/normalize.ts) instead, since that's what every detail page
 * already has in scope.
 */
import type { Temple, Service, Pandit } from "../data/types";

const MEANINGFUL_TEXT_LENGTH = 40;

function hasMeaningfulText(text: string | undefined | null): boolean {
  return Boolean(text && text.trim().length >= MEANINGFUL_TEXT_LENGTH);
}

/** A real description, or at least one real relationship (an associated
 *  pandit or a catalogue service) — not just a name and a city. */
export function isTempleIndexable(temple: Temple | null | undefined): boolean {
  if (!temple) return false;
  return hasMeaningfulText(temple.about)
    || temple.pandits > 0
    || temple.services.length > 0;
}

/** A real description, or at least one pandit actually offering it — a
 *  catalogue entry with no description and nobody performing it yet has
 *  nothing a searcher could act on. */
export function isServiceIndexable(service: Service | null | undefined): boolean {
  if (!service) return false;
  return hasMeaningfulText(service.desc) || service.pandits > 0;
}

/** Verification status alone isn't enough — an admin-verified pandit with a
 *  still-empty bio and no services/temples linked is still a thin profile.
 *  Requires both: verified, AND (a real bio or a real relationship). */
export function isPanditIndexable(pandit: Pandit | null | undefined): boolean {
  if (!pandit) return false;
  if (!pandit.verified) return false;
  return hasMeaningfulText(pandit.about)
    || pandit.services.length > 0
    || pandit.temples.length > 0;
}
