import { useEffect } from "react";
import { siteConfig, absoluteUrl } from "./siteConfig";

/** Stable entity identifiers, reused across every page's graph so a crawler
 *  can recognize "this is the same Organization/WebSite referenced on the
 *  temple page, the service page, and everywhere else" rather than treating
 *  each page's schema as describing an unrelated, disconnected entity
 *  (docs/SEO_ARCHITECTURE.md §14 — entity @id/@graph linking). */
export const organizationId = () => `${siteConfig.url}/#organization`;
export const websiteId = () => `${siteConfig.url}/#website`;
export const placeOfWorshipId = (path: string) => `${absoluteUrl(path)}#place`;
export const serviceId = (path: string) => `${absoluteUrl(path)}#service`;
export const personId = (path: string) => `${absoluteUrl(path)}#person`;
export const faqPageId = (path: string) => `${absoluteUrl(path)}#faq`;

/**
 * Injects one <script type="application/ld+json"> per page, singleton-DOM-
 * mutation style — same reasoning as Seo.tsx: nothing here is rendered
 * declaratively because that path doesn't reliably dedupe (see
 * docs/SEO_ARCHITECTURE.md). Always wraps the given nodes as a single
 * `{"@context": ..., "@graph": [...]}` document (rather than an array of
 * separately-@context'd objects) so per-node `@id` references — WebPage.about,
 * WebSite.publisher, etc. — resolve within one JSON-LD document, matching
 * how mainstream SEO tooling structures multi-entity pages.
 */
export function useStructuredData(schema: (object | null | undefined) | (object | null | undefined)[]) {
  // Callers often build the array from optional pieces (a FAQPage schema
  // that's null when there are no FAQs, etc.) — drop those rather than
  // emitting an invalid `null` entry into the JSON-LD graph.
  const list = (Array.isArray(schema) ? schema : [schema]).filter(Boolean);
  const serialized = list.length ? JSON.stringify({ "@context": "https://schema.org", "@graph": list }) : null;

  useEffect(() => {
    if (!serialized) return;
    let el = document.getElementById("ld-json") as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = "ld-json";
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = serialized;
    // Unlike Seo.tsx's title/description (rendered by literally every page,
    // so the next page's effect is always guaranteed to overwrite this same
    // node), not every page calls useStructuredData — a list page with no
    // schema of its own would otherwise keep showing whatever the previous
    // detail page left behind. Remove on unmount so navigating to a page
    // with nothing to say leaves nothing behind, instead of stale/wrong data.
    return () => { document.getElementById("ld-json")?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}

/** Repeated identically on EVERY page's graph (not just Home) — the same
 *  `@id` on every page is what lets a crawler recognize it as one entity
 *  referenced site-wide, not a fresh, disconnected Organization per page.
 *  Real, verifiable fields only — no fabricated legal/company data. */
export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl(siteConfig.defaultOgImage),
  };
}

/** Repeated identically on every page's graph, same reasoning as
 *  organizationSchema(). Site-level identity, distinct from the Organization
 *  operating it — linked to it via `publisher`. */
export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": websiteId(),
    name: siteConfig.name,
    url: siteConfig.url,
    publisher: { "@id": organizationId() },
  };
}

/** The generic per-page node linking a page's URL into the site graph —
 *  `isPartOf` the WebSite, `about` whichever entity node (PlaceOfWorship,
 *  Service, the FAQPage itself, ...) the page is actually describing.
 *  `aboutId` is optional: a page can be part of the site without describing
 *  one specific external entity (e.g. Contact). Pandit profiles skip this
 *  node entirely — ProfilePage already fills the same structural role
 *  (schema.org defines ProfilePage as a WebPage subtype), so pairing it with
 *  a second, separate WebPage node for the same URL would be redundant. */
export function webPageSchema({ path, name, aboutId }: { path: string; name: string; aboutId?: string }) {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name,
    isPartOf: { "@id": websiteId() },
    ...(aboutId ? { about: { "@id": aboutId } } : {}),
  };
}

/** Visible + JSON-LD breadcrumbs must always describe the same trail —
 *  callers pass the trail actually rendered on the page, nothing invented. */
