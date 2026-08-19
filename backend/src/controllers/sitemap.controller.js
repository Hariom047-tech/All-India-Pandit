const repo = require('../repositories/sitemap.repository');
const { publicSiteUrl } = require('../config/env');

/** Static, always-indexable routes — must match the pages that render
 *  <Seo ... /> without `noindex` in frontend/app/src/pages (see
 *  docs/SEO_ARCHITECTURE.md). Auth/search/dashboard/legal-utility pages are
 *  deliberately absent, same as they're noindex there. */
const STATIC_PAGES = [
  { path: '/', priority: '1.0' },
  { path: '/temples', priority: '0.9' },
  { path: '/pandits', priority: '0.9' },
  { path: '/services', priority: '0.9' },
  { path: '/blog', priority: '0.6' },
  { path: '/about', priority: '0.5' },
  { path: '/how-it-works', priority: '0.5' },
  { path: '/contact', priority: '0.5' },
  { path: '/temple-map', priority: '0.5' },
  { path: '/ai-recommender', priority: '0.6' },
  { path: '/privacy', priority: '0.2' },
  { path: '/terms', priority: '0.2' },
];

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

function urlEntry(loc, updatedAt, priority) {
  const lastmod = updatedAt ? `\n    <lastmod>${new Date(updatedAt).toISOString().slice(0, 10)}</lastmod>` : '';
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod}\n    <priority>${priority}</priority>\n  </url>`;
}

/** GET /api/sitemap.xml — proxied to the site root by nginx (see
 *  docker/nginx/*.conf) so it's reachable at the conventional
 *  https://panditsuggest.com/sitemap.xml, matching robots.txt's existing
 *  `Sitemap:` line. Regenerated on every request rather than cached: at the
 *  current scale (a few hundred rows total) the query cost is negligible,
 *  and it means a newly published temple/service/pandit appears immediately
 *  with no cache-invalidation step to wire up. */
async function sitemap(req, res) {
  const { temples, services, pandits } = await repo.listIndexableUrls();

  const entries = [
    ...STATIC_PAGES.map((p) => urlEntry(`${publicSiteUrl}${p.path}`, null, p.priority)),
    ...temples.map((t) => urlEntry(`${publicSiteUrl}/temples/${t.slug}`, t.updated_at, '0.8')),
    ...services.map((s) => urlEntry(`${publicSiteUrl}/services/${s.slug}`, s.updated_at, '0.8')),
    ...pandits.map((p) => urlEntry(`${publicSiteUrl}/pandits/${p.slug}`, p.updated_at, '0.7')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(xml);
}

module.exports = { sitemap };
