# Security

What's actually implemented, adapted from `security_architecture.md` (kept at the repo root as the
original 16-layer proposal) — and, just as importantly, what was deliberately left out because it
doesn't match this project's real infrastructure, or would replace something already built and tested
with a rough equivalent for no real gain. Same spirit as `database_architecture.md` →
`docs/ARCHITECTURE.md`'s "The database" section: understand the proposal, keep what's real, don't
build unused scaffolding.

## Implemented

- **Password hashing** — bcrypt (`backend/src/controllers/auth.controller.js`), 10 rounds.
- **Sessions** — opaque bearer tokens (`crypto.randomBytes(32)`), only their sha256 hash stored
  server-side (`user_sessions.token_hash`). See "Why not JWT" below.
- **Row-Level Security + a dedicated non-owner app role** — the actual access-control layer; see
  `docs/ARCHITECTURE.md` → "Auth & Row-Level Security". This subsumes what the proposal's Layer 2
  (RBAC permission maps) was reaching for, enforced at the database itself rather than in app code
  that every new route has to remember to call.
- **Parameterized queries everywhere** — `backend/src/repositories/*.repository.js` never
  string-concatenates user input into SQL; this was already true before this pass, nothing to add.
- **Rate limiting** — `backend/src/middleware/security.js`, via `express-rate-limit`: a generous
  global limiter (600 req/15min) plus a stricter one keyed by IP+email/target on
  `/auth/register`, `/auth/register-pandit`, `/auth/login`, `/auth/otp/*`. In-memory store — fine for
  this single-backend-instance deployment; a multi-instance deployment would need a shared store
  (Redis), same as the proposal called for, just not needed yet.
- **Security headers** — `helmet` (`backend/src/app.js`), with `contentSecurityPolicy` off (this is a
  JSON API with no HTML views — a page-oriented CSP protects nothing here) and
  `crossOriginResourcePolicy` relaxed to `cross-origin` (the default would break the README's
  supported "frontend on :8080 calling the backend directly on :4000, no nginx proxy" setup).
- **Webhook signature verification** — `backend/src/controllers/payments.controller.js`, HMAC-SHA256
  with `crypto.timingSafeEqual`, over the raw request bytes (see `app.js`'s raw-body carve-out for
  that one route) — built in the same pass as the payments schema, this is the proposal's Layer 8
  done as specified.
- **Security audit log** — `security_audit_log` table (`01-schema.sql`), append-only: the app role
  can `INSERT` but `UPDATE`/`DELETE` are explicitly revoked, even though it owns everything else it
  touches. `backend/src/utils/securityLog.js` writes to it on failed logins, rate-limit rejections,
  and invalid webhook signatures. No email/Slack alerting (see "Not implemented" below) — query the
  table directly, or watch `docker compose logs backend` for the same events.
