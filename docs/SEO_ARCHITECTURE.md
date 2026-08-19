# SEO Architecture

Status as of this writing: **Phases 1-9 complete**, plus **Phase 11 (Entity @id/@graph Linking)** from a second master prompt covering entity-graph/semantic-SEO work. Phase 10 (final docs polish) and the rest of the Phase 11+ roadmap (indexability engine, homepage/AI-recommender/how-it-works copy, location hub + problem/intent pages) are not yet built — see "Roadmap" at the end.

This document describes what is real today. It intentionally does not describe aspirational features from the original planning prompt that haven't shipped yet.

## 1. Rendering model — this matters more than anything else here

PanditSuggest's frontend (`frontend/app`) is a **100% client-side-rendered (CSR) Vite + React SPA**. There is no SSR, no static prerendering, no build-time HTML generation per route. Every URL — `/`, `/temples/:slug`, `/admin-panel/*`, all of them — resolves to the exact same `dist/index.html`, and nginx's SPA catch-all (`try_files $uri /index.html`) serves that file for any path that isn't a real static asset.

**Consequence:** a crawler or link-preview bot that does not execute JavaScript (WhatsApp's unfurler is the main real-world example) sees a bare `<div id="root"></div>` with no page-specific title, description, or Open Graph tags — only whatever `frontend/app/index.html` ships statically, which today is nothing beyond `charset`/`viewport`/`theme-color`/favicon/fonts (see §3 for why there's no static `<title>`/description either). Googlebot and most modern crawlers *do* execute JavaScript and will see the real per-page metadata described below. This was a known, accepted limitation of Phase 3 through Phase 6; **Phase 7 (§9) closes it for the 4 highest-value dynamic routes** via metadata-only server injection, without touching the CSR model itself.

## 2. Universal FAQ CMS (Phase 2)

One admin-managed FAQ system for the whole site, replacing a bare, admin-inaccessible global `faqs` table.

- **Table:** `universal_faqs` (`backend/src/db/25-universal-faqs.sql`) — `entity_type` (`GLOBAL`/`HOME`/`TEMPLE`/`SERVICE`/`PANDIT`, a `CHECK` constraint, not a native enum, so new entity types are a one-line migration), `entity_id` (polymorphic, no physical FK — same pattern as `reviews.reviewable_type`/`reviewable_id`), `status` (reuses the existing `content_status` enum), `sort_order`, RLS-protected (public `SELECT` only `WHERE status='published'`, admin-only writes).
- **Public API:** `GET /api/faqs?entityType=...&entityId=...` (`backend/src/routes/faqs.routes.js`), defaults to `GLOBAL` — the exact URL and response shape the Contact page already called, so migrating the old bare table into this one required zero frontend changes there.
- **Admin API + UI:** `backend/src/routes/admin/faqs.routes.js` + `frontend/app/src/admin/pages/Faqs.tsx` — full CRUD, publish/unpublish, reorder, an entity picker (searches the existing temple/service/pandit admin list endpoints, no new endpoint needed for that).
- **`services.faqs` JSONB is untouched.** It already had working admin CRUD via the Services edit modal's `ListEditor`. `services.repository.js`'s `getBySlug()` now checks for published `universal_faqs` rows for that service first and, if any exist, they *replace* the JSONB list for display (never both at once) — so a service can be migrated to the richer CMS by an admin simply adding FAQs there, with no data migration step required.

## 3. Site-wide metadata (Phase 3)

### The component: `frontend/app/src/lib/Seo.tsx`

Every public page renders `<Seo title=... description=... path=... />` once, at the top of its JSX. `Seo` is **imperative** (a `useEffect` that finds-or-creates singleton `<title>`/`<meta>`/`<link>` DOM nodes and mutates them), not React 19's declarative document-metadata tag rendering. This was a deliberate, empirically-verified choice, not a default:

- **React 19 does render `<title>`/`<meta>`/`<link>` tags anywhere in a component tree and hoist them into `<head>`** — this is real and documented. What it does **not** do is de-duplicate against a tag that was already sitting in the static HTML before React mounted, or reliably resolve which of two *different* React components' competing tags should win. Both were verified directly in this browser (Playwright against the live Docker build): rendering a page-specific `<title>` next to the static one in `index.html` produced two `<title>` elements in the DOM, and `document.title` kept showing the **static** one (first in document order) — the opposite of what's needed. Trying a "Layout renders a sitewide default, the page renders its own override" split produced the same problem between two React-rendered instances.
- The fix: `frontend/app/index.html` ships **no** static `<title>` or `<meta name="description">` at all (comment there explains why). Every routed page must render exactly one `Seo`. `Seo` mutates the same DOM nodes in place on every render (including on client-side route changes, verified — navigating from `/pandits` to a pandit profile without a full reload correctly updates title/description/canonical with no duplicates), so there is never more than one of each tag, and route transitions can't race.
- **Only one `Seo` per page.** A shared layout must not also render one — see the empirical failure above. `Layout.tsx` deliberately does not.

### What it sets, on every page that renders it
`<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:type`/`site_name`/`title`/`description`/`url`/`image`, `twitter:card`/`title`/`description`/`image`, and optionally `<meta name="robots" content="noindex, follow">`.

### Config: `frontend/app/src/lib/siteConfig.ts`
`siteConfig.url` resolves to `https://panditsuggest.com` in production regardless of environment variables (a `VITE_SITE_URL` override is only honored in non-production builds, so a stray local `.env` value can never leak into a canonical URL shipped to real users).

### Entity pages (temple/service/pandit detail)
`temples`, `services`, and `pandits` already had unused `meta_title`/`meta_description` columns (present since the original schema, never selected by any query). Their repositories' `getBySlug()`-equivalent queries now select them; the three detail pages (`TempleDetail.tsx`, `ServiceDetail.tsx`, `PanditProfile.tsx`) use the admin-set value when present, falling back to a generated title/description from the entity's own name/city/state/description when it isn't (which is every row today — no admin has set these yet). This replaces the old `document.title = ...` one-liners those three pages had.

### noindex pages
`/search` (internal search results — infinite `?q=` variations should never compete with real entity pages for the same query, per standard guidance), `/login`, `/pandit-login`, `/pandit-forgot-password`, `/dashboard` (account-specific), and the 404 page. Everything else defaults to indexable.

### Known gap carried into Phase 5
`frontend/app/public/robots.txt` references `Sitemap: https://panditsuggest.com/sitemap.xml`, and no `sitemap.xml` exists — a request for it falls through the SPA catch-all and returns `index.html` as HTML instead of XML (or a 404). Not fixed in Phase 3; belongs to Phase 5 (Crawl Architecture).

## 4. Structured Data / JSON-LD (Phase 4)

### The mechanism: `frontend/app/src/lib/structuredData.ts`

`useStructuredData(schema)` injects **one** `<script id="ld-json" type="application/ld+json">` per page (an array of schema.org node objects — schema.org allows multiple top-level nodes in one script tag, so combining e.g. BreadcrumbList + PlaceOfWorship never needs two scripts). Same imperative singleton-DOM-mutation approach as `Seo.tsx`, for the same empirically-verified reason (§3).

**Important difference from `Seo.tsx`, found while wiring this in:** `Seo` is called by *every* page, so the next page's effect is always guaranteed to overwrite the previous page's title/description — no cleanup-on-unmount needed there. Structured data is **not** called by every page (a list page like `/temples` has none). Verified directly: navigating from Home (Organization+WebSite) to `/temples` (nothing wired) left Home's JSON-LD sitting there, now describing the wrong URL. Fixed by adding an unmount cleanup that removes the `<script>` tag, so a page with nothing to say leaves nothing behind rather than stale data from wherever the visitor came from. Re-verified after the fix: `/temples` now correctly shows zero `<script type="application/ld+json">` tags.

**Hook-call-order note:** every page's `useStructuredData(...)` call sits *before* that page's `if (loading) return ...` / `if (error || !x) return ...` early returns, passing `null` until the entity has loaded (`x ? [...] : null`). Calling a hook only on the branch that gets past an early return is a Rules-of-Hooks violation (hook count differs between the "still loading" render and the "loaded" render) — this was caught and fixed during implementation on all three entity detail pages before shipping.

### What's wired where
- **Home** (`Home.tsx`): `Organization` + `WebSite` — real fields only (name, url, logo), no fabricated `sameAs`/`contactPoint`.
- **Temple detail** (`TempleDetail.tsx`): `BreadcrumbList` (Home › Temples › name) + `PlaceOfWorship` — a temple is a genuine, addressable, geolocated real-world place (not a generic `LocalBusiness` fabrication), built from real `address_line1`/`city`/`state`/`latitude`/`longitude` columns. `aggregateRating` is included only when `review_count > 0` — never an aggregate built on zero reviews.
- **Service detail** (`ServiceDetail.tsx`): `BreadcrumbList` + `Service` (not `Product` — no price is quoted platform-side) + `FAQPage`, sourced from the **exact same** `faqs` array the visible accordion renders (admin CMS FAQs when present, the legacy static fallback otherwise) — never a richer or different set than what's on the page, per the "structured data must match visible content" rule.
- **Pandit profile** (`PanditProfile.tsx`): `BreadcrumbList` + `ProfilePage`/`Person` — name, image, city/state, and `aggregateRating` only when the pandit has real reviews behind it. No fabricated credentials, awards, or qualifications.
- **Contact** (`Contact.tsx`): `FAQPage` built from the same `useFaqs()` data the visible accordion renders.