export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** A temple is a genuine PlaceOfWorship (a real, addressable, geolocated
 *  entity) — not a generic LocalBusiness fabrication. Every field here is a
 *  real database column; anything unknown (phone, opening hours) is simply
 *  omitted rather than guessed. */
export function placeOfWorshipSchema(temple: {
  name: string; path: string; city: string; state: string;
  addressLine1?: string | null; lat?: number; lng?: number;
  image?: string; rating?: number; reviewCount?: number;
}) {
  const schema: Record<string, unknown> = {
    "@type": "PlaceOfWorship",
    "@id": placeOfWorshipId(temple.path),
    name: temple.name,
    url: absoluteUrl(temple.path),
    address: {
      "@type": "PostalAddress",
      ...(temple.addressLine1 ? { streetAddress: temple.addressLine1 } : {}),
      addressLocality: temple.city,
      addressRegion: temple.state,
      addressCountry: "IN",
    },
  };
  if (temple.lat && temple.lng) {
    schema.geo = { "@type": "GeoCoordinates", latitude: temple.lat, longitude: temple.lng };
  }
  if (temple.image) schema.image = absoluteUrl(temple.image);
  // Only when there are real reviews behind the number — never an
  // aggregate built on a rating with nothing rated yet.
  if (temple.reviewCount && temple.reviewCount > 0 && temple.rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: temple.rating,
      reviewCount: temple.reviewCount,
    };
  }
  return schema;
}

/** A puja/havan offering — Service, not Product (no price is quoted
 *  platform-side; dakshina is negotiated directly with the Pandit). */
export function serviceSchema(service: {
  name: string; path: string; description?: string; image?: string;
}) {
  return {
    "@type": "Service",
    "@id": serviceId(service.path),
    name: service.name,
    url: absoluteUrl(service.path),
    ...(service.description ? { description: service.description } : {}),
    ...(service.image ? { image: absoluteUrl(service.image) } : {}),
    // Referenced by @id, not a re-embedded copy — the full Organization node
    // is already present once in this same page's @graph (every page's
    // graph repeats organizationSchema()), so this just points at it.
    provider: { "@id": organizationId() },
  };
}

/** A Pandit's public profile. Only visible, verifiable fields — never
 *  fabricated credentials/awards (master SEO prompt §24). aggregateRating
 *  only when there is at least one real review behind it. ProfilePage
 *  itself carries `isPartOf` — schema.org defines it as a WebPage subtype,
 *  so a pandit page never also gets a separate generic WebPage node (see
 *  webPageSchema's docstring). */
export function personSchema(pandit: {
  name: string; path: string; city?: string; state?: string; image?: string;
  rating?: number; reviewCount?: number;
}) {
  const schema: Record<string, unknown> = {
    "@type": "ProfilePage",
    "@id": `${absoluteUrl(pandit.path)}#profilepage`,
    url: absoluteUrl(pandit.path),
    isPartOf: { "@id": websiteId() },
    mainEntity: {
      "@type": "Person",
      "@id": personId(pandit.path),
      name: pandit.name,
      ...(pandit.image ? { image: absoluteUrl(pandit.image) } : {}),
      ...(pandit.city ? {
        address: { "@type": "PostalAddress", addressLocality: pandit.city, addressRegion: pandit.state, addressCountry: "IN" },
      } : {}),
      ...(pandit.reviewCount && pandit.reviewCount > 0 && pandit.rating ? {
        aggregateRating: { "@type": "AggregateRating", ratingValue: pandit.rating, reviewCount: pandit.reviewCount },
      } : {}),
    },
  };
  return schema;
}

/** Sourced from the EXACT faqs array a page renders — never a richer/
 *  keyword-loaded version of what the visible accordion shows (master SEO
 *  prompt §10, "structured data must accurately describe visible content").
 *  `path` gives the node a stable @id so a page's WebPage.about can point at
 *  it when the FAQ list IS the page's primary content (e.g. Contact). */
export function faqPageSchema(faqs: { q: string; a: string }[], path?: string) {
  if (!faqs.length) return null;
  return {
    "@type": "FAQPage",
    ...(path ? { "@id": faqPageId(path) } : {}),
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
