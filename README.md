# PanditConnect

**Sacred Connections, Trusted Pandits** — a temple-first *directory* (not a booking platform) where
devotees browse temples, compare verified Pandit profiles, and contact pandit ji **directly** on
WhatsApp or call. No middleman, no commission on the puja.

Built to the **White & Gold theme (Design 2)** in [`docs/ui_design2_white_gold.md`](docs/ui_design2_white_gold.md),
with the features and page structure from [`docs/business_blueprint.md`](docs/business_blueprint.md).
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together and why,
[`database_architecture.md`](database_architecture.md) for the original database design proposal
(implemented in `backend/src/db/01-schema.sql`, with a few deviations documented in both places), and
[`docs/SECURITY.md`](docs/SECURITY.md) for what's implemented from
[`security_architecture.md`](security_architecture.md) — and what was deliberately skipped because it
doesn't match this project's real infrastructure — and [`docs/ADMIN.md`](docs/ADMIN.md) for the
backend-only admin panel adapted from [`admin_architecture.md`](admin_architecture.md) (2-step
password + real TOTP login, mounted under `/api/<ADMIN_SECRET_PATH>/...` — no admin frontend exists).

---

## Project structure

```
maa-baglamukhi-project/
├── frontend/
│   ├── app/                React 19 + TypeScript SPA (Vite, React Router, Framer Motion, Swiper)
│   │                        — the only frontend; see "Frontend code structure" below
│   └── Dockerfile          Multi-stage: builds frontend/app, serves the static output via nginx
├── backend/                Express REST API, Postgres-backed (temples, pandits, services, auth,
│                            reviews, community, subscriptions/payments, contact, enquiries,
│                            admin panel…) — Node.js throughout, layered as
│                            routes/ → controllers/ → repositories/ → Postgres
├── docker/                 Shared nginx reverse-proxy config (serves the SPA, proxies /api)
├── docker-compose.yml      One command to run db + backend + frontend together
├── docs/                   Business blueprint, UI design spec, architecture notes
├── database_architecture.md  Original DB design proposal (see docs/ARCHITECTURE.md for what changed)
├── security_architecture.md  Original security proposal (see docs/SECURITY.md for what changed)
├── admin_architecture.md     Original admin panel proposal (see docs/ADMIN.md for what changed)
└── package.json            Root dev scripts only (test, seed, docker:*)
```

---

## Run it

### Fastest: Docker (db + backend + frontend together)

```bash
docker compose up -d --build
```