Verified live (real Docker build, Playwright): every JSON-LD block parses as valid JSON, exactly one `<script>` tag per page, real database values throughout (a real temple address/geo, a real service description, real FAQ text matching the page), zero fabricated ratings on entities with no reviews, correct `aggregateRating` on ones that do.

## 5. Crawl Architecture (Phase 5)

The Phase 1 audit's concrete finding: `frontend/app/public/robots.txt` already correctly says `Sitemap: https://panditsuggest.com/sitemap.xml`, but nothing served that URL — it fell through nginx's SPA catch-all and returned `index.html` as HTML instead of XML. Fixed end-to-end, not just patched:

- **Backend**: `GET /api/sitemap.xml` (`backend/src/routes/sitemap.routes.js` → `sitemap.controller.js` → `sitemap.repository.js`) generates real sitemap XML on every request — static pages (the same set that's indexable per §3's noindex list) plus every temple/service/pandit that passes the *exact same* visibility gates their public list/detail endpoints already use (`is_active`/`deleted_at`/`u.status='active'`), so nothing appears in the sitemap that a visitor couldn't actually browse to. `<lastmod>` comes from each row's real `updated_at`; static pages carry no `<lastmod>` (nothing tracks when their content last changed, and guessing would violate the "don't mark every URL updated on every deploy" rule). Regenerated per-request rather than cached — at ~1,100 total URLs today the query cost is negligible, and it means a newly published entity appears immediately with no invalidation step to build.
- **nginx** (`docker/nginx/default.conf` and `local.conf`, kept identical): an exact-match `location = /sitemap.xml` proxies the conventional root-path URL to the backend's `/api/sitemap.xml` — everything else stays under `/api/`, this is the one deliberate exception, needed because sitemaps are expected at the domain root by convention (and by the `Sitemap:` line already in robots.txt).
- **`PUBLIC_SITE_URL`** (`backend/src/config/env.js`, new) builds every `<loc>` — defaults to `https://panditsuggest.com`, mirroring the frontend's `siteConfig.ts` fallback, so the two halves of the app can never disagree on the canonical domain.

Verified live: `curl https://.../sitemap.xml` (via the Docker build) now returns `Content-Type: application/xml`, well-formed XML, exactly the expected count (11 static + 15 temples + 32 services + 1,069 active pandits = 1,127 `<url>` entries, cross-checked directly against the database), a real `<lastmod>` on entity entries. Full chain re-verified end to end: `robots.txt`'s `Sitemap:` line → the now-real `sitemap.xml` → a randomly sampled pandit URL from inside it → `200 OK` on the actual page.

## 6. What Phase 5 deliberately did not do

- No sitemap segmentation (`sitemap-temples.xml`, `sitemap-pandits.xml`, etc.) — at ~1,100 URLs total this is far under the 50,000-URL-per-file convention that would call for splitting; revisit if the pandit count grows an order of magnitude.
- No redirect/slug-history handling for renamed entities, no explicit 410 handling for deleted ones — noted as a gap, not built.

## 7. Entity Page Internal Linking (Phase 6)

An audit of every card component (`PanditCard`, `TempleCard`, `ServiceCard`) and the three entity detail pages found real, crawlable `<Link>`-based navigation everywhere *except* two concrete gaps, both fixed:

1. **Tab-gated related content.** `TempleDetail.tsx`'s Pandits/Services tabs and `ServiceDetail.tsx`'s Pandits tab render their content only after a plain `<button onClick>` tab switch — completely absent from the DOM otherwise (not CSS-hidden, literally not rendered, since each tab is `{tab === "x" && (...)}`). A temple or service page's two most valuable outbound links (to the pandits and services actually associated with it) were invisible to anything that doesn't click through the tabs. Fixed by adding a small, always-rendered preview (3 pandit cards, up to 4 service cards) to each page's default Overview tab, each linking to real pandit/service pages, with an "All N →" link into the full tab for anyone who wants more.
   - **This reuses the existing fairness/rotation engine, not a separate ranking.** Per the master brief's explicit constraint (§130, "do not implement a separate SEO Pandit Ranking"), `useFairRanking` was changed from "only fetch when the Pandits tab is open" to "fetch once the page has loaded" (since pandits are now visible by default), and `useReportExposure` now reports exactly whichever pandit set is actually visible at any moment — the Overview preview or the full tab, matching whichever the visitor is actually looking at, so the fairness engine's impression accounting stays correct instead of crediting visibility nobody gave.
2. **A real, previously dead data path.** `ServiceDetail.tsx` already computed a `temples` variable (temples offering that service) but never rendered it — and even if it had been rendered, it would always have been empty: it filtered an *unfiltered* `useTemples({perPage:50})` batch by a `t.services` field that the temples **list** endpoint's row shape doesn't return at all (only the single-temple detail endpoint joins that). Fixed by using the temples list endpoint's own existing `service` filter param (`temples.repository.js`'s `list()` already supported this — just never called with it from here) instead of unreliable client-side filtering, and rendering the result as a real "Temples offering this puja" section.

Also fixed while auditing: `PanditProfile.tsx`'s associated-temples list was building its link text by title-casing the temple's URL slug (`"mahakaleshwar-temple"` → `"Mahakaleshwar Temple"`) even though the detail API call already fetches each temple's real `name` (`pandits.repository.js`'s `getBySlug()` → `associatedTemples`) — that richer data just wasn't being used. Now uses the real name, falling back to the slug-guess only for an id the response doesn't cover.

Verified live: temple/service pages with real linked entities (Mahakaleshwar ↔ Rudrabhishek, Havan-Yagna, etc.) now show real crawlable links to each other without any tab click, confirmed by both DOM inspection (`document.querySelectorAll('a[href^="/pandits/"]')` etc.) and full-page screenshots after a real scroll-into-view (the shared card components use a scroll-triggered fade-in — a plain `fullPage` screenshot without scrolling shows them at `opacity:0`, which is pre-existing site-wide behavior on every list page using these same cards, not something this phase introduced or a real crawlability problem, since the links are present in the DOM regardless of their animation state). Backend suite unaffected (329/331, same pre-existing unrelated failure).

## 8. What Phase 6 deliberately did not do

- No change to the shared `PanditCard`/`TempleCard`/`ServiceCard` components' scroll-triggered fade-in animation — it's an existing, site-wide, pre-Phase-6 characteristic, not something introduced here, and changing it is a design decision out of scope for an SEO pass.
- No new location/city hub pages, no guide/problem-intent pages — those need real content decisions, not a linking-audit fix.
- No SSR/prerendering — the CSR-only limitation in §1 stands until Phase 7 makes an explicit, separately-reviewed call on it. (This also means non-JS-executing crawlers/bots see none of Phase 3-6's work — everything here only reaches visitors and crawlers that execute JavaScript, `sitemap.xml` itself excepted since that's served directly by the backend, not rendered client-side.)
- No `LocalBusiness` schema on pandit profiles (a Pandit is a `Person`, not a business entity) — matches the master brief's explicit warning against that fabrication.
- No changes to pandit ranking/rotation/fairness, subscription tiers, qualified-lead logic, admin auth, or payments — out of scope for every phase per the original SEO brief.

## 9. Rendering: Metadata-Only Server Injection (Phase 7)

### The decision

Three options were weighed for the CSR-only gap in §1:

1. **Full SSR / framework migration** — ruled out per the original SEO brief's explicit instruction not to migrate frameworks (no Next.js).
2. **Bot-detected full-page prerendering** (a headless-browser render service, cached per route) — comprehensive, but real new production infrastructure and ongoing operational cost.
3. **Metadata-only server injection** — an Express endpoint that looks up the real entity via the *existing* repositories and injects the same title/description/canonical/OG/JSON-LD that `Seo.tsx`/`structuredData.ts` already compute client-side, into the raw `index.html`, before any JS runs. No new infrastructure, no framework change, purely additive.

**Option 3 was chosen.** Googlebot itself already executes JS and renders the CSR content correctly — this phase's real audience is link-preview unfurlers (WhatsApp/Twitter/Facebook/Slack, which read `og:*` tags without executing JS) and any secondary crawler that doesn't run JavaScript.

### Scope

The 4 dynamic routes where server-injected data actually differs per request: `/`, `/temples/:slug`, `/services/:slug`, `/pandits/:slug`. List/utility pages (`/temples`, `/about`, `/blog`, etc.) already emit the same static metadata to every visitor via `Seo.tsx` — a non-JS crawler seeing none of that is an unchanged, pre-existing condition, not something this phase needed to touch.

Also fixed in this phase, discovered while scoping it: `robots.txt` didn't `Disallow: /login` or `/search` — both relied solely on a client-JS-set `noindex` meta tag (invisible to a non-JS crawler). Added both.

### How it works

