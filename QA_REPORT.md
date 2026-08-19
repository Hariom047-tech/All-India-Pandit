# PanditSuggest — UI/UX QA Report

**Date:** 11 August 2026
**Method:** static analysis of the full source tree, plus an automated suite written for you to execute.

---

## ⚠️ Read this first — what was and was not executed

My environment has **no browser, no Playwright, and no network route to your running stack**. I verified this rather than assuming: `127.0.0.1:5173`, `127.0.0.1:4000`, `host.docker.internal` and the Docker bridge are all unreachable, the egress proxy returns **403** for everything except package registries, and Playwright cannot be installed for the same reason.

**Therefore:**

| Verified by me | Written for you to run |
|---|---|
| Route + component inventory | Viewport screenshots at 24 sizes |
| CSS/layout static audit | Live `scrollWidth > innerWidth` checks |
| Z-index ladder | Console + network monitoring |
| Animation code paths | Cross-browser (Firefox / WebKit) |
| Accessibility markup | Slow-network + offline behaviour |
| TypeScript compile (exit 0) | Visual regression baselines |
| Backend boot | Zoom 125–200%, orientation |

**Nothing below is claimed as browser-verified.** Findings are marked `[code]` (proven by reading source) or `[suspect]` (needs the browser to confirm). No scores are given for things I could not measure.

---

## Summary

| | Count |
|---|---|
| Routes inventoried | **48** (23 public, 15 admin, 10 pandit) |
| Components inventoried | 38 components, 23 stylesheets, 9,258 CSS lines |
| Issues found | **11** |
| Fixed | **5** |
| Needs browser to confirm | 6 |

| Severity | Found | Fixed |
|---|---|---|
| P0 Critical | 0 | — |
| P1 High | 2 | 2 |
| P2 Medium | 5 | 3 |
| P3 Low | 4 | 0 |

---

## Route inventory

**Public (23)** — `/` `/temples` `/temples/:id` `/pandits` `/pandits/:id` `/services` `/services/:id` `/panchang` `/festivals` `/search` `/temple-map` `/ai-recommender` `/blog` `/dashboard` `/about` `/contact` `/pandit-ji` `/login` `/pandit-login` `/pandit-forgot-password` `/privacy` `/terms` `/*`

**Admin (15)** — `/admin-panel/` `login` `pandits` `pandits/new` `pandits/:id` `temples` `services` `reviews` `users` `inquiries` `analytics` `leads` `plans` `home` `security` `settings`

**Pandit (10)** — `/pandit/dashboard` + `leads` `profile` `services` `availability` `reviews` `analytics` `plan` `settings`

---

## Fixed

### UI-001 — Sticky contact bar hidden behind the mobile tab bar · **P1** · `[code]`
**Page:** Pandit profile · **Viewport:** all mobile widths
`.contact-bar` had `z-index: 60`; `.bottom-nav` (fixed, same 68px strip) has `z-index: 95`. The Call/WhatsApp bar rendered *behind* the tab bar and could not be tapped.
Compounding it, the bar offset itself with `margin-bottom: var(--bottom-nav-h, 0px)` — **`--bottom-nav-h` was never defined anywhere**, so it resolved to `0` and the two occupied the same pixels.
**Root cause:** no shared token for the tab-bar height; each component guessed.
**Fix:** `base.css` now publishes `--bottom-nav-h: 68px` inside the same media query that shows `.bottom-nav`; the contact bar uses `bottom: var(--bottom-nav-h, 0px)` and `z-index: 96`. Zero on desktop, where no tab bar exists.
**Regression guard:** `e2e/navigation.spec.ts` asserts the bar's z-index exceeds 95.
*This was my own bug, introduced with the profile redesign.*

### UI-002 — Two components fought over `.lightbox` · **P2** · `[code]`
`styles/enhance.css` defines `.lightbox { z-index: 500 }` (shared `Lightbox` component); `styles/review-list.css` defined `.lightbox { z-index: 1000 }` (review photo viewer). Same class, two owners, different stacking — the winner depended on CSS bundle order.
**Fix:** review viewer renamed to `.review-lightbox` in both CSS and `ReviewList.tsx`. The shared component keeps `.lightbox`.

### UI-003 — Raw Postgres errors reached the browser · **P1** · `[code]`
`errorHandler` returned `err.message` verbatim on every 500, exposing table names, column names and query shape (e.g. `function get_pandit_lead_counts(unknown, unknown) does not exist` rendered in the UI).
**Fix:** intentional 4xx pass through; schema errors return an actionable "migration pending"; everything else is generic outside development. Full detail still goes to the server log.

### UI-004 — Blank white page on any render error · **P1** · `[code]`
React unmounts the whole tree on an uncaught error. `t.lat.toFixed()` on a string (node-postgres returns `DECIMAL` as a **string**) blanked the entire temple page — indistinguishable from a dead server.
**Fix:** `num()` coercion applied to every numeric column in `normalize.ts`, plus an `ErrorBoundary` around the route tree.

### UI-005 — Admin record counts and pagination silently dead · **P2** · `[code]`
Backend returns `{data, meta:{total,totalPages}}`; all seven admin list pages read `rows.total` at the top level. `undefined` renders as nothing and `undefined > 1` is `false`, so counts were blank and pagers never appeared.
**Fix:** envelope flattened once in `adminApi.request()`.

