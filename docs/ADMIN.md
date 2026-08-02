# Admin panel

What's actually implemented, adapted from `admin_architecture.md` (kept at the repo root as the
original proposal) — same spirit as `database_architecture.md`/`security_architecture.md` and their
companion docs: understand the proposal, keep what's real for this app, don't build unused
scaffolding, and fix what's actually wrong rather than transcribing it. This is a **backend-only**
implementation — the proposal is Express routes and a dashboard mockup, not a frontend, and this repo
has no admin UI pages; building one would be a separate, much larger project.

## Where it actually lives

Only `/api/*` reaches this backend at all — nginx serves the static frontend for everything else and
never forwards a bare `/admin` hit here (see `docker/nginx/default.conf`). So "the secret URL" is
`/api/<ADMIN_SECRET_PATH>/...` (default `ambitious-person`, configurable via env), not a top-level
route the way the proposal shows it. The honeypot paths (`middleware/honeypot.js`) are registered
under `/api/` for the same reason — a scanner hitting the public site's bare `/admin` never gets far
enough to trip them; one hitting `/api/admin` does.

**This is obscurity, not access control.** The real gate is `requireAdmin`/`requireSuperAdmin`
(password + TOTP + a real session) and Row-Level Security underneath it — changing
`ADMIN_SECRET_PATH` doesn't change what anyone can do, only how easily they find where to try.

## Auth: 2-step login with real TOTP

`POST <secret>/auth/login` (email + password) → `POST <secret>/auth/login/verify` (TOTP code).
Deliberately not JWT-based — see `docs/SECURITY.md` "Why not JWT"; admin sessions are the same
opaque-bearer-token-plus-sha256-hash design as regular user sessions, just in their own table
(`admin_sessions`) so the two are never confusable and can be revoked independently.

**TOTP is hand-rolled** (`backend/src/utils/totp.js`), not `speakeasy` (unmaintained for years) — RFC
6238 on top of Node's built-in `crypto.createHmac`, verified against an independent reference
computation and against RFC 4648's base32 test vectors when it was written. Works with Google
Authenticator, Microsoft Authenticator, Authy, 1Password, etc. — anything that speaks `otpauth://`.

**First login sets TOTP up in the same flow**, rather than a separate "enable MFA" step: step 1
generates a new secret and returns it (`setup.secret` + `setup.otpauthUrl`) alongside the challenge
token if the account has no TOTP yet; step 2 only makes that secret permanent
(`users.totp_secret_encrypted`, AES-256-GCM via `backend/src/utils/crypto.js`) once a real code from
it verifies — proving the admin actually captured it in an authenticator app, not just that the
server generated one.

**Bootstrapping the first admin.** The app can't create its own first admin — `POST
<secret>/security/admin-users` requires an existing `super_admin`. Insert one directly as the
Postgres bootstrap superuser:

```sql
INSERT INTO users (email, password_hash, full_name, role, status)
VALUES ('you@example.com', '<bcrypt hash>', 'Your Name', 'super_admin', 'active');
```

Generate the bcrypt hash with `node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"`
from `backend/`. After that, `POST <secret>/security/admin-users` (super_admin only) creates the rest.

## Row-Level Security, extended for admin visibility

The public-facing RLS policies (`docs/ARCHITECTURE.md` → "Auth & Row-Level Security") only ever let a
request see its own rows. The admin panel legitimately needs to see and manage *everyone's* — solved
with a `current_app_user_is_admin()` SQL function (SECURITY DEFINER, for the same reason
`auth_find_user_by_email()` is — checking your own admin-ness by reading `users` inside a `users`
policy would otherwise recurse into itself) and `_admin`-suffixed policies on the same six RLS-scoped
tables (`users`, `pandits`, `inquiries`, `notifications`, `pandit_analytics`, `payment_transactions`).

Every admin route runs its whole body inside one transaction with that context set —
`middleware/admin.js`'s `adminHandler(fn)` wraps a controller in
`withUserContext(req.adminUser.id, ...)` and hands it `req.db`, the context-bound query function.
**Use `req.db(...)`, not `query(...)`, anywhere an admin route touches one of those six tables** — the
`_admin` policies only apply to `panditconnect_app` when `app.current_user_id` is actually set,
exactly like every other RLS policy in this schema. Plain `query()` is still fine for everything else
(temples, services, reviews, blog_posts, festivals, ... — none of those have RLS).