- **`backend/src/utils/seoMeta.js`** — per-entity `{title, description, canonicalPath, ogImage, structuredData}` builders, mirroring — field-for-field, same fallback formulas — `Seo.tsx`/`structuredData.ts`'s client-side generation for Home/Temple/Service/Pandit. Duplicated rather than shared as a package: frontend and backend are separate Node projects with no existing shared-code infrastructure, and building one is a bigger change than this phase warrants. Two deliberate simplifications from the client version, both commented inline: no `serviceMeta.ts` static-fallback merge (legacy pre-CMS content — the DB-backed fields cover every service that matters), and no Hindi display-name switch (a client-only user toggle with no server-side equivalent — crawlers and first-time visitors see the English name anyway, which is also the default).
- **`backend/src/utils/htmlInject.js`** — inserts the meta/OG/canonical tags and a `<script id="ld-json" type="application/ld+json">` block right before `</head>`. The `id="ld-json"` is load-bearing: it's the exact id `structuredData.ts`'s `useStructuredData` singleton already queries for (§4) — using the same id means the client *takes over* the server-rendered node instead of creating a second one once React mounts. (Caught live during verification: without matching ids, every page showed 2 `<script type="application/ld+json">` blocks — one server-injected, one client-created — fixed by aligning the id.)
- **`backend/src/services/indexHtmlCache.js`** — fetches the frontend's live-built shell from `http://frontend:80/__spa-shell__` (internal Docker network) and caches it in memory for 5 minutes. Fetched live rather than baked into the backend image, so the backend can never serve stale references to a previous frontend build's hashed JS/CSS bundle filenames.
- **`backend/src/controllers/render.controller.js` + `routes/render.routes.js`** — `GET /api/_render/`, `/api/_render/temples/:slug`, `/services/:slug`, `/pandits/:slug`, mounted in `routes/index.js`.
- **nginx** (`docker/nginx/default.conf` and `local.conf`, kept identical): `location = /` and `location ~ ^/(temples|services|pandits)/[^/]+$` proxy to the backend's render endpoint; everything else is untouched, still served by the normal SPA catch-all.

### The `/__spa-shell__` path — why the fetch target can't be `/`

`indexHtmlCache.js` needs the *raw*, unmodified `index.html` from the frontend container to inject into. The obvious target is `http://frontend:80/` — but nginx's new `location = /` now proxies **that exact path** to the backend's render endpoint. A backend fetch to `/` would hit nginx, get proxied right back to the backend's own render endpoint, which would try to fetch `/` again — an infinite request loop between the two containers, each attempt timing out at the 2-second fetch limit. This was caught live during verification (the backend logs showed a rapid `GET /api/_render/ -> 502` loop, and it silently burned through the entire 600-req/15min rate limit in under a minute). Fixed by adding a second, dedicated nginx location, `= /__spa-shell__`, that always serves the static file directly (`try_files /index.html`), completely bypassing the render proxy — `indexHtmlCache.js` fetches that path instead. Same content anyone can already get at `/`; marked `noindex` since nothing links to it.

### Fails safe, always

Two independent layers, so a visitor can never see a broken page because this feature had a bad day:

1. **Backend-level**: entity not found, DB error, or a bug in meta generation — every failure short of "can't reach the frontend at all" falls through to serving the plain, unmodified `index.html` with a normal `200`.
2. **nginx-level**: if the backend itself is unreachable (down, timeout, 5xx), `proxy_intercept_errors` + `error_page 500 502 503 504 = @spa_fallback` makes nginx serve the static SPA shell directly, without the backend in the loop at all. Verified live by stopping the backend container entirely: `/` and `/temples/:slug` both still returned `200` with the plain shell, and normal server-injected behavior resumed automatically once the backend came back — no manual recovery step needed.

### Verified live (real Docker + Playwright)

- All 4 route shapes return the correct entity-specific `<title>`/`<meta name="description">`/`<link rel="canonical">`/`og:*`/`twitter:*`/JSON-LD, matching what Phases 3-4 already produce client-side for the same entity (spot-checked: Mahakaleshwar temple, Akhand Ramayan Path service, a seeded pandit profile).
- An unknown slug (`/temples/does-not-exist-xyz`) returns `200` with the plain, unmodified shell — no server tags, client `Seo.tsx` handles it exactly as before this phase existed.
- Real-browser DOM inspection after full page load (`document.querySelectorAll`) confirms exactly **one** `<title>`, one `<meta name="description">`, one `<link rel="canonical">`, one JSON-LD `<script>` on every route — the client-side code overwrites the server-injected node's content in place rather than duplicating it.
- Response-time overhead is small: server-injected routes (~10-45ms, DB lookup + cached-shell fetch) vs. a plain static SPA route (~2-3ms) — not a Phase 8 performance pass, just a sanity check that this doesn't meaningfully slow down every request to these 4 route shapes.
- Backend test suite: 329/331 passing, same 2 pre-existing, unrelated review-auth failures seen in every prior phase — no regressions.

## 10. What Phase 7 deliberately did not do

- No change to list/utility pages (`/temples`, `/services`, `/pandits`, `/about`, `/blog`, `/contact`) — they already serve identical metadata to every visitor via client-side `Seo.tsx`; a non-JS crawler not seeing that is an unchanged condition from every prior phase, not a new gap.
- No bot-detection or full-page prerendering — every request to these 4 route shapes gets the same server-injected metadata, real visitor and crawler alike; the client-side render is identical either way.
- No shared frontend/backend metadata package — `seoMeta.js` duplicates the formulas rather than importing them, a deliberate scope call (see "How it works" above).
- No caching of per-entity meta beyond the 5-minute shell cache — each request still does a real DB lookup via the existing repositories; revisit only if Phase 8's performance pass finds this is actually a hot path worth optimizing.

## 11. Performance (Phase 8)