Open **http://localhost:8080**. The backend API is reachable at `http://localhost:8080/api/*`
(same-origin, via nginx) or directly at `http://localhost:4000/api/*`. Postgres (a PostGIS-flavored
image — the schema uses PostGIS for geospatial indexes) is reachable at `localhost:5433` (mapped
from the container's 5432, to avoid clashing with a local install) — schema and seed data load
automatically on first start.

Two Postgres roles exist: `panditconnect` (the bootstrap superuser — owns the schema, use it for
`psql`/admin access) and `panditconnect_app` (what the backend actually connects as — Row-Level
Security policies don't apply to a table's owner, so the app deliberately connects as a different,
unprivileged role; see `docs/ARCHITECTURE.md`).

```bash
docker compose logs -f      # tail all three services
docker compose down         # stop (data persists in the db_data volume)
docker compose down -v      # stop AND wipe the database — start over from nothing
```

### Manual: frontend only (no backend/database needed to browse)

Every list/detail page renders from data bundled into the app — no server required to look around:

```bash
cd frontend/app
npm install
npm run dev          # Vite dev server, usually http://localhost:5173
```

Contact/enquiry/newsletter forms will just fall back to a local confirmation toast if no backend is
running (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why that's the deliberate design).
`npm run build` produces the static `dist/` that `frontend/Dockerfile` also builds and nginx serves.

### Manual: backend + Postgres, without the frontend container

```bash
docker compose up -d db          # just the database, exposed at localhost:5433
cd backend
cp .env.example .env             # already points at localhost:5433
npm install
npm run dev                      # http://localhost:4000/api/health
```

Pointing the backend at a Postgres it didn't create itself (a local install, a managed cloud
instance)? Apply the schema and seed data by hand, connecting as a role that can `CREATE EXTENSION`
and `CREATE ROLE` (01-schema.sql creates `panditconnect_app` itself — see above):

```bash
cd backend
DATABASE_URL=postgresql://<superuser>:...@host:5432/dbname npm run db:init
```

---

## Pages (14)

React Router routes, all under `frontend/app/src/pages/`:

| Page | Route | Component | What it does |
|---|---|---|---|
| Homepage | `/` | `Home.tsx` | Animated hero, stats, how-it-works, featured pandits, popular temples, services, festivals, testimonials |
| Temple Directory | `/temples` | `Temples.tsx` | Search + sidebar filters (city, state, service, rating), sort, pagination |
| Temple Detail | `/temples/:id` | `TempleDetail.tsx` | Full-screen animated photo banner, gold tabs (Overview / Gallery / Pandits / Services / Reviews / Location), inquiry sidebar |
| Pandit Directory | `/pandits` | `Pandits.tsx` | Filters by city, service, language, experience, rating, verified |
| Pandit Profile | `/pandits/:id` | `PanditProfile.tsx` | Gold-ring photo, verified badge, WhatsApp/Call, services, temples, credentials, video intro, availability, reviews, QR |
| Services | `/services` | `Services.tsx` | Grid of rituals with 3D-style icons, category pills, live search |
| Service Detail | `/services/:id` | `ServiceDetail.tsx` | Description, samagri list, best muhurat, pandits and temples for it |
| Panchang | `/panchang` | `Panchang.tsx` | Today's tithi/nakshatra/yoga/karana, Rahu Kaal, muhurat finder, month calendar with festivals |
| Temple Map | `/temple-map` | `TempleMap.tsx` | Interactive India map, markers from real lat/lng, filter by state/service |
| AI Pooja Guide | `/ai-recommender` | `AiRecommender.tsx` | Chat-style recommender, Hindi or English |
| Blog | `/blog` | `Blog.tsx` | Category pills, search, featured post |
| Pandit Dashboard | `/dashboard` | `Dashboard.tsx` | Overview KPIs, profile, services & availability, reviews, analytics, subscription tiers |
| About | `/about` | `About.tsx` | Mission, verification process, us-vs-them table, revenue model stated openly |
| Contact | `/contact` | `Contact.tsx` | Form + FAQ accordion |

---

## Backend API

Postgres-backed. Base URL: `/api` (via nginx in Docker) or `http://localhost:4000/api` directly.

`:id` in every route below is the resource's `slug` (e.g. `kashi-vishwanath`, `ramesh-sharma`,
`griha-pravesh`) — the same short id the old flat data used, kept stable across the schema rewrite
even though primary keys are UUIDs internally.

| Method & path | What it does |
|---|---|
| `GET /health` | Liveness check |
| `GET /temples` | List, filterable by `q, city, state, service, minRating`, sortable, paginated |
| `GET /temples/:id` | Detail, includes `availablePandits[]` |
| `POST /temples/:id/inquiry` | Records `{ name, phone, service, date, message }` — anonymous, no login needed |
| `GET /pandits` | List, filterable by `q, city, service, lang, minExp, minRating, verified`, sortable, paginated |
| `GET /pandits/:id` | Detail, includes `associatedTemples[]` |
| `POST /pandits/:id/enquiry` | Records `{ name, phone, service, date, message }` — anonymous, no login needed |
| `POST /pandits/:id/subscribe` | Auth required (own profile). `{ tier, billingCycle }` → Razorpay order. 501s without gateway keys — see "Known placeholders" |
| `GET /services`, `GET /services/:id` | Catalog + detail (detail includes matching `pandits[]`/`temples[]`) |
| `GET /blog`, `GET /blog/:id` | Articles |
| `GET /reviews` | Public testimonial feed; `?targetType=pandit&targetSlug=...` scopes to one profile |
| `POST /reviews` | Auth required. `{ targetType, targetSlug, rating, title?, body?, service? }` |
| `GET /community`, `GET /community/:id` | Devotee forum posts + comments |
| `POST /community`, `POST /community/:id/comments` | Auth required |
| `GET /panchang`, `GET /festivals`, `GET /faqs`, `GET /plans`, `GET /stats`, `GET /taxonomy` | Static reference data |
| `POST /recommend` | `{ text }` → suggested services (same rule table the frontend runs locally); logs to `ai_recommendations` |
| `POST /contact` | General contact message |
| `POST /newsletter` | `{ email }`, deduped |
| `POST /payments/webhook` | Razorpay payment-capture callback (HMAC-verified, raw body) |
| **Auth** (`/auth/*`) | `POST /register`, `POST /register-pandit` (also creates the linked pandit profile), `POST /login`, `POST /logout`, `GET /me`, `POST /otp/request`, `POST /otp/verify` — see "Known placeholders" for OTP delivery |
| **Logged-in user** (`/me/*`, all auth required) | `GET/POST/DELETE /saved-pandits`, `.../saved-temples`, `GET /notifications`, `POST /notifications/:id/read`, `GET /inquiries` + `PATCH /inquiries/:id` (pandit's own enquiry inbox), `GET /dashboard` (pandit's own KPIs), `GET /export` (download everything this account owns), `DELETE /` (account deletion) |

