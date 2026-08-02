# Architecture

How PanditConnect is put together, and *why* — for whoever opens this repo next.

---

## Layout

```
maa-baglamukhi-project/
├── frontend/                  Static multi-page site (no framework, no build step)
│   ├── public/                 Served as-is — this is the web root
│   │   ├── *.html               14 pages
│   │   └── assets/
│   │       ├── css/style.css     Design tokens + every component
│   │       ├── js/
│   │       │   ├── data.js        Embedded content: temples, pandits, services... (source of truth)
│   │       │   ├── api.js         Thin client for write-actions (contact/enquiry/newsletter)
│   │       │   ├── app.js         Shell: header/drawer/footer, shared card components, helpers
│   │       │   └── pages.js       One controller per page, keyed by <body data-page="...">
│   │       └── img/               Hand-built SVG artwork + photo drop-in folders
│   └── Dockerfile
│
├── backend/                   Express REST API, Postgres-backed
│   ├── src/
│   │   ├── db/                   01-schema.sql, 02-seed.sql — run automatically by the postgres
│   │   │                         image on first start (docker-entrypoint-initdb.d)
│   │   ├── data/                 JSON seed files, generated FROM frontend's data.js (intermediate
│   │   │                         step before SQL — see "Keeping three data copies in sync" below)
│   │   ├── config/db.js          pg Pool (DATABASE_URL)
│   │   ├── repositories/          All SQL lives here — one file per domain, controllers never
│   │   │                         touch `pg` directly
│   │   ├── routes/ · controllers/ · middleware/
│   │   ├── app.js · server.js    server.js closes the pool gracefully on SIGTERM/SIGINT
│   │   └── scripts/ (via backend/scripts/)
│   ├── scripts/
│   │   ├── sync-seed-data.js      frontend data.js → backend/src/data/*.json
│   │   ├── generate-seed-sql.js   backend/src/data/*.json → backend/src/db/02-seed.sql
│   │   └── init-db.js             applies 01-schema.sql + 02-seed.sql to any DATABASE_URL
│   ├── tests/                    node:test, run against a real Postgres — no mocking layer
│   └── Dockerfile
│
├── docker/
│   └── nginx/default.conf     Serves the static frontend + reverse-proxies /api/ to the backend
├── docker-compose.yml         Root-level by convention, so `docker compose up` just works
│                              Services: db (Postgres 16) → backend → frontend, in that dependency order
│
├── docs/                      This file, the two design/business source docs, and their status
├── tools/                     Node scripts that test the frontend without a browser test runner
└── package.json                Root: dev-only scripts (test, seed, docker:*) — no runtime code
```

---

## Why the frontend doesn't fetch the backend for browsing

Temple lists, pandit profiles, service details — everything a visitor *reads* — ships embedded in
`data.js` and renders instantly with zero loading spinners, zero waterfall requests, and it still
works if someone opens `index.html` directly from disk with no server (or database) running at all.

Only **write-actions** go over the network: sending a temple inquiry, a pandit enquiry, the contact
form, and the newsletter signup. Each call in `assets/js/api.js` fails soft — if the backend isn't
reachable, the page falls back to its original local-only confirmation instead of breaking. This
was a deliberate trade-off, not an oversight: it keeps the directory itself simple, fast and
resilient, while still giving the backend (and now Postgres) a genuine job — recording who wants to
reach whom — rather than being an empty scaffold.

If you outgrow this — user accounts, live pandit-submitted data, admin moderation — the natural next
step is for `pages.js` to fetch from the backend's `GET` endpoints (which already query Postgres and
are tested) instead of reading `PC.temples` / `PC.pandits` directly, with `data.js` kept only as an
offline fallback.

## Keeping three copies of the data in sync

Content — temples, pandits, services, festivals, reviews, blog posts, panchang, plans, FAQs — has
exactly **one** source of truth: `frontend/public/assets/js/data.js`. Everything downstream of it is
generated, never hand-edited:

```
data.js  →(sync-seed-data.js)→  backend/src/data/*.json  →(generate-seed-sql.js)→  02-seed.sql  →(postgres init)→  tables
```

```bash
cd backend && npm run seed    # runs both generation steps in sequence
```

`tools/validate.js` checks all three links in that chain haven't drifted:
- `data.js` vs `backend/src/data/*.json` (a JSON.stringify diff)
- `backend/src/data/*.json` vs `02-seed.sql` (a sha1 content-hash embedded in the SQL file's header)

If someone edits `data.js` and forgets to regenerate, `npm test` fails with exactly which file is
stale and which command fixes it.

## Why docker-compose.yml lives at the repo root, not in docker/

Keeping it where `docker compose up` finds it with no `-f` flag is worth more than tidiness. The
`docker/` folder holds the one piece of config actually shared between services — the nginx reverse
proxy — plus this doc.

Both Dockerfiles build with the **repo root** as context (not their own folder), specifically so
`frontend/Dockerfile` can `COPY docker/nginx/default.conf` and `backend/Dockerfile` can be built the
same way for consistency. See the comments at the top of each Dockerfile.

## The database

Postgres 16 + PostGIS, one schema (`backend/src/db/01-schema.sql`), ~40 tables. This was rewritten
from a flat 20-table directory schema into a normalized, UUID-keyed, auth-aware design — adapted from
`database_architecture.md` (kept at the repo root as the original design proposal), not a literal
transcription of it: a few things in that doc were fixed or deliberately dropped to keep it correct
and consistent with how this app actually runs. See the comments at the top of 01-schema.sql and
inline near each deviation for the specifics; the two biggest:

- **`inquiries.user_id` is nullable.** The frontend has no login UI yet, and temple/pandit enquiry
  forms are submitted anonymously today — the proposal's schema assumed every enquiry came from a
  signed-in user, which would have broken the one write-path this app has always had.
- **Row-Level Security policies were rewritten, not copy-pasted.** The proposal's RLS list, taken
  literally, would have made the public pandit directory and the general reviews/community feed
  return zero rows once enforced against a real non-owner connection (see "Auth & Row-Level
  Security" below) — some tables had no SELECT policy at all, which under RLS means nobody can read
  them, not "policy not needed."

Broad shape:
- **Catalog** (public, read-heavy): `temples`, `pandits`, `services` + their media/timing/availability
  child tables, and the many-to-many join tables (`temple_services`, `pandit_services`,
  `pandit_temples`, `pandit_languages`, ...).
- **Auth**: `users` (one row per account — devotee, pandit, temple_admin, admin), `user_sessions`
  (bearer tokens, stored as a sha256 hash — see below), `otp_verifications`.
- **Engagement**: `reviews`, `inquiries`, `notifications`, `saved_pandits`/`saved_temples`,
  `community_posts`/`community_comments`, `blog_posts`, `ai_recommendations`.
- **Money**: `subscription_plans`, `pandit_subscriptions`, `payment_transactions` (Razorpay-shaped;
  see README "Known placeholders").
- **Analytics**: `pandit_analytics`, `platform_analytics`.
- **App-specific additions not in the original 37-table proposal**, kept because existing
  frontend pages/tests depend on them: `faqs`, `stats`, `taxonomy`, `recommend_rules`,
  `contact_messages`, `newsletter_subscribers`.

Triggers keep denormalized counters honest: a new review recalculates the target's
`avg_rating`/`review_count` (and, for pandits, `rank_score` via `calculate_pandit_rank()`); a
`pandit_temples` change recalculates the temple's `pandit_count`.

### Auth & Row-Level Security

The backend connects as `panditconnect_app`, **not** the bootstrap superuser (`panditconnect`) that
owns the schema — Postgres RLS policies never apply to a table's owner, so enforcing them for real
requires a different, unprivileged role. `01-schema.sql` creates both: the superuser runs
`01-schema.sql`/`02-seed.sql` on container init (via `docker-entrypoint-initdb.d`), and
`panditconnect_app` is what `DATABASE_URL` in `docker-compose.yml`/`.env.example` points at.

Sessions are opaque bearer tokens (`crypto.randomBytes(32)`), never JWTs — the raw token goes to the
client once, and only its sha256 hash is stored in `user_sessions.token_hash`, so a database leak
doesn't hand out working sessions. `backend/src/middleware/auth.js` looks a token up per request;
`backend/src/config/db.js`'s `withUserContext(userId, fn)` runs a block of queries inside a
transaction with `app.current_user_id` set via `SET LOCAL`, which RLS policies read through the
`current_app_user_id()` SQL function to decide "is this my own row." A few operations have a
chicken-and-egg problem — proving who's asking requires reading `users` before an identity exists to
gate that read with — solved the same way each time: a narrowly-scoped policy or a `SECURITY DEFINER`
function that only bypasses RLS for that one specific, already-otherwise-verified lookup shape (see
`auth_find_user_by_email()`, `users_select_by_bearer_session`, and
`payments_select_verified_webhook` in `01-schema.sql`).

Repository functions that touch an RLS-protected table (`users`, `pandits`, `inquiries`,
`notifications`, `pandit_analytics`, `payment_transactions`) accept an optional injected query
function (`q = query`) instead of always importing the plain pool query — callers that need RLS
context pass one bound to `withUserContext`/`withSetting`; anonymous/public callers don't. One sharp
edge worth knowing: `INSERT ... RETURNING` needs the new row to also satisfy a **SELECT** policy, not
just the INSERT one — an anonymous `inquiries` insert can't `RETURNING id` (no SELECT policy covers
an anonymous caller), so `temples.repository.addInquiry`/`pandits.repository.addEnquiry` generate the
id client-side instead and skip `RETURNING` entirely.

In Docker Compose, the `postgis/postgis:16-3.4-alpine` image runs `01-schema.sql` then `02-seed.sql`
automatically via `/docker-entrypoint-initdb.d/` — but **only against a freshly created, empty data
directory**. If you need to re-apply either file against a container that already has data (or a
Postgres that wasn't created by this compose file at all — a local install, a managed cloud
instance), use:

```bash
cd backend
DATABASE_URL=postgresql://<superuser>:...@host:5432/dbname npm run db:init
```

Data persists in the `db_data` named volume across `docker compose down` / `up`. To start over from
nothing: `docker compose down -v`.

The repository layer (`backend/src/repositories/*.repository.js`) is the only place SQL appears —
controllers call it and never see a query string. Every list endpoint builds its `WHERE` clause from
whichever filters were actually passed (parameterized, never string-concatenated) and paginates with
a `COUNT(*) OVER()` window function so one query returns both the page and the total.

## What's real vs. illustrative right now

| Real | Illustrative |
|---|---|
| All 14 pages, fully responsive | Phone numbers (`+9190000001xx` placeholders) |
| Backend API — 40+ endpoints, Postgres-backed, filtering, pagination, RLS-enforced, tested | Panchang figures (static sample, not an ephemeris calc) |
| Auth — register/login/logout, bearer sessions, OTP generation+verification | OTP "delivery" is a `console.log`, not a real SMS/email provider |
| Contact / enquiry / newsletter / reviews / community posts — persisted as real Postgres rows | `dashboard.html`'s numbers (the backend `GET /api/me/dashboard` behind it is real; the page isn't wired to call it yet) |
| Subscriptions/payments — full Razorpay order + webhook signature verification | No real Razorpay account configured (501s until test-mode keys are set) |
| Docker Compose (db → backend → frontend) — built, run, and curl-tested end to end | India map outline (hand-simplified silhouette; marker positions use real lat/lng) |
| AI Pooja Guide — real keyword-rule engine, both in-browser and as a backend endpoint (now logs every query to `ai_recommendations`) | Frontend still has no login form — `/auth/*` and `/me/*` are real but unreachable from the UI |

See the root `README.md` "Known placeholders" section for the full list and how to replace each one.