One sharp edge this surfaced twice while building the admin repositories: `req.db` is one shared
client for the whole request (it has to be, for `SET LOCAL` to apply) — running multiple queries
against it with `Promise.all` silently serializes them today (with a deprecation warning that says
it won't stay silent), so every admin repository function runs its queries sequentially instead.

## Honeypot logging and IP bans — both deliberately less aggressive than proposed

The proposal auto-bans any IP that hits a honeypot path, and hard-blocks a banned IP everywhere,
including the admin panel itself. Both were toned down after actually trying them:

- **Honeypot hits are logged (`honeypot_logs` + `security_audit_log`), never auto-banned.** A single
  hit from a shared or dynamic IP is exactly as likely to be a bored visitor typing `/admin` out of
  habit as an actual scanner, and this app has no appeals process for a wrongly-banned IP. Review
  `GET <secret>/security/honeypot-logs` and ban deliberately (`POST <secret>/security/ban-ip`) if a
  pattern actually looks malicious.
- **A ban never blocks the admin panel itself.** Found by actually banning a test IP: `checkIpBan`
  applied globally locked that IP out of `POST <secret>/security/ban-ip/:ip` (the unban endpoint) too,
  with no way back except a direct database edit. `middleware/ipBan.js` now exempts everything under
  `/api/<secret>/` — it's already behind a much stronger gate (password + TOTP) than an IP check, and
  exempting it is exactly the recovery path a mistaken ban needs. Same "no unrecoverable lockouts"
  principle as the admin session IP-pinning below.
- **Admin session IP changes are logged, not enforced.** The proposal force-logs-out a session the
  moment its IP changes. This app has no account-recovery flow, so a hard IP-lock could permanently
  brick the one admin account over an ordinary mobile-network IP change — logged to
  `security_audit_log` as `ADMIN_SESSION_IP_CHANGE` instead (`middleware/admin.js`).
- **Device fingerprinting isn't implemented as a trust gate at all.** Hashing User-Agent +
  Accept-Language + IP is trivially spoofable and breaks on any IP change — it would add a false
  sense of security, not real security. Session IP/user-agent are still recorded for the audit trail
  (`GET <secret>/security/active-sessions`), just not used to block anything.

Also worth knowing if you're testing IP bans by hand or reading `req.ip` anywhere new: Node/Express
reports an IPv4 connection inside Docker's bridge network as an IPv4-mapped IPv6 address
(`::ffff:172.20.0.1`), which Postgres treats as a different address than plain `172.20.0.1` for `INET`
equality. `middleware/normalizeIp.js` strips that prefix once, globally, right after `helmet`/`cors`,
so every consumer — the ban check, honeypot/audit logging, session IP recording — compares and
stores the same canonical form. Found by banning an IP and watching the ban silently not apply.

## Rate limiting

`POST <secret>/auth/login` and `.../login/verify` are rate-limited (`middleware/security.js`'s
`authLimiter`, keyed by IP + email) the same way the regular `/api/auth/*` endpoints are — brute
force doesn't stop mattering just because TOTP is also required.

## What's implemented

All 13 modules from the proposal, backed by the schema that already existed (nothing here needed new
content tables — `admin_activity_log`, `admin_sessions`, `admin_mfa_challenges`, `honeypot_logs`,
`banned_ips`, `platform_settings` are the only new tables, all in `01-schema.sql`'s "Module 14"):

| Module | Routes file | Notes |
|---|---|---|
| Dashboard | `routes/admin/dashboard.routes.js` | Real aggregate counts, no illustrative numbers |
| Users | `users.routes.js` | List/detail/update/suspend/ban/delete; role changes require super_admin |
| Pandits | `pandits.routes.js` | Verification queue/approve/reject, featured toggle, manual subscription grant, per-pandit analytics |
| Temples | `temples.routes.js` | CRUD, timings, pandit mapping — no CSV bulk import (see below) |
| Services | `services.routes.js` | Categories + services + samagri CRUD |
| Reviews | `reviews.routes.js` | List/flagged/moderate/bulk-moderate |
| Inquiries | `inquiries.routes.js` | Cross-pandit admin view (vs. `/api/me/inquiries`'s per-pandit inbox) |
| Subscriptions & payments | `subscriptions.routes.js` | Plans CRUD, manual grants, payment list/detail/refund, revenue overview |
| Content | `content.routes.js` | Blog CRUD + publish/unpublish |
| Community | `community.routes.js` | Post/comment moderation |
| Panchang & festivals | `panchang.routes.js` | CRUD for both |
| Notifications | `notifications.routes.js` | Send/broadcast (by role/city/state)/history |
| Security & audit | `security.routes.js` | Audit log, admin activity log, honeypot logs, IP bans, active sessions, force-logout-all (super_admin), admin user management (super_admin) |
| Analytics | `analytics.routes.js` | Overview, top pandits/temples/services/cities, conversion funnel |
| Settings | `settings.routes.js` | `platform_settings` key-value store; writes require super_admin |

## Deliberately not implemented, and why

- **CSV bulk import** (temples, panchang) — no admin UI exists to drive a file picker through, and
  building CSV parsing/validation for a feature nothing calls yet is exactly the "unused scaffolding"
  this pass tries to avoid.
- **PDF/Excel report generation** — needs a reporting library for a feature with no current consumer;
  the underlying data is already reachable via the analytics/revenue JSON endpoints.
- **A media library / file upload endpoints** — there is no file upload feature anywhere in this
  backend (see `docs/SECURITY.md`); temple/pandit photos are static assets committed to the repo.
  Nothing to manage.
- **SEO manager, sitemap regeneration** — the frontend is a static multi-page site with no dynamic
  meta-tag system to manage.
- **Email template management** — no mail provider is configured anywhere in this project.
- **Fake-review fraud detection** — the proposal's version compares reviews by IP/device, but nothing
  in this schema captures a review's submitting IP today; building that instrumentation is a bigger
  change than adapting an admin endpoint for it.
- **Automatic honeypot banning, hard IP-session-pinning, device fingerprinting** — see above.

## Testing

`backend/tests/admin.test.js` covers the full login flow (including first-time TOTP setup),
RLS-scoped admin visibility, a few representative moderation actions, the super_admin gate, and the
IP-ban-exempts-the-admin-panel behavior. It inserts its own throwaway admin account directly (the
same bootstrap step described above) rather than reusing the seeded `admin@panditconnect.demo`
account, whose TOTP-enabled state depends on whatever was last done to it — including by hand, while
building this feature.

`package.json`'s test script runs with `--test-concurrency=1`. Found necessary the hard way: this
suite hits one real, shared Postgres database (no mocking, same as the rest of this project's
tests), and one test bans `127.0.0.1` — every test file's HTTP client — for a few milliseconds to
verify the ban actually blocks the public API. Running files in parallel meant that ban intermittently
403'd unrelated requests from `api.test.js` running at the same moment.
