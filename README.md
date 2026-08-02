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
├── frontend/               Static multi-page site — no framework, no build step (frontend/public/)
├── backend/                Express REST API, Postgres-backed (temples, pandits, services, auth,
│                            reviews, community, subscriptions/payments, contact, enquiries,
│                            admin panel…)
├── docker/                 Shared nginx reverse-proxy config
├── docker-compose.yml      One command to run db + backend + frontend together
├── docs/                   Business blueprint, UI design spec, architecture notes
├── database_architecture.md  Original DB design proposal (see docs/ARCHITECTURE.md for what changed)
├── security_architecture.md  Original security proposal (see docs/SECURITY.md for what changed)
├── admin_architecture.md     Original admin panel proposal (see docs/ADMIN.md for what changed)
├── tools/                  Offline data-integrity + page smoke tests
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

Every list/detail page renders from data embedded in the page — no server required to look around:

```bash
cd frontend/public && npx serve .    # or: python -m http.server 8000
```

Opening `frontend/public/index.html` directly in a browser also works. Contact/enquiry/newsletter
forms will just fall back to a local confirmation if no backend is running (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why that's the deliberate design).

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

| Page | File | What it does |
|---|---|---|
| Homepage | `index.html` | Hero + search, stats, how-it-works, featured pandits, popular temples, services, festivals, testimonials |
| Temple Directory | `temples.html` | Search + sidebar filters (city, state, service, rating), sort, pagination |
| Temple Detail | `temple-detail.html?id=` | Banner, gold tabs (Overview / Pandits / Services / Reviews / Location), inquiry sidebar |
| Pandit Directory | `pandits.html` | Filters by city, service, language, experience, rating, verified |
| Pandit Profile | `pandit-profile.html?id=` | Gold-ring photo, verified badge, WhatsApp/Call, services, temples, credentials, video intro, availability, reviews, QR |
| Services | `services.html` | Bento grid of 32 rituals, category pills, live search |
| Service Detail | `service-detail.html?id=` | Description, samagri list, best muhurat, pandits and temples for it |
| Panchang | `panchang.html` | Today's tithi/nakshatra/yoga/karana, Rahu Kaal, muhurat finder, month calendar with festivals |
| Temple Map | `temple-map.html` | Interactive India map, markers from real lat/lng, filter by state/service |
| AI Pooja Guide | `ai-recommender.html` | Chat-style recommender, Hindi or English |
| Blog | `blog.html` | Category pills, search, featured post |
| Pandit Dashboard | `dashboard.html` | Overview KPIs, profile, services & availability, reviews, analytics, subscription tiers |
| About | `about.html` | Mission, verification process, us-vs-them table, revenue model stated openly |
| Contact | `contact.html` | Form + FAQ accordion |

All paths above are relative to `frontend/public/`.

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

`frontend/public/assets/js/data.js` is the single source of truth for all content (temples, pandits,
services, festivals, reviews, blog posts, panchang, plans, FAQs). Everything else is generated from
it, never hand-edited:

```
data.js  →  backend/src/data/*.json  →  backend/src/db/02-seed.sql  →  Postgres tables
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
photo is missing. That is why the site looks complete right now with zero photos. To use real
pictures, drop files with these exact names into `frontend/public/assets/img/` — no code change needed.

**`frontend/public/assets/img/temples/`** — landscape, ideally 1200×750 or larger:

```
hero.jpg              ← the big homepage hero (use a wide 16:9 shot)
kashi-vishwanath.jpg   mahakaleshwar.jpg    haridwar.jpg
banke-bihari.jpg       ram-mandir.jpg       tirumala.jpg
jagannath.jpg          meenakshi.jpg        trimbakeshwar.jpg
dwarkadhish.jpg        kamakhya.jpg         siddhivinayak.jpg
chhatarpur.jpg         govind-devji.jpg
```

**`frontend/public/assets/img/pandits/`** — square, 600×600 or larger:

```
ramesh-sharma.jpg      devdatt-shastri.jpg   naman-tiwari.jpg
suresh-joshi.jpg       anand-iyer.jpg        mohan-das.jpg
gopal-chaturvedi.jpg   vikas-upadhyay.jpg    srinivas-rao.jpg
harish-bhatt.jpg       bipul-goswami.jpg     kailash-mishra.jpg
satish-dubey.jpg       mahesh-vyas.jpg       raghav-pathak.jpg
lakshman-acharya.jpg
```

Filenames come from each record's `id` in `data.js` — add a temple or pandit there (then `npm run seed`)
and its photo filename follows the same pattern.

---

## Choosing your hero (the three options from the design doc)

`index.html` currently uses **Option A** — temple full-bleed with a white→gold transparent panel on
the right. To switch, add one class to the `<section class="hero">` tag:

| Option | Class to add | Look |
|---|---|---|
| **A** (current) | *none* | Temple full width, translucent panel on the right |
| **B** | `hero--frosted` | Frosted-glass panel on the left, temple on the right |
| **C** | `hero--center` | Centred floating glassmorphism search card, white fade from the bottom |

```html
<!-- Option B -->
<section class="hero hero--frosted">
```

---

## Design system

Tokens live at the top of `frontend/public/assets/css/style.css` as CSS custom properties, matching
the design doc:

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
loaded from Google Fonts with a system fallback stack, so the site still looks right offline.

Icons are a hand-built line-art set in `PC.iconPaths` (`data.js`), drawn with `currentColor` so gold
theming is automatic. Hindu-specific icons included: Om, Diya, Kalash, Trishul, Lotus, Temple.

---

## Frontend code structure

```
frontend/public/assets/js/data.js     All content + the icon set — single source of truth.
frontend/public/assets/js/api.js      Thin client for write-actions (contact/enquiry/newsletter).
frontend/public/assets/js/app.js      Shell (header, drawer, bottom nav, footer), shared components.
frontend/public/assets/js/pages.js    One controller per page, keyed by <body data-page="...">.
frontend/public/assets/css/style.css  Design tokens + every component. No framework.
```

Pages are plain HTML with empty containers; controllers fill them on `DOMContentLoaded`.
To add a page: create the HTML with `data-page="foo"` and register `PC.pages.foo`.

---

## Tests

```bash
npm install        # once, at repo root — installs jsdom for the smoke test
npm test            # runs all three layers below in sequence
```

| Layer | Command | What it checks |
|---|---|---|
| Data integrity | `npm run test:data` (`tools/validate.js`) | Cross-references, unique ids, icon names, map coordinates, missing assets, page→controller mapping, **frontend/backend seed drift** |
| Frontend smoke | `npm run test:smoke` (`tools/smoke.js`) | Boots all 14 pages (+ deep links) in jsdom — fails on any console error, empty container, `undefined` in output, or dead internal link |
| Backend API | `npm run test:backend` (`backend/npm test`) | Every route, filter, validation error and 404 — Node's built-in test runner |

`tools/mobile-frame.html` renders pages inside fixed-width iframes for phone-width screenshots —
Chrome's window has a ~500px minimum on Windows, so `--window-size=390` alone never gives a true
phone viewport.

---

## Known placeholders

Honest list of what is not yet real, so nothing surprises you later:

- **Phone numbers** are placeholders (`+9190000001xx`). The WhatsApp and Call buttons build correct
  `wa.me` / `tel:` links, so they will work the moment you put real numbers in `data.js`.
- **The AI Pooja Guide is rule-based, not an LLM.** It keyword-matches a rule table entirely
  client-side (and the same table is exposed at `POST /api/recommend`), and the page says so
  plainly. The current version has the advantage of working offline and never sending a user's
  problem anywhere.
- **Panchang figures are static sample values.** Real panchang needs an ephemeris calculation per
  location — the page states that the numbers are indicative. Wire an API (e.g. ProKerala,
  VedicRishi) into `PC.panchang` / `backend/src/data/panchang.json` when ready.
- **The India map outline is a hand-simplified silhouette**, not a survey-accurate boundary. Markers
  use each temple's real latitude and longitude, so relative positions are correct. For production,
  drop Leaflet + a GeoJSON layer into `PC.pages.map`.
- **Temple/pandit imagery is SVG artwork** until you add the photos listed above.
- **`dashboard.html` still shows illustrative numbers and has no login form.** The backend behind it
  is real — `POST /api/auth/register-pandit` + `POST /api/auth/login` issue a working bearer session,
  and `GET /api/me/dashboard` returns that pandit's actual KPIs (views, clicks, pending inquiries,
  subscription status) — but nothing in `frontend/` calls them yet. Wiring the page up is a frontend
  task, not a backend one.
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
- Frontend loads no external JS or CSS beyond Google Fonts — no framework, no bundler, no tracking.
