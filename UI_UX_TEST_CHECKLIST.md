# PanditSuggest — UI/UX test checklist

`[x]` = verified by static analysis of source
`[ ]` = needs a browser · run `npx playwright test` against your running stack

---

## Setup
- [x] Route inventory (48 routes)
- [x] Component inventory (38 components, 23 stylesheets)
- [x] Tech stack identified — React 19, Vite 8, React Router 7, Framer Motion 12, Swiper 14, plain CSS
- [x] TypeScript compiles clean (exit 0)
- [x] Backend boots
- [ ] Playwright installed and green

## Viewports
- [ ] 320 × 568 · [ ] 360 × 640 · [ ] 375 × 667 · [ ] 390 × 844 · [ ] 412 × 915 · [ ] 430 × 932
- [ ] 600 × 960 · [ ] 768 × 1024 · [ ] 820 × 1180 · [ ] 1024 × 1366
- [ ] 1024 × 768 · [ ] 1280 × 720 · [ ] 1366 × 768 · [ ] 1440 × 900 · [ ] 1920 × 1080 · [ ] 2560 × 1440
- [ ] Breakpoint sweep (599/600, 767/768, 1023/1024)
- [ ] Portrait ↔ landscape

## Overflow
- [x] No `100vw` anywhere
- [x] Oversized decorative elements are clipped by `overflow: hidden` parents
- [x] `table.tbl` (min-width 380px) wrapped in a scrolling `.table-wrap`
- [x] Featured review card sits inside a horizontal scroller
- [ ] `scrollWidth <= innerWidth` on all 18 public routes
- [ ] Same on all 13 admin routes
- [ ] Long name stress test (68 chars)
- [ ] Devanagari / mixed Hindi–English

## Navigation
- [x] Active-route highlighting present (`NavLink` + `is-active`)
- [x] Drawer closes on route change (`useEffect` on `location.pathname`)
- [x] Escape closes drawer
- [ ] Drawer scrollable and not behind content
- [ ] Browser back / history
- [ ] Direct URL + refresh on every route

## Fixed & sticky
- [x] Z-index ladder mapped (9999 → 40)
- [x] **UI-001 fixed** — contact bar no longer behind the tab bar
- [x] `env(safe-area-inset-bottom)` on tab bar, contact bar, sidebar, reels
- [ ] Nothing fixed covers a CTA, Save button or pagination

## Animation
- [x] 19 `whileInView`, 18 with `once: true`
- [x] 52 CSS rules start at `opacity: 0`
- [ ] Nothing stuck invisible after fast scroll / refresh mid-page / back-nav
- [ ] `prefers-reduced-motion` respected — **known gap: 15 of 23 stylesheets (UI-006)**
- [ ] No animation blocks clicks

## Forms
- [x] Inputs are 16px (prevents iOS zoom) in pandit + admin CSS
- [x] Double-submit guarded on pandit login, reset, admin create, uploads
- [ ] Mobile keyboard does not hide the focused field
- [ ] Validation and error messages visible

## Modals
- [x] `max-height: 90vh; overflow-y: auto` in `base.css`
- [ ] Save reachable in the temple modal at 320px
- [ ] Background does not scroll behind
- [ ] Map iframe does not overflow

## Admin
- [x] 13 routes inventoried
- [x] **UI-005 fixed** — record counts and pagination now render
- [ ] Mobile sidebar
- [ ] Tables at 320px
- [ ] Create / edit / delete flows

## Pandit dashboard
- [x] Drawer ↔ sidebar at 1024px
- [x] Leads table → cards on mobile
- [ ] 0 / 1 / 50 / 500 leads
- [ ] Long names + phone numbers

## Resilience
- [x] **UI-003 fixed** — no raw DB errors reach users
- [x] **UI-004 fixed** — ErrorBoundary replaces the blank white page
- [ ] 400 / 401 / 403 / 404 / 429 / 500
- [ ] Offline · slow 3G
- [ ] Empty states (0 pandits / temples / services / leads)
- [ ] Broken images

## Accessibility
- [x] Skip link, semantic landmarks, `aria-current` present
- [ ] One `h1` per page
- [ ] All images have alt
- [ ] Icon-only buttons labelled
- [ ] Keyboard-only path through Flow 1
- [ ] Touch targets ≥ 44px
- [ ] Colour contrast

## Console & network
- [ ] Zero console errors on every route
- [ ] No duplicate API calls
- [ ] No 404 assets

## Cross-browser
- [ ] Chrome · [ ] Edge · [ ] Firefox · [ ] WebKit/Safari

## Regression
- [x] Qualified-lead logic untouched (dedup, advisory lock, RLS)
- [x] TypeScript clean after all fixes
- [ ] Visual regression baselines captured