An audit of the built frontend (`npm run build` output, real measured byte sizes — not estimates) against Core Web Vitals, focused on the public landing pages. Every fix below is mechanical and evidence-based; none touch the rendering architecture (§1) or code-splitting strategy, which are already reasonable (route-level `React.lazy()` everywhere except `Home`, which is deliberately eager since it's the most common entry point).

### Findings and fixes

1. **Header/footer logo: 2.1MB PNG on every single page, no intrinsic size.** `logo-new.png` was 1536×1024px and shipped full-resolution for a 60×60 CSS box (`Header.tsx`, `Footer.tsx`) — the single largest byte-for-byte waste on the site, multiplied across every page view. Resized to 320px wide (still 5×+ the rendered size for retina sharpness) and recompressed: **2,166,443 bytes → 42,850 bytes (98% reduction)**. Added explicit `width`/`height` attributes to the header `<img>` so the browser can reserve its box before CSS loads (CLS).
2. **~2.9MB of orphaned image assets shipping in every deploy.** `hero-pandit.jpg` (958KB), `panchang-bg.jpg` (1.0MB, a leftover from the Panchang/Festivals feature removal earlier in this project), and `how-it-works-bg.jpg` (946KB) were confirmed unreferenced anywhere in `frontend/` or `backend/` (`grep` across both trees, zero matches) and deleted. Not a runtime CWV hit (never fetched), but pure deploy-size waste.
3. **Render-blocking Google Fonts stylesheet.** `index.html` loaded 5 font families / 13 weights via a single blocking `<link rel="stylesheet" href="fonts.googleapis.com/...">`. `&display=swap` was already present (so text was never invisible while fonts loaded), but the stylesheet fetch itself still held up first paint. Switched to the standard non-blocking pattern: `media="print" onload="this.media='all'"` (fetches at low priority without blocking render, then applies once loaded), with a `<noscript>` fallback for JS-disabled clients. `preconnect` hints for `fonts.googleapis.com`/`fonts.gstatic.com` were already correctly in place from an earlier phase — confirmed, not re-added.
4. **Missing `loading="lazy"` on below-the-fold images.** Most card components (`PanditCard`, `TempleCard`, review photo thumbnails in `TempleDetail.tsx`) already had this from earlier phases. Added it to the 4 real gaps found: Home's "Most Booked Services" grid tiles (`Home.tsx`), `ReviewCard.tsx`'s hero photo, and both image spots on the Services list page (`Services.tsx`'s "Most Booked" row and "All Services" grid) — all genuinely below the fold on their pages.
5. **Missing `fetchPriority="high"` on genuine LCP candidates.** The actual largest above-the-fold image differs per page and none of them hinted priority to the browser: the service detail hero image (`ServiceDetail.tsx`), the pandit profile photo (`PanditProfile.tsx`), the temple detail banner's first slide only (`TempleBanner.tsx` — already correctly `loading="eager"` for slide 0 and `lazy` for the rest; added the matching priority hint to slide 0 alone), and the Home hero's currently-centered portrait circle (`HeroAstrotalk.tsx` — the 3 portraits rotate position every 3.5s, so the hint is applied conditionally to whichever one is in the `pos-0` center slot at render time, not to a fixed element).

### Verified live (real Docker build, Playwright)

- Header logo now transfers 42,850 bytes over the wire (confirmed via a live `curl`/Playwright response-body check), renders crisp at its 108×108 visual size (60px × the existing 1.8 CSS `transform: scale`), natural size 320×213 — no blur.
- Font `<link>`'s `media` attribute correctly flips from `print` to `all` after load; computed `font-family` on `<body>` and `<h1>` confirms Poppins/Inter are actually applied, not silently falling back — the non-blocking pattern didn't break font loading.
- `fetchPriority="high"` confirmed present on the temple detail banner's first slide via direct DOM inspection (`img.fetchPriority === "high"`).
- Full-page screenshot of Home shows no visual regression — header, hero portraits, and layout are pixel-equivalent to before.
- Backend test suite: 329/331, same 2 pre-existing unrelated failures — this phase touched no backend code, run purely as a regression check since Phase 7's render endpoint fetches the frontend's shell and needed to be confirmed still working against the rebuilt `index.html` (verified: it correctly picked up the new post-build hashed bundle filenames on the next request, cache TTL working as designed).

### What Phase 8 deliberately did not do

- **No change to JS bundle composition or code-splitting.** The entry chunk (`index-*.js`, ~284KB/86KB gzip) plus its mandatory `modulepreload`s (`jsx-runtime`, a framer-motion chunk used directly by `Home.tsx`) total roughly 410KB gzip before Home's hero data resolves. Splitting `Home` itself, or deferring `framer-motion` for below-fold sections only, are real follow-up options but are structural refactors, not the mechanical fixes this pass targeted — noted for Phase 9/a future pass, not built here.
- **No further compression pass on the rest of `public/assets/img`** (~50MB across the full directory) — this phase fixed the specific items the audit flagged as actually fetched on a hot path (logo, dead assets); a broader sweep of every image in the repo is a separate, larger effort.
- **Left a pre-existing, unrelated 404 as-is**: `normalize.ts`'s pandit-with-no-photo fallback path (`/assets/img/pandits/default.jpg`) points at a file that was never actually added to `public/`. Found while verifying this phase (a stray console error on Home), confirmed pre-existing (not introduced by any Phase 8 change, and not a CWV/performance issue — a single small 404 for a fallback image), and left alone as out of scope for a performance pass. Worth a follow-up ticket.
- **No Lighthouse/CI-integrated CWV scoring** — this was a manual, evidence-based audit + fix pass, not automated regression tooling; that belongs to Phase 9 (Automated Validation) if the team wants it enforced going forward.

## 12. Automated Validation (Phase 9)

Backend test coverage for everything Phases 5-7 built, following the existing `node --test` conventions (real Express app via `require('../src/app')`, real seeded DB, the shared `tests/helpers.js` fixtures — `kashi-vishwanath`/`rudrabhishek`/`ramesh-sharma`, the same fixtures `api.test.js` already relies on). No frontend test runner exists in this project, so structured-data/metadata correctness is validated at the one place both the client and server formulas provably agree: `seoMeta.js`, the server-side mirror.

### New test files

- **`backend/tests/seo-meta.test.js`** — pure unit tests for `seoMeta.js`'s 4 builders, no DB. Locks down: admin `meta_title`/`meta_description` overriding the generated fallback (and the fallback firing when they're unset); `lat`/`lng` arriving as Postgres `DECIMAL` strings correctly becoming JSON-LD numbers (`typeof === 'number'`, not `'25.31'`); `aggregateRating` appearing only when `reviews > 0` and never fabricated at `reviews = 0`; `Service` schema reading the repository's actual `desc` field name (a regression test for the exact field-name bug caught live during Phase 7 — see §9's implementation notes); `FAQPage` appearing only with real FAQs; `Person`-only fields on pandit profiles (no fabricated credentials/LocalBusiness).
- **`backend/tests/html-inject.test.js`** — pure unit tests for `htmlInject.js`, no DB. Locks down the two things Phase 7's live verification caught as real bugs: the injected JSON-LD script's `id="ld-json"` (must match what `structuredData.ts`'s client singleton queries for, or the client creates a second competing tag once React mounts), and the `</script>`-breakout escape (a `</script>` substring inside any structured-data string value must not be able to end the script tag early — asserts the raw unescaped sequence never appears in the output, and that the escaped JSON still round-trips to the original string).
- **`backend/tests/render.test.js`** — integration tests against the real Express app's `/api/_render/*` endpoints. A tiny local HTTP stub server stands in for the real frontend container (unreachable from a plain `npm test` run outside Docker), via `FRONTEND_INTERNAL_URL`. Covers all 4 route shapes returning real DB-backed metadata, an unknown slug falling through to the byte-identical plain shell with `200` (never a 404 or partial page), and exactly one title/canonical/JSON-LD tag per response.
- **`backend/tests/render-fallback.test.js`** — the other fail-safe path: frontend completely unreachable (`FRONTEND_INTERNAL_URL` pointed at a closed port) must surface as a `502` so nginx's `error_page` fallback can take over. This is the regression test for the actual infinite-proxy-loop bug caught live during Phase 7 implementation before this test existed (docs §9). Deliberately built around a minimal Express app wrapping just `render.controller.js`'s `home` handler, not the full app — keeps it fast and avoids re-requiring the whole app tree with a different env mid-suite.
- **`backend/tests/sitemap.test.js`** — integration tests against `/api/sitemap.xml`. Well-formedness (matched `<url>`/`</url>` counts), presence of static indexable pages, absence of noindex-only utility pages (`/login`, `/search`, `/dashboard` — must track the noindex list in `Seo.tsx`), real seeded entities each with a `<lastmod>`, static pages carrying no `<lastmod>` (nothing tracks when their content changed, so none is guessed), and — inserting a real `is_active = FALSE` temple fixture — confirmation that the sitemap's visibility gate actually excludes it, the same way the public API would.
- **`tests/helpers.js`** gained one small addition: `requestRaw()`, alongside the existing JSON-only `request()` — needed because `/api/sitemap.xml` and `/api/_render/*` return XML/HTML, not JSON, and the existing helper's `JSON.parse` would throw on them.

### Verified

All new tests run clean against the real Docker-seeded DB: 43 new tests, all passing. Full suite: 372/374, same 2 pre-existing, unrelated review-auth-test failures noted in every phase of this project — confirmed by name, not just by count, that nothing new broke.

### What Phase 9 deliberately did not do

- **No frontend test runner introduced.** `frontend/app` has no existing unit-test infrastructure (no Vitest/Jest configured) — adding one just to test `Seo.tsx`/`structuredData.ts` directly would be a much larger, separate decision than this phase's charter. Their correctness is validated indirectly: `seoMeta.js`'s tests assert the server-side mirror produces the exact formulas documented as matching the client (§9), and Phase 7's own live-verification process (still the authoritative check for actual client/server tag deduplication) is documented in §9 rather than re-automated here.
- **No Lighthouse/CI-integrated Core Web Vitals budget enforcement** — Phase 8 was a manual audit-and-fix pass; wiring an automated budget into CI is a separate infrastructure decision, not built here.
- **No test for the FAQ CMS admin UI** (`Faqs.tsx`) — no frontend test runner, per above; the underlying repository/controller CRUD already has real usage coverage via the live verification performed in Phase 2.

## 13. Entity @id/@graph Linking (Phase 11)

A second master prompt (165 parts) requested a full "entity graph" architecture — schemas that reference each other by stable `@id`, matching how mainstream SEO tooling (Yoast, RankMath) structures multi-entity pages, so a crawler recognizes "the Organization referenced on this temple page is the same Organization referenced on that service page," not four disconnected objects that happen to share a name.

An audit against the already-shipped Phases 1-9 found most of the prompt's asks already done (structured data, FAQ CMS, sitemap, robots.txt, internal linking, nav consistency, no LocalBusiness/SearchAction/keyword-stuffing) or requiring product/content decisions outside a single engineering pass (homepage/About/AI-recommender copy depth, location hub pages — no locations table exists today, city/state are free-text columns — and problem/intent pages, which the prompt itself repeatedly warns against mass-generating). The user selected 4 tracks to pursue; this section covers the first and lowest-risk: the `@id`/`@graph` restructuring itself, pure technical work with no new content.

### What changed

- **`frontend/app/src/lib/structuredData.ts`**: every schema builder (`organizationSchema`, `websiteSchema`, `placeOfWorshipSchema`, `serviceSchema`, `personSchema`, `faqPageSchema`) dropped its individual `@context` and gained a stable `@id`. New `webPageSchema({path, name, aboutId})` builder — the generic per-page node schema.org expects (`WebPage.isPartOf` the `WebSite`, `WebPage.about` the entity the page actually describes). `useStructuredData` now always wraps its nodes as one `{"@context": "https://schema.org", "@graph": [...]}` document instead of a bare array, so per-node `@id` references resolve within the same JSON-LD document a crawler parses.
- **`backend/src/utils/seoMeta.js`**: mirrored field-for-field, same `@id` scheme (`{siteUrl}/#organization`, `{siteUrl}/#website`, `{absoluteUrl(path)}#place`/`#service`/`#person`), so the server-injected graph (Phase 7) and the client-rendered graph describe literally the same entities, not two independently-shaped copies.
- **`backend/src/utils/htmlInject.js`**: updated to wrap `structuredData` in the same `{"@context","@graph"}` envelope before injecting, matching the client format exactly.
- **Every page's graph now repeats `Organization` + `WebSite`**, not just Home — this is what makes the `@id` linking meaningful (the same `@id` recurring site-wide is the actual signal), matching the pattern in Parts 5-6 of the prompt and how mainstream SEO plugins structure this.
- **Per-page linking**: Home's `WebPage.about` → `#organization`. Temple/Service pages get `Organization` + `WebSite` + `WebPage` (`about` → the `PlaceOfWorship`/`Service` node) + `BreadcrumbList` + the entity itself; `Service.provider` now references `{"@id": "#organization"}` instead of re-embedding a full duplicate Organization object. Pandit pages get `Organization` + `WebSite` + `BreadcrumbList` + `ProfilePage` (with its own `@id`, `isPartOf` the website, `mainEntity` → a `Person` with its own `@id`) — deliberately **no** separate generic `WebPage` node, since schema.org defines `ProfilePage` as a `WebPage` subtype already; adding both would describe the same URL twice. Contact gets the same `WebPage`+`FAQPage` pattern, with `WebPage.about` pointing at the `FAQPage`'s own `@id` since the FAQ list is that page's actual primary content.

### Verified live (real Docker + Playwright)

- Raw JSON-LD on all 4 server-rendered routes plus Contact confirmed well-formed, with the exact expected `@id` cross-references (`WebSite.publisher` → Organization, `WebPage.isPartOf` → WebSite, `WebPage.about`/`Service.provider` → the right entity `@id`).
- Client-side takeover re-verified after the restructuring: exactly one `<title>`/description/canonical/`ld-json` script per page across all 4 dynamic routes — no duplicates introduced by the format change.
- Parsed the client-rendered (post-React-mount) JSON-LD on all 5 structured-data-emitting pages directly in a real browser and confirmed the graph shape, node types, and `@id` values match what the server injects.
- Backend suite: 375/377 (up from 372/374 — 3 new `@id`/`@graph` assertions added to the existing Phase 9 test files), same 2 pre-existing unrelated failures.

### What the @id/@graph track deliberately did not do

- **No `Article`/author/review-workflow schema** — no editorial/guide content type exists on the platform yet to attach it to.
- **No hreflang/multilingual entity IDs** — no Hindi-language page variants exist yet; the prompt itself says not to build this until real localized content does.

## 14. Indexability Engine (Phase 11, second track)

Master SEO prompt Parts 44-45: "Do not index incomplete entities merely because they exist... create a deterministic rule based on actual entity type," returning `index,follow` or `noindex,follow`. Before this, `noindex` only ever applied to hardcoded utility routes (login/search/dashboard/etc, §3) — a temple, service, or pandit page was always indexable purely because the row existed, regardless of whether it had any real content.

### The rule (deliberately a low bar, not a quality score)

- **Temple**: indexable if it has a real description (`description`/`about`, ≥40 characters) **or** at least one real relationship — an associated pandit or a linked catalogue service. Not indexable only for a bare name+city stub, Part 44's own example.
- **Service**: indexable if it has a real description (`desc`/`short_description`) **or** at least one pandit actually offering it (`pandit_count > 0`).
- **Pandit**: indexable only if **verified** (`verification_status === 'verified'`) **and** has either a real bio or at least one linked service/temple — verification status alone isn't enough; an empty-bio, no-relationships profile is still thin even if verified.

### Implementation

- **`frontend/app/src/lib/indexability.ts`** (new) — `isTempleIndexable`/`isServiceIndexable`/`isPanditIndexable`, operating on the already-normalized `Temple`/`Service`/`Pandit` shapes (`lib/normalize.ts`) every detail page already has in scope. Wired into `TempleDetail.tsx`/`ServiceDetail.tsx`/`PanditProfile.tsx`'s existing `<Seo noindex={...}>` prop.
- **`backend/src/utils/indexability.js`** (new) — the same three functions, same thresholds, mirrored against the *raw* repository return shapes (`temples`/`services`/`pandits`.repository.js's `getBySlug()`) since the backend has no access to the frontend's normalization layer.
- **`backend/src/utils/seoMeta.js`** — each of `templeMeta`/`serviceMeta`/`panditMeta` now calls its matching `isXIndexable()` and sets `noindex` on the returned meta object.
- **`backend/src/utils/htmlInject.js`** — emits `<meta name="robots" content="noindex, follow">` when `meta.noindex` is true, in the exact same format `Seo.tsx` already uses client-side — so a non-JS crawler and a real browser reach the identical indexing decision for the same entity.

### Verified

- 18 new pure unit tests (`backend/tests/indexability.test.js`) covering every branch of all three rules, including the "verified but still thin" pandit case.
- 2 new integration tests in `render.test.js`: confirmed a real, content-rich seeded temple (`kashi-vishwanath`) is never noindexed, and — inserting a real bare name+city temple fixture into the DB — confirmed the live server-rendered page for it *is* correctly noindexed end to end.
- Live-checked against the running stack: `mahakaleshwar`, `rudrabhishek`, and `ramesh-sharma` (all real, content-rich seeded entities) correctly carry no robots tag at all.
- Backend suite: 395/397 (375/377 + 20 new tests), same 2 pre-existing unrelated failures.

## 15. Homepage / AI Recommender / How It Works Copy (Phase 11, third track)

Master SEO prompt Part 11: the homepage must explain what the platform is in visible HTML, not just hero + cards + animations. Part 33: the AI Recommender page needs a real explanation, not a bare chat box. Part 61: a "how it works" page, if built, should explain Discover → Understand → Compare → Contact.

All copy was drafted and shown to the user for review before any code was written, and approved as-is.

### What changed

- **Home** (`Home.tsx`): new "What is PanditSuggest" section between the hero and the services grid — a plain-language explanation of the platform (directory, not booking agent; verified profiles; direct contact; no commission), followed by 4 destination cards (Find Pandits / Explore Temples / Puja & Havan Services / AI Recommender) using the site's existing card/grid styling, plus a "See how it works →" link into the new page below.
- **AI Recommender** (`AiRecommender.tsx`): new "How the AI Recommender works" + "Example questions people ask" + FAQ section, rendered in the page's initial (pre-conversation) DOM — so it's present for both a first-time visitor and a non-JS crawler, not hidden behind a chat interaction. Example questions reuse the platform's own real quick-prompt phrases (`QUICK_PROMPTS`) rather than inventing separate ones, keeping the visible copy honest about actual capability (Part 125). The 3 FAQ entries are defined once (`AI_FAQS`) and used for both the visible accordion-style text and a new `FAQPage` JSON-LD block, so the two can never drift apart — the same "structured data must match visible content" rule used everywhere else in this project.
- **New page — `/how-it-works`** (`HowItWorks.tsx`): a dedicated 4-step explanation (Discover → Compare → Contact directly → Arrange it together), reusing the same step-card pattern already established on the About page's verification section. Linked from the Home page's new section, the site footer (`footer.howItWorks`, added to both `dictionary.en.ts` and `dictionary.hi.ts`), and carries its own `Seo`/`@id`-linked structured data (`Organization`+`WebSite`+`WebPage`+`BreadcrumbList`). Added to `backend/src/controllers/sitemap.controller.js`'s `STATIC_PAGES` list.

### Verified live (real Docker + Playwright)

- All three pages load with zero console/page errors.
- Home: the new section's text and all 4 destination card links (`/pandits`, `/temples`, `/services`, `/ai-recommender`) confirmed present in the DOM; the "How it works" cross-link confirmed present.
- AI Recommender: "How it works", "Example questions", and "Frequently asked questions" headings all confirmed present in the pre-conversation DOM; the page's JSON-LD graph confirmed to include `Organization`, `WebSite`, `WebPage`, and `FAQPage` nodes.
- How It Works: reachable at `200`, correct `<title>`/`<h1>`, all 4 step cards render.
- `/how-it-works` confirmed present in `/sitemap.xml`.
- Backend suite: 395/397, same 2 pre-existing unrelated failures — this track touched no application logic beyond the one-line sitemap addition (already covered by the existing sitemap test suite).

### Follow-up: destination cards, 2-up on mobile

The 4 destination cards under "What is PanditSuggest" originally collapsed to 1-per-row on mobile via the sitewide `.g-2, .g-3, .g-4 { grid-template-columns: 1fr }` rule (`base.css`). Changed to 2-per-row on mobile only, matching the identical fix already applied to the Related Services grid in Phase 6 — a compound selector (`.hp-whatis-grid.g-4`) inside the existing `@media (max-width: 620px)` block, high enough specificity to beat the shared collapse rule regardless of source order, desktop/tablet completely untouched. The per-card title/description font-sizes, previously inline styles in the JSX (which would have out-specificity'd any CSS-only override), were moved into two small classes (`.hp-whatis-card__title`/`__desc`) so the mobile-only size reduction could be expressed as a normal, non-`!important` CSS override — consistent with how every other responsive fix in this codebase works. Verified live at a real 375px viewport (Playwright bounding-box check: cards 1+2 and 3+4 confirmed sharing a row) and confirmed the 1280px desktop layout is pixel-identical to before.

### Follow-up: How It Works step cards, 2-up on mobile

Same fix, same reasoning, applied to `HowItWorks.tsx`'s 4 step cards (`.hiw-steps-grid.g-4` compound selector inside the existing mobile breakpoint). Unlike the homepage cards, `.step`/`.step-n`/`.step-ico`/`h3`/`p` here had no inline styles to begin with, so the mobile override only needed ordinary descendant-selector overrides (`.hiw-steps-grid .step-ico`, etc.) — no class refactor required. Verified live at 375px (cards 1+2 and 3+4 confirmed sharing a row) and 1280px (unchanged 4-in-a-row).

### Follow-up: About page — stats and verification-steps cards, 2-up on mobile

Same fix pattern extended to `About.tsx`'s two card grids: the 4 stat cards (`.about-stats-grid.g-4`) and the 5 verification-step cards (`.about-verify-grid.g-3`). The other two grids on the page — the mission "What we do"/"What we never do" list cards and the "how we pay the bills" `pg-item` grid — were deliberately left as single-column on mobile: both hold full-sentence text content that would cramp badly at half-width, unlike the short icon+number+label or icon+heading+short-caption content in the two grids that were changed. The comparison table already had working horizontal-scroll handling (`.table-wrap { overflow-x: auto }`) and needed no change.

Verified live at 375px (both grids confirmed 2-up via DOM position checks) and 1280px (both grids confirmed pixel-identical to their original desktop layout — including the verify grid's natural 3-then-2 wrap on its 3-column desktop grid, unaffected by the mobile-only override).

### Follow-up: Service Detail's "Pandits who perform this puja" — 2-up, unboxed, real link

Found and used the site's actual established mobile-2-up utility for pandit/temple/service cards — `.grid-2up-mobile` (`enhance.css`), already applied on `ServiceDetail.tsx`'s own Pandits tab, `PanditProfile.tsx`, `Pandits.tsx`, and `TempleDetail.tsx` — instead of inventing another one-off page-specific class. Three changes to the Overview tab's inline pandit preview (`ServiceDetail.tsx`):

1. **2-up on mobile**: added `grid-2up-mobile` to the preview grid, matching every other pandit-card grid on the site (desktop/tablet columns unchanged).
2. **Dropped the `sd-card` box wrapper**: the section now sits as a plain heading + grid, matching the unboxed presentation the "Related services" section below it already uses (`sd-card__title`'s own styling is a standalone class, unaffected by removing the parent box class).
3. **"See All" is now a real link, not a same-page tab switch**: was `onClick={() => setActiveTab("pandits")}`; now `<Link to={`/pandits?service=${s.id}`}>`, matching how the Pandits tab's own "See all N pandits" link already works — a real, bookmarkable, shareable URL instead of a client-only tab toggle.

That destination (`/pandits?service=X`) was already correctly filtering (`Pandits.tsx` reads `?service=` and applies it), but its heading stayed the generic "India's most trusted..." regardless — so the filtered page still read as the plain, unfiltered directory. Added a conditional H1: when the URL resolves to a real service, it now reads "Pandits who perform {Service Name}" instead. Canonical/meta tags were deliberately left untouched (still pointing at the unfiltered `/pandits`) — changing those per query-param combination would create indexable duplicate-content variants, which the master SEO prompt explicitly warns against (Parts 128-129); this is a visible-heading clarity fix only, not a new indexable page.

Verified live: mobile grid confirmed 2-up (167px-wide cards sharing a row) with the box styling gone; desktop grid confirmed unaffected; clicking "See All" navigates to `/pandits?service=rudrabhishek` and the destination correctly shows "Pandits who perform Rudrabhishek" as its heading.

### Follow-up: a real dedicated page for "all Pandits who perform this service" — not a query filter

The previous follow-up linked "See All" to `/pandits?service=X` — a real, working filter on the existing directory page, but still the *general* Pandits directory (hero, search bar, sidebar filters) with a param applied. The user explicitly asked for a genuinely separate, dedicated page instead — and on reflection this is also the more correct pattern per the master SEO prompt itself: **Part 129 explicitly recommends a curated page ("Pandits in Ujjain") over a query-param variation of the main directory ("/pandits?city=ujjain")** for exactly this kind of scoped listing. The previous fix had this backwards.

**New page**: `frontend/app/src/pages/ServicePandits.tsx`, mounted at `/services/:id/pandits`. No directory chrome (no hero, no search, no filter sidebar) — just a breadcrumb, an H1 ("Pandits who perform {Service Name}"), a real count, every matching Pandit (not capped at 6), paginated 24-per-page with the existing `Pager` component, and `.grid-2up-mobile` for the same 2-up-on-mobile / normal-columns-on-desktop treatment used everywhere else. Runs through the same fair-rotation engine as every other pandit listing (`useFairRanking`/`useReportExposure`, never a separate order for this page), and carries its own `Seo` + `@id`-linked structured data (`Organization`+`WebSite`+`WebPage`+`BreadcrumbList`), consistent with every other page built in this initiative.

Both existing "See All" links on `ServiceDetail.tsx` (the Overview tab's inline preview, and the Pandits tab's own "See all N pandits") now point to `/services/{slug}/pandits` instead of the query-filtered directory.

**Scoping note**: this new route is not (yet) one of Phase 7's server-injected routes — it gets the same client-side `Seo`/structured-data treatment every page had before Phase 7 existed, which is sufficient for JS-executing crawlers (the large majority) but not for the non-JS-crawler/link-preview case Phase 7 specifically targeted. Extending server-injection to this route is a reasonable future addition, not built in this pass.

Verified live: the Overview preview's link now resolves to `/services/rudrabhishek/pandits`; the Pandits tab's own link (tested against `satyanarayan-akhand`, ~155 pandits) resolves to `/services/satyanarayan-akhand/pandits` and actually renders a real paginated listing (24 cards/page, 7 page buttons, 2-up on a 375px viewport, standard 3-column grid on desktop) with zero console errors.

### Follow-up: pagination, single row on mobile

The `Pager` component (used by the Pandits directory and the new `ServicePandits` page) was wrapping to two rows on mobile — 8 elements (prev, 4 numbers, ellipsis, last, next) at 42px each don't fit a 375px screen. Found and fixed a real bug while doing it: the first attempt at this fix silently had no effect, because it was added to a `@media (max-width: 620px)` block positioned *before* the base (unconditional) `.pager` rule later in the same file — with equal selector specificity, the later, unconditional rule always won regardless of viewport, since CSS resolves ties by source order, not by which one sits inside a media query. Moved the override into the correct later mobile block; verified fixed at both 375px and 320px viewports (all pager elements confirmed sharing one row), with `overflow-x: auto` as a safety net for any page count that still wouldn't fit. Because `.pager` is one shared global class, this single fix applies everywhere the component is used.

### Follow-up: pandit preview shows 6 (3 rows of 2), temples section unboxed + 2-up too

Two more of `ServiceDetail.tsx`'s Overview-tab preview sections got the same treatment already applied to the Pandits preview earlier: `previewPandits` increased from 3 to 6 (three rows of 2 on mobile, two rows of 3 on desktop's `g-3` grid — no change needed there since 6 divides evenly into 3 columns too), and "Temples offering this puja" had its `sd-card` box wrapper dropped and `grid-2up-mobile` added, matching the exact same fix already validated on the Pandits preview and the dedicated `ServicePandits` page. Verified live: pandit preview renders 6 real cards in 2-up rows; temples section renders unboxed with the 2-up grid class correctly applied (only 1 real temple currently offers this particular seeded service, so the 2-up wrap itself isn't visually demonstrable for this specific page, but the same class already proven correct elsewhere applies identically).

### Follow-up: FAQs added to the homepage

After this track shipped, the user asked for the platform's FAQs (the same 8 published `universal_faqs` GLOBAL entries already shown on `/contact`) to also appear on the homepage — positioned after the testimonials/reviews section and before the footer. Added as `Home.tsx`'s last section, reusing the exact same accordion pattern (`FaqItem`, `.acc-item`/`.acc-q`/`.acc-a`) as `Contact.tsx`, fetched via the same `useFaqs()` hook, and wired into the page's existing `useStructuredData` call as an additional `FAQPage` node (`faqPageSchema(displayFaqs, "/")`) — so the homepage's JSON-LD graph now includes `Organization`+`WebSite`+`WebPage`+`FAQPage`. Verified live: all 8 FAQs render, confirmed positioned after the reviews section and before the footer via DOM order inspection (not just visually), and the `FAQPage` node confirmed present in the parsed graph.

### What this track deliberately did not do

- **No i18n translation of the new prose paragraphs** — only the Footer's new "How It Works" nav label was added to both language dictionaries (matching how every other footer link works); the longer explanatory paragraphs on Home/AI Recommender/How It Works follow the same plain-hardcoded-English convention already established by `About.tsx`, which has no i18n wiring at all.
- **No changes to the main header nav** — "How It Works" is a secondary destination per the master prompt's own priority list (Part 14), so it was added to the footer and contextual homepage link only, not the primary header nav, to avoid diluting the primary destinations' signal (Part 52).

## 17. Performance Hardening (Phase 12 — in progress)

A second, much larger master prompt (118 sections) requested a full mobile-performance and technical-SEO audit, citing a real production PageSpeed baseline: **Mobile Performance 34** (FCP 7.1s, LCP 14.6s, TBT 940ms, Speed Index 9.0s, CLS 0.074 — already healthy) vs. **Desktop 77** (FCP/LCP 1.7s). The prompt's own process is explicit: measure with real tooling first, identify root cause with evidence, fix in small batches, rebuild, retest, compare — never assume, never do 20 changes at once, never claim completion without evidence.

### Measurement approach

The `lighthouse` CLI wasn't reliably installable in this sandbox (network timeout fetching the package). Built a custom lab-measurement harness instead (`Playwright` + Chrome DevTools Protocol): CDP-level CPU throttling (4x, matching Lighthouse's mobile preset) and network throttling (Slow 4G), with the browser's own `PerformanceObserver` APIs for FCP/LCP/CLS/long-tasks — the same underlying data Lighthouse itself reads, against the real production-mode Docker stack (frontend+nginx+backend+db), matching this phase's own §98-99 requirement to test a production build, not the dev server.

### Baseline finding: LCP element identified

Cold-cache mobile run on `/`: **the LCP element is the hero H1 text** ("India's most trusted pandit connection platform"), not the rotating pandit portrait images Phase 8 had assumed. FCP and LCP were nearly identical (~5.4s / ~6.0s) — meaning the dominant problem was time-to-any-paint itself, not a slow-loading image after paint.

### Root cause identified: framer-motion in the eager/critical bundle

The H1 (and the badge/checklist/CTA around it) were wrapped in framer-motion `initial={{opacity:0}}` entrance animations — invisible until React mounted **and** framer-motion's JS initialized **and** the transition resolved. But removing just that animation didn't move FCP/LCP at all, which led to the real finding: **framer-motion itself was being eagerly bundled** into the entry chunk, because it was reachable from Home's own eager import graph in more places than expected — not just the obvious ones.

### What was fixed (traced and removed one dependency at a time, verifying after each)

Every fix replaced a framer-motion `AnimatePresence`/`motion.*` usage with either a plain element (no animation, for content that shouldn't have been gated on JS at all) or a CSS-only transition (for genuinely decorative effects) — several of which turned out to be **entirely redundant** with CSS transitions the codebase already had sitting unused underneath the JS wrapper:

1. **`HeroAstrotalk.tsx`** — the four above-the-fold entrance fades (badge/H1/checklist/CTA) became plain elements; the portrait carousel's position rotation became a CSS `transition` on `top`/`left`/`margin`/`width`/`height` (framer-motion's `layout` prop was interpolating properties that are directly CSS-transitionable).
2. **`Header.tsx`** (wraps every route) — the language-switcher dropdown and mobile nav drawer/scrim were using `AnimatePresence` **on top of** CSS transitions (`.drawer.is-open`, `.scrim.is-open`) that already existed and already worked; framer-motion was pure redundant overhead. Removed entirely; added the missing equivalent CSS for the dropdown.
3. **`Toast.tsx`** (wraps every route via `ToastProvider`) — enter animation already had a CSS `fadeUp` keyframe running independently; only the exit needed a small new `.toast--leaving` CSS transition, using a timer-based state machine instead of `AnimatePresence`.
4. **`Home.tsx`** — 3 remaining below-the-fold `whileInView` reveals converted to a local `InViewFade` component (plain `IntersectionObserver` + CSS), deliberately **not** touching the shared `components/ui/Reveal.tsx` used sitewide (About.tsx etc.) — that component's own code comments show it deliberately replaced an IntersectionObserver approach with framer-motion at some point in the project's history; reverting it is a bigger, sitewide-blast-radius decision flagged as a follow-up, not made unilaterally here.
5. **`PanditCard.tsx` / `TempleCard.tsx`** (rendered directly on Home, and everywhere pandits/temples are listed sitewide) — same entrance-reveal pattern, extracted into one shared `lib/useInViewOnce.ts` hook + `.card-reveal` CSS class rather than duplicating the observer logic three times. `TempleCard`'s `whileHover` was also redundant — `.card--hover:hover` already existed in CSS.
6. **`CountUp.tsx`** (the hero's stat numbers) — replaced framer-motion's `useInView` + `motion.span` with the same shared hook.
7. **`Modal.tsx`** (used by `EnquiryModal` — which wraps every route — plus 6 other admin/review call sites) — kept the existing conditional-mount behavior deliberately (7+ different callers' `children` may have their own effects; always-mounting them was a behavior change this pass couldn't fully audit), added a mount-then-flip-visible CSS transition for the open animation. Traded away the exit fade (closes instantly now) in exchange for removing framer-motion from every route's dependency graph.
8. **`Lightbox.tsx`** (used by `ReviewCard`, rendered directly on Home for testimonials, plus temple/service galleries) — same pattern as Modal; the image-to-image crossfade when navigating within an open lightbox was simplified to a plain swap.

### Verified

- **Bundle**: the entry chunk's framer-motion dependency is completely gone — confirmed by grepping the built output for framer-motion's internal identifiers (`framerAppearId`, etc.) before and after, and by checking `dist/index.html`'s `modulepreload` list. Entry chunk: **411.85KB → 286.66KB** (a real ~125KB reduction, exactly matching framer-motion's own chunk size, which still exists separately for the lazy routes — About, TempleDetail, ServiceDetail, Dashboard, Search, Blog — that legitimately still use it).
- **Functional regression**: every touched component was interaction-tested live (not just visually screenshotted) — mobile drawer opens/closes and navigates correctly with body-scroll-lock intact; language switcher opens, switches language, and closes; toast notifications appear, auto-dismiss, and are removed from the DOM; the enquiry modal opens (via a real "Connect with Pandit" flow) and closes; the photo lightbox opens (via the actual gallery-grid button, not the banner slider) and closes. Zero console errors beyond the one pre-existing, already-documented `pandits/default.jpg` 404.
- **Performance, same environment, before vs. after**: **Total Blocking Time dropped from a chaotic ~3,300–7,500ms range down to a consistent ~500–1,300ms range** (3-6x reduction) — the direct, measurable payoff of removing ~125KB of JS parse/execute cost from the critical path on a throttled mobile CPU. Raw FCP/LCP wall-clock timing did **not** meaningfully improve, which is itself a real finding: the next bottleneck is elsewhere (most likely the sequential data-fetch-then-render chain before the hero can paint anything, or base JS/font loading time under throttle) — not framer-motion, which this batch has now fully addressed.
- **Backend regression suite**: 395/397, unaffected (this batch was 100% frontend) — same 2 pre-existing unrelated failures noted throughout this entire project.

### What this batch deliberately did not do (Phase 12 has 118 sections; this is one evidence-gated batch of it)

Untouched so far: image inventory/optimization audit, font-loading strategy audit, cache-header audit, API-waterfall audit, database query timing, the 404-vs-soft-404 entity-routing audit, full sitemap validation, duplicate-title crawl, the Pandit-honorific-normalization fix (the "Pandit Pandit Ramesh Sharma" bug already documented in this file), a frontend E2E test suite, and the responsive-viewport matrix. The shared `Reveal`/`RevealStagger` component (used sitewide beyond Home) remains framer-motion-based — a real further-optimization opportunity, deliberately not decided unilaterally here given its blast radius and the unclear rationale behind its own prior migration to framer-motion.

### Batch B — chasing FCP/LCP wall-clock time itself

Batch A fixed TBT but, honestly reported, didn't move FCP/LCP. Batch B picked up exactly where that left off, following the same measure-first discipline.

**Measurement**: built a precise resource-timing waterfall (Playwright + CDP, same throttled conditions) that marks the exact moment the H1 first exists in the DOM alongside the browser's own FCP/LCP timestamps, and captures which element the LCP observer is actually pointing at (not just assumed). One anomalous run showed LCP occurring 2.6s after the H1 was already in the DOM — investigated with 3 repeated clean runs rather than trusting a single reading, which confirmed that was a one-off flake: LCP and FCP consistently point at the same H1, at the same timestamp, run after run.

**Finding**: JS finished downloading at ~2.7s, but the H1 didn't render until ~4.3–4.5s — a genuine ~1.6–1.8s gap that is pure parse/compile/execute time under CPU throttle, not network time. That gap is where the next fix had to come from.

**Root cause**: `I18nProvider` statically imported *both* `dictionary.en.ts` and `dictionary.hi.ts` unconditionally — meaning every visitor's critical bundle included the Hindi dictionary (~28KB source, mostly Devanagari, so heavier than the English one) even though English is the deliberate, documented default for a first-time visitor (`detectInitialLang()`'s own comment: "Devanagari-first would surprise a fresh visitor who hasn't chosen it").

**Fix**: `lib/i18n/index.tsx` now imports only `dictionary.en.ts` statically; `dictionary.hi.ts` loads via a dynamic `import()` triggered only when `lang === "hi"` — either from an explicit switch or from a returning visitor's persisted `localStorage` preference. `t()` falls back to English while the Hindi dictionary is still in flight, then re-renders correctly once it resolves (a `useState` + `useEffect`, no new dependency).

**Verified**:
- Bundle: Hindi dictionary is now its own lazy chunk (`dictionary.hi-*.js`, 25.6KB) — entry chunk **286.66KB → 261.23KB**. Combined with Batch A: **411.85KB → 261.23KB**, a 36% total reduction in the critical entry bundle.
- Functional: tested all three real scenarios live — switching English→Hindi (dynamic import fires, H1 re-renders in Devanagari correctly), a full page reload as a *returning* Hindi-preferring visitor (dictionary loads correctly on fresh load, no flash of missing translations), and switching back to English. Zero console errors across all three.
- Performance, same environment, same throttled conditions: **FCP/LCP dropped from ~4.3–4.5s (post-Batch-A) to a consistent ~3.6–3.7s** across 3 repeated runs. Cumulative improvement across both batches: **~5.4–6.2s → ~3.6–3.7s**, roughly a 35-40% reduction in wall-clock time to first paint, still short of the ≤2.5s target but substantial, real, measured progress.
- Backend suite: 395/397, unaffected — same 2 pre-existing unrelated failures.

### What's still open

The remaining ~3.6s is still meaningfully above the ≤2.5s target. Not yet investigated: how much of that is React/ReactDOM/react-router's own baseline parse cost (largely fixed cost, low-leverage to chase further), how much is the remaining ~261KB entry bundle's other contents (Home.tsx + all its still-eager dependencies), and whether TTFB/CSS/font timing (section §14/§31/§32 of the master prompt) have further, cheaper wins available. Images, cache headers, the API waterfall, database query timing, the soft-404 routing issue, sitemap validation, the duplicate-title bug, and a frontend E2E suite all remain entirely untouched.

### Batch C — cache/asset headers (next in the master prompt's own stated batch order)

Following LCP/FCP (Batches A+B) → TBT (Batch A) → **cache/assets** (this batch) → technical SEO → accessibility → SEO.

**Finding**: nginx was serving every response — HTML, the ~261KB JS entry bundle, CSS — completely uncompressed. `curl` with `Accept-Encoding: gzip, br` against both `/` and the main JS bundle came back with no `Content-Encoding` header at all. Root cause: gzip ships off by default on the stock `nginx:1.27-alpine` image, and neither `docker/nginx/default.conf` nor `local.conf` ever turned it on — a genuine gap, not a regression from earlier phases. Real PageSpeed baseline data (cited at the start of Phase 12) flagged ~2,004 KiB of "cache lifetime" savings; most of that weight was almost certainly this.

Also found and fixed in the same pass, since it's the same files: hashed static assets (`.js/.css/.svg/.png/.jpg/.webp/.ico`) were cached for only 7 days (`max-age=604800`) despite Vite content-hashing every filename — a given filename's bytes can never change, so 7 days was needlessly short for a genuinely immutable asset. Bumped to 1 year (`max-age=31536000`), still `immutable`.

**Fix**: added a `gzip on` block (types: text/plain, text/css, text/javascript, application/javascript, application/json, application/xml, image/svg+xml, plus the 3 font MIME types) to both `docker/nginx/default.conf` and `local.conf`, kept identical per this repo's existing convention for these two files. `text/html` needed no explicit listing — nginx's gzip module compresses it unconditionally regardless of `gzip_types`. Brotli was considered and deliberately not added: it needs a custom-compiled nginx (the stock alpine image has no brotli module), which is new production infrastructure this specific, already-large win doesn't need — noted as a possible future increment, not implemented.

**Verified**:
- Wire size, measured directly (not estimated): the main JS bundle went from **261,159 bytes → 79,957 bytes over the wire, a 69% reduction**, confirmed via `curl -H "Accept-Encoding: gzip"` before/after rebuild.
- Functional: Home, Temples list, and a real Temple detail page all load with correct titles and zero new console errors after the nginx rebuild (existing pre-Phase-12 placeholder-image 404s noted in Phase 8's writeup are unchanged, unrelated to this change).
- Performance, same throttled mobile conditions used throughout Phase 12: **FCP/LCP dropped from ~3.6–3.7s (post-Batch-B) to a consistent ~2.1–2.2s**, now **under the ≤2.5s target for the first time this phase**. Desktop: FCP/LCP 344ms, TBT 117ms (baseline was 1.7s/200ms). Cumulative mobile improvement across all of Phase 12: **~5.4–6.2s → ~2.1–2.2s**.
- CLS: confirmed healthy at **0.004 mobile / 0.007 desktop** — both well inside the ≤0.10 hard guard and better than the 0.074 real baseline.

**A real bug in the measurement harness itself, caught before being reported as a regression**: the first `perf-harness.js` run after this fix showed a CLS of **1.152** — a number that would have meant a severe regression against the hard guard. Rather than report it, cross-checked with an independent single-purpose script (`cls-detail.js`) that isolates the actual `layout-shift` observer entries and their source elements — it consistently measured **0.0038**, a 300x discrepancy. Root-caused to `perf-harness.js` itself: it launched one Chromium browser process and reused it across all 5 measurement runs (a new context per run, but the same browser process) — the very first run in a fresh process was always fast and healthy (`loadEvent` ~1.1s), but every run after it degraded to a ~22.5s `loadEvent`, which gave enough extra wall-clock time for background lazy-loaded images to shift content well outside the intended measurement window, none of which reflects a real user's experience. Fixed by launching a fresh browser process per run (matching `cls-detail.js`'s already-healthy pattern); re-run, all 5/5 runs became consistent. `perf-harness.js` updated in place with a comment documenting the bug so it isn't reintroduced.

**Backend suite**: unaffected — this batch is pure infrastructure (nginx config), no backend or frontend application code changed.

### Batch D — technical SEO (soft-404s, the duplicate-title bug, sitemap/indexability consistency)

Following cache/assets (Batch C) → **technical SEO** (this batch) → accessibility → SEO, per the master prompt's own stated order.

**1. Soft-404s.** `curl`-checked every entity route type with a nonexistent slug: `/temples/x`, `/services/x`, `/pandits/x`, and an arbitrary bogus path all returned **HTTP 200** with an empty/generic shell — a textbook "soft 404" (the exact failure mode search consoles flag, and one that wastes crawl budget since crawlers can't tell a missing page from a real one without inspecting rendered content). Root cause: `render.controller.js` (Phase 7) already does a real DB lookup for these 3 entity types and already knows definitively when a slug doesn't exist — it just wasn't surfacing that as a real status code, falling through to the same 200 response used for genuine internal errors. Fixed by introducing a `NOT_FOUND` sentinel distinct from "meta generation failed" — a confirmed missing entity now returns a real `404`, while the existing "never show a broken page" fail-safe (200 + plain shell) is preserved for actual unexpected errors (DB failure, bug). The shell HTML is unchanged either way, so a real browser's React Router still mounts and shows the friendly NotFound page — only the HTTP status changes. Verified nginx doesn't intercept 404 (`error_page` only lists 500/502/503/504), so it passes straight through.

Deliberately **not** fixed: the fully generic catch-all case (`/totally/bogus/route`, not matched by any of the 4 proxied route shapes) still returns 200 via nginx's plain SPA fallback. Making that return a true 404 would require nginx to know the frontend's entire React Router route table, duplicated and kept in sync forever — a materially bigger, more fragile change than this batch's scope, and the same accepted limitation every pure-CSR SPA has (Googlebot, which executes JS, already handles this case via its own soft-404 content-based detection — this phase's real audience, non-JS crawlers/preview bots hitting a bogus URL, is a much smaller, lower-priority miss than the 3 real entity-route types above). Noted as a known, deliberate gap, not silently skipped.

**2. The known duplicate-title bug** ("Pandit Pandit Ramesh Sharma", flagged by name in the original master prompt). Root-caused: 16 real seeded pandits have the "Pandit" honorific already baked into their stored `full_name` (confirmed via direct DB query), while `panditMeta()` (backend) and the equivalent client-side formula (`PanditProfile.tsx`) both unconditionally prepended `Pandit ${name}` — producing the literal duplication in the `<title>` tag for exactly those 16 profiles. A third, previously-unnoticed instance of the identical bug was also found and fixed: the pandit's own dashboard greeting (`"Namaste Pandit ${name} Ji"` in `pandit/pages/Dashboard.tsx`) — a real, visible bug for those same 16 logged-in pandit accounts, not just a crawler-facing metadata issue. Fixed with a small shared `withPanditHonorific(name)` helper (only prepends "Pandit" if the name doesn't already start with it, case-insensitive) — mirrored on both sides per this project's established Phase 7/9 convention: `backend/src/utils/seoMeta.js` and `frontend/app/src/lib/normalize.ts` (imported by both `PanditProfile.tsx` and the pandit-app's `Dashboard.tsx`). Every other use of a pandit's raw name (H1, cards, breadcrumbs, JSON-LD `Person.name`) was deliberately left untouched — those already display correctly regardless of whether the stored name includes the honorific, and don't need the helper.

**3. Sitemap/indexability inconsistency**, found while re-checking the sitemap against Phase 11's indexability engine. The sitemap (Phase 5) only ever applied basic visibility gates (`is_active`, `deleted_at`, account status) — it never adopted Phase 11's later "thin content" rule, so a visible-but-thin entity that correctly gets `noindex` on its own page (Phase 11) was still being listed in the sitemap, telling crawlers to index a page that explicitly tells them not to — contradictory signals search engines specifically warn against. Fixed by expressing the same signals `isTempleIndexable`/`isServiceIndexable`/`isPanditIndexable` check (same 40-character meaningful-text threshold, same verified-status gate, same relationship checks) directly in the sitemap's bulk SQL, rather than calling those functions per-row — which would mean 1,000+ extra per-pandit queries just to build one sitemap response.

**Verified**:
- Live: bad temple/service/pandit slugs now return `404`; a real slug still returns `200`; `ramesh-sharma`'s `<title>` now reads `Pandit Ramesh Sharma — ...` (no duplication).
- Backend suite: 22 new/updated tests across `render.test.js` (soft-404 for all 3 entity types, a dedicated no-duplicate-honorific regression test), `seo-meta.test.js` (unit tests for both the with- and without-honorific cases), and `sitemap.test.js` (a new fixture proving a thin-but-visible temple is excluded, mirroring `render.test.js`'s existing thin-temple noindex test). **400/402**, same 2 pre-existing unrelated failures as every phase this session.
- Full functional pass (Home, a real temple/service/pandit page, the new service-pandits page) confirmed correct titles and zero new console errors after rebuild.

## 18. Roadmap

Phase 10 — final documentation pass (a review of this document end-to-end now that Phases 1-9 have all shipped, checking for drift between what's described and what's actually in the code).

Phase 11's fourth selected track — **location hub pages and problem/intent pages — is deferred at the user's request**, not abandoned. It still needs a data-model decision (no locations table exists — city/state are free-text columns today) and real curated content from the user for problem/intent pages, not fabricated spiritual-guidance copy, per the master prompt's own explicit warning against exactly that. Pick this back up when there's real input to build it from.