---

## Open — need the browser to confirm

### UI-006 — 15 of 23 stylesheets ignore `prefers-reduced-motion` · **P2** · `[code]`
Missing in `enhance.css`, `festivals.css`, `search.css`, `service-detail.css`, `temple-detail.css` and 10 others. 8 stylesheets do honour it. Users with vestibular sensitivity get animation regardless.
**Recommended fix:** one global `@media (prefers-reduced-motion: reduce)` block in `base.css` neutralising `animation` and `transition` site-wide, rather than 15 separate blocks.

### UI-007 — 52 CSS rules start at `opacity: 0` · **P2** · `[suspect]`
19 Framer Motion `whileInView` usages, 18 correctly using `once: true`. The risk is content stuck invisible when an IntersectionObserver never fires — on fast scroll, on refresh mid-page, or after back-navigation.
`e2e/responsive.spec.ts` and `a11y-motion.spec.ts` both assert nothing in `<main>` sits at `opacity: 0` while in view.

### UI-008 — `white-space: nowrap` on 30 rules vs only 6 `overflow-wrap` declarations · **P2** · `[suspect]`
Long Devanagari strings and names like *"Acharya Shri Mahamandaleshwar Pandit Rajendra Prasad Sharma Ji"* are the realistic overflow trigger. `e2e/resilience.spec.ts` injects exactly that string and re-checks overflow.

### UI-009 — Two arbitrary `z-index: 9999` values · **P3** · `[code]`
`.toast-host` and one other rule. The ladder is otherwise sane (1000 → 500 → 200 → 150 → 130 → 120 → 110 → 100 → 96 → 95). Worth converting to named tokens, but nothing is currently broken.

### UI-010 — 0 of 8 grid stylesheets use `minmax(0, 1fr)` · **P3** · `[suspect]`
`1fr` defaults to `min-width: auto`, so a wide child (a long unbroken string, a table) pushes the column past its container. A classic silent overflow source; the breakpoint sweep will surface it if real.

### UI-011 — Homepage copy claims "33 rituals", database has 2 · **P3** · `[code]`
Hardcoded in the i18n dictionary while "All Services" reports the real count. Either seed the 32 services or make the number dynamic.

---

## Checked and found correct

- **Modals** — `max-height: 90vh; overflow-y: auto` already present in `base.css`. Save buttons reachable.
- **Tables** — `.table-wrap { overflow-x: auto }` wraps `table.tbl` (`min-width: 380px`), so the About comparison table scrolls rather than breaking the page at 320px.
- **Decorative overflow** — `.hero-astro`, `.sp-hero`, `.hp-sacred-mandala` all set `overflow: hidden`; their oversized pseudo-elements (400–600px) are clipped correctly.
- **Carousels** — `.review-card--featured { width: 440px }` sits inside `.hp-reviews-carousel` (`overflow-x: auto`) and `.scroll-x` (`flex: 0 0 300px`). Not an overflow source.
- **`100vw`** — not used anywhere. Good; it is the most common scrollbar-overflow cause.
- **Safe areas** — `env(safe-area-inset-bottom)` correctly applied on `.bottom-nav`, `.contact-bar`, pandit sidebar and reels.
- **Qualified-lead logic** — untouched. No UI change altered `record_qualified_lead()`, the dedup window, or the advisory-lock concurrency guard.

---

## Automated suite delivered

`playwright.config.ts` — 13 projects: 320 / 360 / 390 / 430 mobile · 600 / 768 / 1024 tablet · 1366 / 1440 / 1920 / 2560 desktop · Firefox · WebKit.

| Spec | Covers |
|---|---|
| `responsive.spec.ts` | Overflow on all 18 public routes; **breakpoint sweep** at 13 widths including the awkward 599/600, 767/768, 1023/1024 boundaries |
| `navigation.spec.ts` | Drawer open/Escape/close-on-navigate, UI-001 regression guard, direct-URL access |
| `console.spec.ts` | Zero console errors per route; duplicate API-call detection |
| `a11y-motion.spec.ts` | Single `h1`, alt text, labelled icon buttons, 36px touch targets, reduced-motion usability, keyboard focus ring |
| `resilience.spec.ts` | API 500, offline, empty results, 68-char names, blocked images |
| `admin.spec.ts` | Unauthenticated redirect, overflow on all 13 admin routes, modal fits viewport + Save reachable |
| `pandit-flows.spec.ts` | Flows A–H (written earlier) |

The overflow helper **names the offending element** (`div.foo extends to 412px`) so failures are actionable.

**Run:**
```bash
npm i -D @playwright/test && npx playwright install --with-deps
E2E_BASE_URL=http://localhost:5173 npx playwright test
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npx playwright test admin
```

---

## Scores

Deliberately withheld for Desktop / Tablet / Mobile UI-UX, animation quality and production readiness — those require seeing rendered pages at real viewports, which I could not do. Running the suite above will produce the evidence to score them honestly.

What I can state: **TypeScript compiles clean (exit 0)**, the **backend boots**, and **five real defects are fixed** — two of which (UI-003, UI-004) were user-visible breakage.