Auth uses a bearer token (`Authorization: Bearer <token>` from `/auth/login` or `/auth/register`),
not cookies — pass it on every `/me/*`, `/reviews` POST, `/community` POST, and `/pandits/:id/subscribe`
call. See `docs/ARCHITECTURE.md` for how this interacts with Postgres Row-Level Security, and
`docs/SECURITY.md` for rate limiting, security headers, and audit logging (`/auth/*` and `/otp/*` are
rate-limited per IP+email; every request gets security headers via helmet; failed logins, rate-limit
rejections and invalid payment webhook signatures are written to `security_audit_log`).

Backend tests: `cd backend && npm test` (Node's built-in test runner — runs against a real Postgres;
`docker compose up -d db` first if you're not already running the full stack).

---

## Keeping frontend content, backend seed data and the database in sync

`frontend/app/src/data/content.ts` is the single source of truth for all directory content (temples,
pandits, services, festivals, reviews, blog posts, panchang, plans, FAQs) — it's what the SPA imports
directly and bundles at build time. `backend/src/data/*.json` is a separate, parallel copy used only
to seed Postgres; keep the two in sync by hand when you add or edit a record (there is currently no
generator between them, unlike the old static site):

```
frontend/app/src/data/content.ts  ⇄  backend/src/data/*.json  →  backend/src/db/02-seed.sql  →  Postgres
```

```bash
cd backend && npm run seed    # regenerates both the JSON and the SQL
```

Docker Compose applies the resulting `01-schema.sql` + `02-seed.sql` automatically on first start.
For a Postgres it didn't create (or to re-apply after editing without wiping the volume):
`DATABASE_URL=postgresql://... npm run db:init` (see "Run it" above).

`npm test` (see below) fails if any link in that chain has drifted.

---

## Adding your real temple & pandit photos

Every image already points at a real file path and **falls back to bundled SVG artwork** when the
photo is missing. To use real pictures, drop files into `frontend/app/public/assets/img/` (Vite
copies this folder verbatim into the built site) and point the matching record's `img` /
`gallery` field at it in `frontend/app/src/data/content.ts` — filenames don't have to match the
`id` the way the old static site required, since the path is now explicit data, not a convention.

```
frontend/app/public/assets/img/temples/     one hero photo + an optional gallery/ subfolder per temple
frontend/app/public/assets/img/pandits/     square headshots, ~600×600 or larger
```

After editing `content.ts`, run `npm run seed` (repo root) to regenerate the backend's JSON/SQL
seed copy — see "Keeping frontend content, backend seed data and the database in sync" above.

---

## Design system

Tokens live at the top of `frontend/app/src/styles/base.css` as CSS custom properties, matching the
design doc, with additions layered on top in `frontend/app/src/styles/enhance.css`:

| Token | Value |
|---|---|
| `--white` | `#FFFFFF` |
| `--ivory` | `#FFF8E7` |
| `--gold` | `#D4A017` |
| `--gold-bright` | `#FFD700` |
| `--text` | `#2D2D2D` |
| `--text-2` | `#6B6B6B` |
| `--border` | `#E8D5B7` |

Fonts: **Playfair Display** for large page titles, **Poppins** for UI headings, **Inter** for body —
loaded from Google Fonts with a system fallback stack.

Icons are a hand-built line-art set in `frontend/app/src/lib/icons.tsx` (component: `<Icon name="..." />`),
drawn with `currentColor` so gold theming is automatic. Hindu-specific icons included: Om, Diya,
Kalash, Trishul, Lotus, Temple. Service cards use full-color emoji "3D icon" tiles instead
(`frontend/app/src/lib/serviceEmoji.ts`) for a more dimensional look.

Animation is Framer Motion throughout (page transitions, scroll reveals, staggered grids, card
hover) plus Swiper for the temple photo sliders (homepage hero, temple detail banner).

---

## Frontend code structure

```
frontend/app/src/
├── pages/            One component per route (Home.tsx, Temples.tsx, TempleDetail.tsx, …)
├── components/
│   ├── layout/        Header, Footer, page Layout shell
│   ├── ui/             Shared building blocks: cards, modal, lightbox, toast, star rating…
│   ├── hero/           Homepage hero photo slider
│   └── temple/         Temple-detail-specific banner slider
├── data/
│   ├── content.ts      All directory content — single source of truth for the frontend
│   └── types.ts        Shared TypeScript interfaces for that content
├── lib/                Icon set, API client, small formatting/QR helpers
└── styles/             base.css (ported design tokens + components) + enhance.css (additions)
```

To add a page: create `pages/Foo.tsx`, then add a `<Route>` for it in `src/App.tsx`.

---

## Tests

```bash
npm test            # repo root — currently just proxies to the backend suite
```

| Layer | Command | What it checks |
|---|---|---|
| Backend API | `npm run test:backend` (`cd backend && npm test`) | Every route, filter, validation error and 404 — Node's built-in test runner, against a real Postgres |

There is no automated frontend test suite yet (the old jsdom-based data/smoke checks were tied to
the static-HTML site and were removed along with it). `frontend/app` is a standard Vite + TypeScript
project, so adding Vitest/Playwright there is the natural next step if you want one.

---

## Known placeholders

Honest list of what is not yet real, so nothing surprises you later:

- **Phone numbers** are placeholders (`+9190000001xx`). The WhatsApp and Call buttons build correct
  `wa.me` / `tel:` links, so they will work the moment you put real numbers in `content.ts`.
- **The AI Pooja Guide is rule-based, not an LLM.** It keyword-matches a rule table entirely
  client-side (and the same table is exposed at `POST /api/recommend`), and the page says so
  plainly. The current version has the advantage of working offline and never sending a user's
  problem anywhere.
- **Panchang figures are static sample values.** Real panchang needs an ephemeris calculation per
  location — the page states that the numbers are indicative. Wire an API (e.g. ProKerala,
  VedicRishi) into `panchang` in `content.ts` / `backend/src/data/panchang.json` when ready.
- **The India map outline is a hand-simplified silhouette**, not a survey-accurate boundary. Markers
  use each temple's real latitude and longitude, so relative positions are correct. For production,
  drop Leaflet + a GeoJSON layer into `pages/TempleMap.tsx`.
- **Most temple/pandit photos are real, openly-licensed stock photography** sourced for this build
  (Wikimedia Commons) rather than photos you own — swap in your own licensed photography before any
  commercial launch. A few still fall back to bundled SVG artwork where no photo was sourced.
- **`pages/Dashboard.tsx` still shows illustrative numbers and has no login form.** The backend behind
  it is real — `POST /api/auth/register-pandit` + `POST /api/auth/login` issue a working bearer
  session, and `GET /api/me/dashboard` returns that pandit's actual KPIs (views, clicks, pending
  inquiries, subscription status) — but nothing in the frontend calls them yet. Wiring the page up is
  a frontend task, not a backend one.
- **No real SMS/email provider is wired up for OTP delivery.** `POST /api/auth/otp/request` generates
  and stores a real, hashed, expiring OTP, but "sending" it is a `console.log` on the backend
  container (visible via `docker compose logs backend`) rather than an actual text message.
- **No real payment gateway account exists.** `POST /api/pandits/:id/subscribe` and
  `POST /api/payments/webhook` are fully wired to Razorpay's REST API and webhook signature
  verification — set real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` test-mode keys (see
  `backend/.env.example`) and the whole subscription flow works end-to-end. Without them, `/subscribe`
  responds `501` rather than pretending to charge anyone.
- **Google Maps embed** on the temple Location tab shows coordinates and an "Open in Google Maps"
  deep link (which works). Add an API key to embed the live map inline.

---

## Accessibility & performance notes

- Semantic landmarks, skip link, `aria-label` on icon-only controls, `aria-current` on active nav,
  keyboard-operable tabs, accordion, map markers and modals (Escape closes).
- Focus-visible outlines in gold; every interactive target meets 44px on touch.
- `prefers-reduced-motion` disables all animation and scroll-smoothing.
- Frontend loads no external JS beyond Google Fonts — no analytics, no tracking scripts.
