/**
 * Server-side mirror of frontend/app/src/lib/{Seo.tsx,structuredData.ts}'s
 * per-page title/description/canonical/OG/JSON-LD formulas — same fallback
 * text, same field names, same @id scheme — so a request that gets
 * server-injected metadata (render.controller.js) and one that only gets the
 * client-side version (everything else) never disagree, and so a crawler
 * sees the exact same entity graph either way. Duplicated rather than shared
 * as a package: frontend and backend are separate Node projects with no
 * existing shared-code infrastructure, and building one is a bigger change
 * than this phase warrants (docs/SEO_ARCHITECTURE.md, Phase 7).
 *
 * Deliberately simpler than the client in two places, both documented
 * inline below: no `serviceMeta.ts` static-fallback merge (legacy content
 * for services seeded before the admin CMS existed), and no Hindi
 * display-name switch (a user toggle with no server-side equivalent). A
 * real visitor's browser still gets the richer client-side version in both
 * cases once React mounts — this only affects the brief pre-JS/non-JS-bot
 * window.
 */
const { publicSiteUrl } = require('../config/env');
const { isTempleIndexable, isServiceIndexable, isPanditIndexable } = require('./indexability');

const SITE_NAME = 'PanditSuggest';
const DEFAULT_OG_IMAGE = `${publicSiteUrl}/assets/img/logo-new.png`;

function absoluteUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${publicSiteUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

// Some pandits' stored full_name already includes the "Pandit" honorific
// (16 rows, confirmed via DB query) — prepending it unconditionally produced
// titles like "Pandit Pandit Ramesh Sharma" (Phase 12 technical SEO batch,
// docs/SEO_ARCHITECTURE.md). Mirrors frontend/app/src/lib/normalize.ts's
// withPanditHonorific.
function withPanditHonorific(name) {
  return /^pandit\s/i.test(name) ? name : `Pandit ${name}`;
}

function withSiteName(title) {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

// Stable entity identifiers — must match structuredData.ts's organizationId()/
// websiteId()/placeOfWorshipId()/serviceId()/personId()/faqPageId() exactly,
// so the server-injected graph and the client-rendered graph describe the
// same entities under the same @id, not two disconnected copies.
const organizationId = () => `${publicSiteUrl}/#organization`;
const websiteId = () => `${publicSiteUrl}/#website`;
const placeOfWorshipId = (path) => `${absoluteUrl(path)}#place`;
const serviceEntityId = (path) => `${absoluteUrl(path)}#service`;
const personId = (path) => `${absoluteUrl(path)}#person`;

function organizationSchema() {
  return {
    '@type': 'Organization', '@id': organizationId(),
    name: SITE_NAME, url: publicSiteUrl, logo: DEFAULT_OG_IMAGE,
  };
}

function websiteSchema() {
  return {
    '@type': 'WebSite', '@id': websiteId(),
    name: SITE_NAME, url: publicSiteUrl, publisher: { '@id': organizationId() },
  };
}

/** `aboutId` optional — omitted on pages (like ProfilePage-based pandit
 *  pages) that already fill the WebPage role themselves; see
 *  structuredData.ts's webPageSchema docstring for why. */
function webPageSchema({ path, name, aboutId }) {
  return {
    '@type': 'WebPage', '@id': `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path), name, isPartOf: { '@id': websiteId() },
    ...(aboutId ? { about: { '@id': aboutId } } : {}),
  };
}

function breadcrumbSchema(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
}

function homeMeta() {
  const title = 'PanditSuggest — Connect with Trusted Pandits Across India';
  const description = 'Discover verified Pandits for puja, havan and anushthan at temples, online, or at your home. Browse temples, compare Pandit profiles by city and language, and contact them directly on WhatsApp or call — no middleman, no commission.';
  return {
    title, description, canonicalPath: '/', ogImage: DEFAULT_OG_IMAGE,
    structuredData: [
      organizationSchema(),
      websiteSchema(),
      webPageSchema({ path: '/', name: title, aboutId: organizationId() }),
    ],
  };
}

/** Mirrors TempleDetail.tsx's <Seo>/placeOfWorshipSchema. `temple` is exactly
 *  what temples.repository.js's getBySlug() already returns. */
function templeMeta(temple) {
  const path = `/temples/${temple.slug}`;
  const title = withSiteName(temple.meta_title || `${temple.name} — Puja, Havan & Pandits`);
  const description = temple.meta_description
    || `Explore ${temple.name} in ${temple.city}, ${temple.state}. Discover available puja and havan services, and connect directly with verified Pandits associated with the temple.`;
  const image = temple.img ? absoluteUrl(temple.img) : DEFAULT_OG_IMAGE;

  const place = {
    '@type': 'PlaceOfWorship', '@id': placeOfWorshipId(path),
    name: temple.name, url: absoluteUrl(path),
    address: {
      '@type': 'PostalAddress',
      ...(temple.address_line1 ? { streetAddress: temple.address_line1 } : {}),
      addressLocality: temple.city, addressRegion: temple.state, addressCountry: 'IN',
    },
  };
  // lat/lng/rating arrive as strings from Postgres DECIMAL columns — never
  // put a quoted number into a JSON-LD numeric field.
  if (temple.lat && temple.lng) {
    place.geo = { '@type': 'GeoCoordinates', latitude: Number(temple.lat), longitude: Number(temple.lng) };
  }
  if (image) place.image = image;
  if (temple.reviews > 0 && temple.rating) {
    place.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(temple.rating), reviewCount: temple.reviews };
  }

  return {
    title, description, canonicalPath: path, ogImage: image,
    // Indexability engine (docs/SEO_ARCHITECTURE.md §15) — a bare name+city
    // stub with no description and no real relationships never gets served
    // to search engines, mirrored client-side in lib/indexability.ts.
    noindex: !isTempleIndexable(temple),
    structuredData: [
      organizationSchema(),
      websiteSchema(),
      webPageSchema({ path, name: title, aboutId: placeOfWorshipId(path) }),
      breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Temples', path: '/temples' }, { name: temple.name, path }]),
      place,
    ],
  };
}

/** Mirrors ServiceDetail.tsx's <Seo>/serviceSchema/faqPageSchema. `service`
 *  is exactly what services.repository.js's getBySlug() already returns —
 *  including the universal_faqs merge from Phase 2, so real admin-authored
 *  FAQs are picked up here automatically with no extra query. Note the
 *  repository aliases the description column as `desc` (not `description`)
 *  since `description` collides with a JS reserved-ish convention there. */
function serviceMeta(service) {
  const path = `/services/${service.slug}`;
  const title = withSiteName(service.meta_title || `${service.name} — Puja & Havan Service`);
  const description = service.meta_description || service.short_description
    || `${service.name}: traditional significance, process and samagri, with verified Pandits available to perform it at your temple, online, or at home.`;
  const image = service.image_url ? absoluteUrl(service.image_url) : DEFAULT_OG_IMAGE;

  const structuredData = [
    organizationSchema(),
    websiteSchema(),
    webPageSchema({ path, name: title, aboutId: serviceEntityId(path) }),
    breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }, { name: service.name, path }]),
    {
      '@type': 'Service', '@id': serviceEntityId(path),
      name: service.name, url: absoluteUrl(path),
      ...((service.desc || service.short_description) ? { description: service.desc || service.short_description } : {}),
      ...(image ? { image } : {}),
      // Referenced by @id, not a re-embedded copy — the full Organization
      // node is already present once in this same graph.
      provider: { '@id': organizationId() },
    },
  ];
  if (Array.isArray(service.faqs) && service.faqs.length) {
    structuredData.push({
      '@type': 'FAQPage', '@id': `${absoluteUrl(path)}#faq`,
      mainEntity: service.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }

  return { title, description, canonicalPath: path, ogImage: image, noindex: !isServiceIndexable(service), structuredData };
}

/** Mirrors PanditProfile.tsx's <Seo>/personSchema. `pandit` is exactly what
 *  pandits.repository.js's getBySlug() already returns. Uses the plain
 *  English name — no server-side Hindi-name toggle exists. No separate
 *  webPageSchema node — ProfilePage is itself a WebPage subtype and already
 *  carries isPartOf, matching structuredData.ts's personSchema(). */
function panditMeta(pandit) {
  const path = `/pandits/${pandit.slug}`;
  const name = pandit.name;
  const title = withSiteName(pandit.meta_title || `${withPanditHonorific(name)} — Puja & Havan Services in ${pandit.city}`);
  const description = pandit.meta_description
    || `${name}, a verified Pandit in ${pandit.city}${pandit.state ? `, ${pandit.state}` : ''} with ${pandit.exp} years of experience. Contact directly on WhatsApp or call — no middleman, no commission.`;
  const image = pandit.img ? absoluteUrl(pandit.img) : DEFAULT_OG_IMAGE;

  const person = {
    '@type': 'Person', '@id': personId(path), name,
    ...(image ? { image } : {}),
    ...(pandit.city ? { address: { '@type': 'PostalAddress', addressLocality: pandit.city, addressRegion: pandit.state, addressCountry: 'IN' } } : {}),
  };
  if (pandit.reviews > 0 && pandit.rating) {
    person.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(pandit.rating), reviewCount: pandit.reviews };
  }

  return {
    title, description, canonicalPath: path, ogImage: image,
    noindex: !isPanditIndexable(pandit),
    structuredData: [
      organizationSchema(),
      websiteSchema(),
      breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Pandits', path: '/pandits' }, { name, path }]),
      {
        '@type': 'ProfilePage', '@id': `${absoluteUrl(path)}#profilepage`,
        url: absoluteUrl(path), isPartOf: { '@id': websiteId() }, mainEntity: person,
      },
    ],
  };
}

module.exports = { homeMeta, templeMeta, serviceMeta, panditMeta, absoluteUrl };
