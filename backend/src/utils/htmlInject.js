/** Inserts SEO meta/OG/canonical/JSON-LD tags into a raw HTML document,
 *  right before </head> — see render.controller.js. index.html ships no
 *  static title/description of its own (Phase 3), so this is purely
 *  additive: nothing here needs to replace or de-duplicate an existing tag. */

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteUrl(siteUrl, pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** @param {{title, description, canonicalPath, ogImage, structuredData, noindex}} meta */
function injectSeo(html, meta, siteUrl, siteName) {
  const canonicalUrl = absoluteUrl(siteUrl, meta.canonicalPath);
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(canonicalUrl)}">`,
    // Indexability engine (docs/SEO_ARCHITECTURE.md §15) — a thin entity
    // (no real content, no real relationships) is noindexed for a non-JS
    // crawler exactly the same way Seo.tsx noindexes it client-side; still
    // "follow" so an inbound link doesn't dead-end a crawler.
    ...(meta.noindex ? ['<meta name="robots" content="noindex, follow">'] : []),
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(siteName)}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(canonicalUrl)}">`,
    `<meta property="og:image" content="${esc(meta.ogImage)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(meta.ogImage)}">`,
  ];

  if (Array.isArray(meta.structuredData) && meta.structuredData.length) {
    // id="ld-json" matches structuredData.ts's useStructuredData singleton
    // (it queries getElementById("ld-json") before creating a new node) —
    // without this, the client would create a SECOND script tag instead of
    // taking over this one, leaving two competing JSON-LD blocks on the page.
    //
    // Wrapped as {"@context", "@graph"} — not a bare array — to match
    // useStructuredData's own wrapping exactly (docs/SEO_ARCHITECTURE.md §14,
    // entity @id/@graph linking): each node's own "@type" carries no
    // "@context" of its own, and per-node @id references (WebPage.about,
    // WebSite.publisher, Service.provider, ...) resolve within this one
    // document, the same way they do in the client-rendered version.
    //
    // <-escape "<" so a "</script>" substring inside any string value (an
    // entity name, an admin-edited meta_description) can't prematurely
    // close the inline script tag.
    const graph = { '@context': 'https://schema.org', '@graph': meta.structuredData };
    const json = JSON.stringify(graph).replace(/</g, '\\u003c');
    tags.push(`<script id="ld-json" type="application/ld+json">${json}</script>`);
  }

  return html.replace('</head>', `${tags.join('\n')}\n</head>`);
}

module.exports = { injectSeo };