- **OTP generation/verification** — already real (hashed, expiring, attempt-limited) from the
  previous pass; "delivery" is a `console.log`, not a real SMS/email provider (see README "Known
  placeholders").
- **Right to erasure & portability** — `DELETE /api/me` (soft-delete + anonymize email/phone/name +
  revoke every session) and `GET /api/me/export` (profile, reviews, inquiries, saved items,
  community posts/comments as one JSON document), both in `backend/src/repositories/auth.repository.js`
  (`softDeleteAccount`, `exportAccountData`) and wired at `/api/me`.

## Why not JWT + Redis-backed refresh rotation

The proposal's Layer 1.2 is a solid pattern, but it solves a problem this app doesn't have yet:
stateless auth for horizontally-scaled, multi-instance deployments. This backend is one Express
process. A DB-backed opaque token gets the properties that actually matter — the raw token is never
stored (only its hash, so a database leak doesn't hand out working sessions) and a session can be
revoked on demand (`user_sessions.revoked_at`) — without needing two secrets, a refresh endpoint, or
reasoning about token-reuse detection. If this ever needs to scale horizontally, the existing
`user_sessions` table is the natural place to add device-scoped tokens; it doesn't need to become JWT
to do that.

## Not implemented, and why

- **MFA/TOTP for admin accounts** — no admin panel UI exists to protect.
- **OAuth (Google/Facebook)** — no OAuth app credentials configured and no frontend flow to initiate
  it; `users.google_id`/`facebook_id` columns already exist in the schema for when there is one.
- **CSRF protection** — genuinely not applicable, not just skipped. CSRF exploits *ambient* browser
  credentials (cookies sent automatically on cross-site requests); this API authenticates via an
  `Authorization: Bearer` header that a malicious page can't make the browser attach on its behalf.
  Adding the proposal's cookie-based CSRF middleware would defend against an attack this design
  doesn't have a surface for.
- **Field-level AES-256-GCM encryption** (Layer 5.1) — the one column it was proposed for,
  `pandits.id_proof_number_hash`, has no write path yet (no KYC upload flow exists) and is named as a
  one-way hash, not reversible ciphertext, in the schema it was adapted from. Nothing to encrypt yet.
- **File upload security** (Layer 6: multer, sharp, magic-byte checks, ClamAV) — there is no file
  upload endpoint anywhere in this backend; temple/pandit photos are static assets committed to the
  repo (see README "Adding your real temple & pandit photos"), not user-uploaded via the API. This
  layer protects a feature that doesn't exist.
- **Cloudflare/WAF, nginx TLS termination, Linux server hardening** (Layers 10.1, 10.2, 5.2) — this
  runs in Docker Compose on localhost, not on a provisioned server behind a domain. All of this
  applies once it's actually deployed somewhere with a hostname and a certificate, not before.
- **Redis-backed distributed rate limiting** — see "Implemented" above; in-memory is the right choice
  at one instance, and premature to add Redis as a dependency for it now.
- **Real-time email/Slack security alerts** — no mail service or Slack webhook is configured anywhere
  in this project; the audit log is the alerting mechanism for now (query it, or tail the backend
  logs), consistent with how OTP delivery and the payment gateway are handled elsewhere.
- **CI/CD security pipeline** (Layer 16: SAST/DAST/Snyk/GitLeaks/Trivy) — there's no CI configured in
  this repo at all yet (`.github/workflows` doesn't exist); wiring one up is a separate, larger piece
  of work than adapting this doc. `npm audit` (zero vulnerabilities as of this pass) is a reasonable
  first step to add to a CI job whenever one exists.
- **Legal compliance certification** (Layer 15: DPDP Act, IT Act, privacy policy pages, a Grievance
  Officer) — the *mechanical* pieces a codebase can actually provide (data export, account deletion)
  are implemented above. Privacy policy copy, cookie consent UX, and an actual compliance sign-off are
  business/legal decisions no amount of code can certify on their own.
- **The proposal's `limit_result_set()` trigger** (Layer 10.3) — not implementable as written: it's
  declared `AFTER ... ON` with `TG_OP = 'SELECT'`, but Postgres triggers cannot fire on `SELECT` at
  all (only `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`). Row-volume limiting for non-admins would need to
  happen in application code (e.g. this app's existing pagination — see `readPaging`/
  `paginationEnvelope` in `backend/src/utils/paginate.js`, which every list endpoint already goes
  through) or via `statement_timeout` set per-role, not a trigger.

## OWASP Top 10 — actual coverage

| # | Threat | This app |
|---|---|---|
| 1 | Broken Access Control | Row-Level Security (see `docs/ARCHITECTURE.md`), enforced at the DB, not just in route middleware |
| 2 | Cryptographic Failures | bcrypt for passwords, sha256 for session/OTP tokens, HMAC-SHA256 for webhooks — no reversible "encryption" where a one-way hash is what's actually needed |
| 3 | Injection | Parameterized queries throughout; no string-built SQL anywhere |
| 4 | Insecure Design | RLS policies were rewritten against actual failure modes found by running the app, not assumed correct from a template (see `docs/ARCHITECTURE.md`) |
| 5 | Security Misconfiguration | Helmet headers, `NODE_ENV`-gated stack traces (`errorHandler.js`), no default-open CORS |
| 6 | Vulnerable Components | `npm audit` clean as of this pass; no automated recurring scan yet (no CI) |
| 7 | Auth Failures | bcrypt, rate-limited login/register/OTP, revocable sessions, audit-logged failures |
| 8 | Data Integrity Failures | Webhook HMAC verification with `timingSafeEqual` |
| 9 | Security Logging Failures | `security_audit_log`, append-only |
| 10 | SSRF | No user-controlled outbound URLs anywhere in this backend (the one outbound call, to Razorpay, has a hardcoded URL) |
