# Running the whole stack locally with Docker

Frontend + backend + Postgres + admin panel, one command.

## 1. Prerequisites

```bash
docker compose version      # must be >= 2.24 (the override uses the !override tag)
```

## 2. Environment

A `.env` has already been generated for you at the repo root with a random
`ENCRYPTION_KEY` and `ADMIN_SECRET_PATH`. It is gitignored. Check your admin
path with:

```bash
grep ADMIN_SECRET_PATH .env
```

Optional keys (`OPENAI_API_KEY`, `RAZORPAY_*`, `GOOGLE_*`) can stay blank —
the site runs fine without them; only those specific features are disabled.

## 3. Start

```bash
docker compose up -d --build
```

`docker-compose.override.yml` is picked up automatically and adapts the
production compose file for a laptop: plain HTTP on **:8080**, no TLS
certificates required.

| Surface | URL |
|---|---|
| Website | http://localhost:8080 |
| Pandit login | http://localhost:8080/pandit-login |
| Pandit dashboard | http://localhost:8080/pandit/dashboard |
| Admin panel | http://localhost:8080/admin-panel |
| API (direct) | http://localhost:4000/api/health |
| Postgres | `localhost:5433`, db/user/pass `panditconnect` |

```bash
docker compose logs -f              # tail everything
docker compose logs -f backend      # OTPs are printed here (no SMS provider yet)
docker compose ps                   # health status
```

## 4. IMPORTANT — applying the new migration

`03-qualified-leads.sql` runs automatically **only against an empty data
directory**. If you already have a `db_data` volume from an earlier run,
Postgres skips all init scripts and you will get
`relation "qualified_leads" does not exist`.

**Fresh start (wipes the database):**

```bash
docker compose down -v
docker compose up -d --build
```

**Keep existing data — apply the migration (recommended):**

```bash
cd backend && npm run db:migrate
```

It is idempotent, prints the migration's own self-check, and fails loudly if
anything did not take. Equivalent by hand:

```bash
docker compose exec -T db psql -U panditconnect -d panditconnect \
  < backend/src/db/03-qualified-leads.sql
```

> **Symptom you are missing this migration:**
> `function get_pandit_lead_counts(unknown, unknown) does not exist`, an empty
> Lead Distribution page, or a pandit dashboard stuck at zero leads.

Verify:

```bash
docker compose exec db psql -U panditconnect -d panditconnect \
  -c "\dt qualified_leads" \
  -c "\df record_qualified_lead"
```

## 5. Create your first admin

There is no admin sign-up by design. Insert one, then log in — the panel walks
you through TOTP enrolment on first login and shows the QR secret once.

```bash
docker compose exec db psql -U panditconnect -d panditconnect -c \
  "INSERT INTO users (email, full_name, role, status, password_hash)
   VALUES ('admin@panditsuggest.local', 'Site Admin', 'super_admin', 'active',
           '\$2a\$10\$REPLACE_WITH_A_REAL_BCRYPT_HASH');"
```

Generate the hash first:

```bash
docker compose exec backend node -e \
  "console.log(require('bcryptjs').hashSync('YourAdminPassword123', 10))"
```

Then open http://localhost:8080/admin-panel and sign in.

## 6. Smoke test the new features

```bash
# 1. API is alive and the DB is connected
curl -s http://localhost:8080/api/health

# 2. A GUEST click must NOT create a qualified lead
curl -s -X POST http://localhost:8080/api/pandits/ramesh-sharma/click \
     -H 'Content-Type: application/json' -d '{"method":"call"}'
# expect: {"success":true,"contactAllowed":true,"interactionRecorded":true,
#          "qualifiedLead":false,"reason":"not_authenticated"}

# 3. Plans catalogue (drives the pandit Upgrade page)
curl -s http://localhost:8080/api/plans

# 4. Fairness order now reads qualified leads only
curl -s http://localhost:8080/api/pandits/ranked-order
```

Then, in the admin panel: **Pandits → Add New Pandit**, fill in the
*Pandit Login Credentials* section (email, temporary password, DOB) and pick a
plan. Log in as that pandit at `/pandit-login`.

## 7. Backend test suite

Needs the database running:

```bash
docker compose up -d db
cd backend
cp .env.example .env      # already points at localhost:5433
npm install
npm test
```

## 8. Stop

```bash
docker compose down          # keeps data
docker compose down -v       # wipes the database
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Missing required environment variable: ADMIN_SECRET_PATH` | no root `.env` — copy `.env.example` and fill the two required keys |
| frontend container exits immediately | you ran production compose; use `docker compose up` so the override applies, or check Compose is ≥ 2.24 |
| `relation "qualified_leads" does not exist` | pre-existing volume — see §4 |
| `/pandit/dashboard` 404s on refresh | nginx SPA fallback missing — confirm `local.conf` is mounted (`docker compose exec frontend cat /etc/nginx/conf.d/default.conf`) |
| port 8080 busy | change the mapping in `docker-compose.override.yml` and `CORS_ORIGIN` to match |
| OTP never arrives | expected — no SMS provider is wired; read it from `docker compose logs backend` |
