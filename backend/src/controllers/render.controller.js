/** Metadata-only server injection for the 4 highest-value dynamic routes
 *  (docs/SEO_ARCHITECTURE.md, Phase 7) — a non-JS crawler or link-preview
 *  bot hitting one of these paths gets the real entity's title/description/
 *  canonical/OG/JSON-LD baked into the SPA shell before any JS runs. A real
 *  visitor's browser still mounts React exactly as before, and Seo.tsx /
 *  useStructuredData overwrite these same tags in place with identical
 *  content once it does.
 *
 *  Fails safe at every step: if the frontend's index.html can't be fetched
 *  at all, respond 502 so nginx's error_page directive can fall back to
 *  serving the static SPA shell directly (docker/nginx/*.conf). Any other
 *  failure (unknown slug, DB error, meta-generation bug) serves the plain,
 *  unmodified index.html — a visitor must never see a broken page because
 *  this feature had a bad day. */

const { getIndexHtml } = require('../services/indexHtmlCache');
const { injectSeo } = require('../utils/htmlInject');
const seoMeta = require('../utils/seoMeta');
const templesRepo = require('../repositories/temples.repository');
const servicesRepo = require('../repositories/services.repository');
const panditsRepo = require('../repositories/pandits.repository');
const { browsingMarketFor } = require('../services/distribution/market');
const { publicSiteUrl } = require('../config/env');

const SITE_NAME = 'PanditSuggest';

// Distinguishes "looked the entity up, it genuinely doesn't exist" from any
// other failure — only the former should produce a real 404 status
// (Phase 12 technical SEO batch: these routes were returning 200 for a
// nonexistent slug, a textbook "soft 404" that search consoles flag and that
// wastes crawl budget). The plain shell is still served either way so a real
// browser's React Router mounts and shows the friendly NotFound page exactly
// as before — only the HTTP status code changes.
const NOT_FOUND = Symbol('render-not-found');

function send(res, html, meta, status = 200) {
  res.status(status);
  if (!meta) return res.type('html').send(html);
  return res.type('html').send(injectSeo(html, meta, publicSiteUrl, SITE_NAME));
}

/** Wraps a per-route handler with the shared fetch-shell / fail-safe logic. */
function withShell(buildMeta) {
  return async (req, res) => {
    let html;
    try {
      html = await getIndexHtml();
    } catch (err) {
      console.error('[render] could not reach frontend for index.html:', err.message);
      return res.status(502).end();
    }

    try {
      const meta = await buildMeta(req);
      if (meta === NOT_FOUND) return send(res, html, null, 404);
      return send(res, html, meta);
    } catch (err) {
      // An unexpected failure (DB error, meta-generation bug) is NOT the same
      // as a confirmed missing entity — keep the existing fail-safe contract
      // of "a visitor must never see a broken page because this feature had
      // a bad day", so this stays 200 with the plain shell.
      console.error('[render] meta generation failed, serving plain shell:', err.message);
      return send(res, html, null);
    }
  };
}

const home = withShell(async () => seoMeta.homeMeta());

const temple = withShell(async (req) => {
  const { market } = browsingMarketFor(req, typeof req.query.country === 'string' ? req.query.country : null);
  const t = await templesRepo.getBySlug(req.params.slug, market);
  return t ? seoMeta.templeMeta(t) : NOT_FOUND;
});

const service = withShell(async (req) => {
  const s = await servicesRepo.getBySlug(req.params.slug);
  return s ? seoMeta.serviceMeta(s) : NOT_FOUND;
});

const pandit = withShell(async (req) => {
  const p = await panditsRepo.getBySlug(req.params.slug);
  return p ? seoMeta.panditMeta(p) : NOT_FOUND;
});

module.exports = { home, temple, service, pandit };
