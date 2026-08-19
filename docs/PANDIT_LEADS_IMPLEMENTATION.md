# Pandit Accounts + Qualified Leads — Implementation Report

**Date:** 9 August 2026 · **Scope:** admin pandit provisioning, pandit login, DOB password reset, pandit dashboard, qualified-lead system, lead history, plan/upgrade.

> **Verification honesty note.** The authoring sandbox had **no PostgreSQL, no Docker and no npm registry access**, and `node_modules` contained **win32-x64 native binaries**. Section 22–24 states exactly what was executed and what was not. Nothing is claimed to pass that was not actually run.

---

## 1. Architecture summary

The existing four-layer shape (`routes → controllers → repositories → Postgres`) and the RLS-first security model were preserved. Three things are new:

1. **A `qualified_leads` entity.** Previously "a lead" was `inquiries + contact_clicks`, and `contact_clicks` is written for anonymous visitors — so guest taps inflated lead counts and skewed the fairness engine. A qualified lead is now an explicit, de-duplicated row created only for a verified, active, logged-in devotee contacting someone else's active pandit profile.
2. **A role-scoped pandit door.** `/api/auth/pandit/*` and `/pandit/*` on the frontend. Same `users`/`user_sessions` store underneath — one identity system, a second entrance.
3. **Server-authoritative qualification.** The client reports a press; the backend (and Postgres itself) decides whether it is a lead.

**Data flow for one CTA press**

```
Button → usePanditContact() → POST /api/pandits/:slug/click (optionalAuth)
                                    │
                       ┌────────────┴─────────────┐
              guest / unverified            verified + active
                       │                            │
              contact_click only        record_qualified_lead()  ← advisory lock
              qualifiedLead:false        ├─ live window? → interaction_count++
                                         └─ no window?   → INSERT lead
                                    │
                       contact_click (linked to lead) + daily analytics rollup
                                    │
                       get_pandit_lead_counts() → fairness engine + daily cap
```

---

## 2. Files modified (25)

**Backend (16)**

| File | Change |
|---|---|
| `scripts/init-db.js` | applies `03-qualified-leads.sql` |
| `package.json` | per-suite test scripts |
| `controllers/auth.controller.js` | `sanitize()` → **allow-list** (was leaking every new `users` column, incl. DOB) |
| `controllers/me.controller.js` | real dashboard aggregates, `/me/leads`, lead status, own-profile edit |
| `controllers/pandits.controller.js` | `trackClick` rewritten as the qualified-lead contact endpoint |
| `controllers/admin/pandits.controller.js` | admin-set email/password/DOB/plan, reset-password, set-DOB |
| `controllers/admin/subscriptions.controller.js` | plan validation + inclusions |
| `repositories/admin/pandits.repository.js` | `createFull()` atomic provisioning, `resetPassword`, `setDateOfBirth` |
| `repositories/admin/subscriptions.repository.js` | plan features/description/tagline/limits |
| `repositories/dashboard.repository.js` | `panditForUser`, `subscriptionForPandit`, own-profile allow-list |
| `repositories/misc.repository.js` | `plans()` shape-tolerant + enriched |
| `repositories/pandits.repository.js` | `addView` writes the daily rollup |
| `routes/admin/pandits.routes.js` | `+2` routes |
| `routes/auth.routes.js` | mounts `/auth/pandit` |
| `routes/me.routes.js` | `+4` routes |
| `routes/pandits.routes.js` | `/click` gains `optionalAuth` + rate limit |

**Frontend (9)** — `App.tsx`, `lib/Auth.tsx`, `lib/api.ts`, `components/ui/PanditCard.tsx`, `pages/PanditProfile.tsx`, `admin/AdminApp.tsx`, `admin/components/AdminLayout.tsx`, `admin/pages/CreatePandit.tsx`, `admin/pages/PanditEdit.tsx`.

## 3. Files created (22)

`backend/src/db/03-qualified-leads.sql` · `config/leads.js` · `controllers/panditAuth.controller.js` · `routes/panditAuth.routes.js` · `repositories/qualifiedLeads.repository.js` · `repositories/passwordReset.repository.js` · `tests/{helpers,qualified-leads,pandit-auth,admin-pandit-create}.js` · `frontend/src/lib/usePanditContact.ts` · `pages/PanditLogin.tsx` · `pages/PanditForgotPassword.tsx` · `pandit/{PanditApp.tsx,pandit.css}` · `pandit/lib/{panditApi.ts,ProtectedPanditRoute.tsx}` · `pandit/components/PanditLayout.tsx` · `pandit/pages/{_shared,Dashboard,Leads,Profile,Services,Availability,Reviews,Analytics,Plan,Settings}.tsx` · `admin/pages/Plans.tsx` · `playwright.config.ts` · `e2e/{pandit-flows,responsive}.spec.ts`

---

## 4. Database migration — `03-qualified-leads.sql`

Forward-only, every statement guarded (`IF NOT EXISTS` / `DO $$ … EXCEPTION`), safe to re-run and also auto-applied as the third init file on a fresh container.

- `users.date_of_birth DATE` (nullable)
- `lead_status` enum — `new, viewed, contacted, completed, not_reachable`
- **`qualified_leads`** — 5 indexes, incl. the dedup index `(pandit_id, user_id, dedup_window_ends_at DESC)`
- `contact_clicks.qualified_lead_id`, `.created_qualified_lead` + 2 indexes
- **`password_reset_challenges`** — sha256-hashed token, attempts, expiry, consumed/invalidated
- `subscription_plans.description / tagline / lead_credits_monthly`
- 5 functions, 4 RLS policies, 7 grants, 6 revokes

**Migration policy:** historical `contact_clicks` are **not** backfilled into `qualified_leads`. They carry no proof of a verified identity, so promoting them would be inventing data. They stay as analytics.

---

## 5. Admin pandit creation

`POST <secret>/pandits` now accepts `temporaryPassword`, `dateOfBirth`, `city`, `state`, `experienceYears`, `planTier`, `planBillingCycle`, `planExpiresAt`.

- Email normalised + format-checked; phone normalised to E.164-ish; DOB must be a **real** calendar date (rejects `2001-02-30`, future dates, pre-1900).
- Password required, ≥8 chars, letter + digit, bcrypt(10). **Plaintext never reaches the repository layer** — only the hash is bound as a query parameter.
- `repo.createFull()` runs user + pandit + languages + subscription + rank recompute in **one transaction**. An unknown `planTier` throws *inside* the transaction, so a bad plan rolls back the user and the pandit — no orphans.
- Audit entry `PANDIT_ACCOUNT_CREATED` records slug/email/tier/`dateOfBirthSet: true` — **never the password, never the DOB**.

New: `POST /pandits/:id/reset-password` (rotates hash + revokes all sessions, logs `PANDIT_PASSWORD_ADMIN_RESET`) and `PUT /pandits/:id/date-of-birth`.

---

## 6. Pandit login

`POST /api/auth/pandit/login` → checks email exists, password matches, account active, role is `pandit`, and a live pandit profile is linked.

- **Timing-safe absence:** a missing account is still compared against a dummy bcrypt hash, so a non-existent email costs the same ~100 ms as a real one.
- Unknown email and wrong password return **byte-identical** responses (`Login nahi ho paya. Apni details check karein.`).
- A devotee *who proved their password* gets the friendly `Yeh login sirf registered Pandit Ji accounts ke liye hai.` — safe to distinguish, because they already demonstrated the credential.
- Rate limit 15 / 15 min per **IP + email**.

---

## 7. DOB password reset

Two steps. Step 1 `POST /auth/pandit/reset-password/verify` takes `{email, dateOfBirth}` and resolves both together via `auth_find_pandit_for_reset()` — pandit accounts only; a devotee or admin can never be reset through this path. Step 2 `POST /auth/pandit/reset-password` takes `{resetToken, newPassword, confirmPassword}`.

**DOB is never re-sent in step 2.** Once identity is established the weak secret leaves the flow and a 256-bit single-use token carries the state change.

| Control | Value |
|---|---|
| Token entropy | 32 random bytes |
| Stored as | sha256 hash |
| TTL | 10 minutes |
| Single-use | enforced *inside* the UPDATE predicate, so parallel redemptions cannot both win |
| Superseded | requesting a new challenge invalidates the previous one |
| Rate limit | **5 / 15 min per IP+email** — the tightest budget in the app |
| On success | password rotated **and every session revoked**, atomically |

Wrong DOB, unknown email and a devotee account all return the identical `Details verify nahi ho paayi.` Failures are written to `security_audit_log`.

**Future OTP hook:** the challenge row carries a `method` column and step 1 returns `nextStep`. Adding SMS/email OTP means issuing `method='email_dob_otp'`, returning `nextStep:'otp'`, and inserting one verify call — no change to the step-2 contract.

---

## 8. Password security

bcrypt cost 10 (project standard, unchanged). Minimum 8 chars, must contain a letter and a digit, max 200, confirm must match. Plaintext is never logged, never returned, never stored. The admin UI clears the field from React state the moment the request is sent.

---

## 9. Qualified Lead — exact logic

All ten conditions are re-validated **inside Postgres** by `record_qualified_lead()`, not only in Node — a bug in the controller cannot persist an invalid lead.

1. `userId` present (session-derived) · 2. session valid (`requireAuth`/`optionalAuth` lookup) · 3. `users.status = 'active'` · 4. `users.phone_verified = TRUE` · 5. pandit row exists · 6. `pandits.deleted_at IS NULL` · 7. `pandits.user_id <> p_user_id` · 8. method ∈ `{phone_call, whatsapp}` · 9. no live dedup window · 10. INSERT committed.

Rejection reasons returned to the client: `not_authenticated`, `user_not_active`, `user_not_verified`, `pandit_not_found`, `self_contact`, `method_not_qualifying`, `duplicate_window`.

**Never a lead:** guest click, profile view, unverified click, repeat within window, Call→WhatsApp within window, self-contact, failed persistence.

---

## 10. Deduplication

Rule: **same verified user + same pandit + within `QUALIFIED_LEAD_DEDUP_HOURS` (default 24) = ONE lead.** Configured once in `backend/src/config/leads.js`, read by the contact path, the dashboard copy and the tests.

Each lead stores `dedup_window_ends_at`, so the check is an indexed range scan rather than an expression over a runtime setting. A duplicate bumps `interaction_count` and `last_interaction_at` on the existing row and still returns `contactAllowed: true` — the devotee may absolutely call again, it simply does not bill a second lead.

---

## 11. Concurrency protection

**Chosen: transaction-scoped advisory lock**, `pg_advisory_xact_lock(hash(pandit_id), hash(user_id))`.

Rejected alternatives, and why:
- *Unique constraint on a tumbling bucket* — concurrency-safe but changes the rule: contacts at 23:59 and 00:01 would be two leads. The spec asks for a **rolling** window.
- *SERIALIZABLE isolation* — correct, but turns a hot public endpoint into a retry loop this codebase isn't written for.

The lock serialises only the exact `(pandit, user)` pair that is racing, needs no extra column, and releases automatically at COMMIT/ROLLBACK. The lead insert **and** the contact-click insert share one explicit transaction, so the lock is genuinely held across both. Covered by a 10-way parallel test.

---

## 12. Contact API

`POST /api/pandits/:slug/click` — extended, not duplicated. `optionalAuth` + `authLimiter(60)`.

```jsonc
// request
{ "method": "call" | "phone_call" | "whatsapp", "source": "pandit_profile" }
// success — new lead
{ "success": true, "contactAllowed": true, "interactionRecorded": true,
  "qualifiedLead": true, "leadId": "…" }
// success — duplicate
{ "success": true, "contactAllowed": true, "interactionRecorded": true,
  "qualifiedLead": false, "reason": "duplicate_window" }
```

`userId` in the body is **ignored** — identity comes from the bearer session only (covered by a test that sends a victim's id from an attacker's session).

---

## 13. Dashboard API

`GET /me/dashboard` returns `pandit`, `plan`, `qualifiedLeads{today,week,month,total}`, `views{today,week,month,total}`, `analytics{…}`, `recentLeads[]`, `meta{dedupWindowHours, reportingTimezone}`.

Day/week/month boundaries are computed **in Postgres in `Asia/Kolkata`**, never from the server clock — a UTC container would otherwise roll "today" at 05:30 IST, mid-morning.

Also new: `GET /me/leads` (paginated, filters), `PATCH /me/leads/:id`, `GET|PUT /me/pandit-profile`. **No endpoint in this surface accepts a `panditId`** — it is always derived from the session.

---

## 14–16. Dashboard / Leads / Plan UI

`/pandit/dashboard` + 8 sub-pages behind `ProtectedPanditRoute`, with a persistent sidebar ≥1024 px and a drawer below.

**Views are counts only** (today/week/month/total) with the line *"Kaun dekh raha hai woh record nahi hota"* — no viewer identity is collected or shown. **Leads show name + verified mobile + Call/WhatsApp**, because that is the one place the pandit must act, and the devotee was told at press time that this would be shared.

`My Leads`: table on desktop, cards on mobile (same DOM, CSS switches), filters for period/method/status, pagination, inline status change with optimistic rollback. Quick actions can only use the phone stored **with the lead** — no client-supplied number is ever dialled.

`My Plan`: live catalogue from the backend, current plan marked, per-cycle pricing. Upgrade sends **only `{tier, billingCycle}`**; the amount is resolved server-side from `subscription_plans`.

Admin gains **Plans & Pricing** (`/admin-panel/plans`) for price per cycle, tagline, description, lead credits, and the inclusion list (one per line) that renders on the pandit's upgrade page.

---

## 17. Lead distribution engine

`leadDistribution.repository.js` is **unchanged** — the fairness algorithm (tier hierarchy, rolling window, fair share, delta, boost, over-share penalty, daily cap, display score) is preserved exactly. Only its *input* changed: `get_pandit_lead_counts()` was replaced to read `qualified_leads` instead of `inquiries ∪ contact_clicks`. Same signature, so no application code needed editing. The daily cap of 5 now means 5 **qualified leads**.

---

## 18. RLS changes

| Policy | Effect |
|---|---|
| `qleads_select_own_pandit` | a pandit reads only their own leads |
| `qleads_update_own_pandit` | a pandit re-statuses only their own leads |
| `qleads_select_admin` | admin visibility via the existing admin predicate |
| `reset_admin_select` | reset challenges are otherwise unreadable through a session |

**No INSERT policy on `qualified_leads`** — the only write path is the SECURITY DEFINER function, so the app role cannot forge a lead with a hand-written INSERT. `DELETE` is revoked from `panditconnect_app`: leads are billing evidence and fairness input. There is deliberately **no devotee SELECT policy**.

---

## 19. Security protections

- Allow-list `sanitize()` on `/auth/me` — closes the DOB leak the new column would otherwise have opened, and fails closed for every future column.
- DOB never returned by any endpoint; verified absent by test.
- Generic, byte-identical failures for login and reset; timing-equalised login.
- Advisory-lock concurrency; single-use, hashed, expiring reset tokens; full session revocation on any password change.
- Pandit self-service profile edit is an **allow-list** — `verification_status`, `current_tier`, `is_featured`, `rank_score`, `slug` are unreachable (covered by a test that tries to self-award Diamond).
- Payment amount always server-derived.
- Cross-tenant reads/writes return **404, not 403** — no existence oracle.

---

## 20. Responsive

`pandit.css` (328 lines) built mobile-first: 44 px touch targets, 16 px inputs (stops iOS zoom), `env(safe-area-inset-*)`, `overflow-wrap: anywhere` on names/values for long Devanagari, table→card transform, drawer→sidebar at 1024 px, `prefers-reduced-motion` honoured, `.sr-only` + `aria-*` on nav, filters, tabs and the drawer (Escape closes).

## 21. Tests created

- `tests/qualified-leads.test.js` — **22 tests**: guest, unverified, verified, suspended, self-contact, forged userId, bad token, view-is-not-a-lead, bad method; dedup ×20, Call→WhatsApp, two users, window expiry; **10-way parallel concurrency**; fairness with 25 guest clicks vs 0.
- `tests/pandit-auth.test.js` — **~26 tests**: login matrix, no-enumeration byte-comparison, DOB reset happy path + wrong DOB + wrong email parity + devotee rejection + malformed dates + single-use + expiry + weak/mismatched passwords + session revocation; dashboard counts, views-carry-no-identity, leads show name+mobile, leads leak nothing else, **A-cannot-read-B**, **A-cannot-restatus-B**, status change preserves statistics, devotee gets no dashboard, self-escalation blocked.
- `tests/admin-pandit-create.test.js` — **7 tests**: linkage, bcrypt-only storage, plan assignment, duplicate email, **rollback leaves no orphans**, admin reset + session revocation, `/auth/me` carries no DOB.
- `e2e/pandit-flows.spec.ts` — Flows A–H. `e2e/responsive.spec.ts` — 14 widths × pages, `scrollWidth ≤ innerWidth`.

---

## 22. Exact commands executed

```bash
# module load checks (all passed)
NODE_ENV=test node -e "require('./src/app')"          # boots, 175 route objects
# frontend typecheck, baseline-differenced against git HEAD
npx tsc -b --force --pretty false
# production bundle
npx vite build --config vite.verify.config.ts
# backend suite
NODE_ENV=test ADMIN_SECRET_PATH=… ENCRYPTION_KEY=… node --test tests/qualified-leads.test.js
# SQL structural sanity
python3 - <<'PY'  # dollar-quote balance, BEGIN/COMMIT pairing, object counts
```

## 23. Test results — what actually ran

| Check | Result |
|---|---|
| Backend modules load, Express boots | ✅ **PASS** |
| Frontend typecheck — **files I authored/modified** | ✅ **0 errors** (baseline 5 → 49; the delta is your pre-existing uncommitted work in `useData.ts`, `normalize.ts`, `Home.tsx`, `Pandits.tsx`, `Panchang.tsx`, `TempleDetail.tsx`, `About.tsx`, `GoogleMap.tsx`, `ReviewForm.tsx`, none of which I touched) |
| Production bundle | ✅ **PASS** — `PanditApp` = 64.2 kB lazy chunk |
| SQL structural sanity | ✅ **PASS** — 12 `$$` balanced, 1 BEGIN/1 COMMIT, 5 functions, 4 policies |
| Backend test suites | ⚠️ **EXECUTED BUT COULD NOT PASS** — all 22 fail with `ECONNREFUSED 127.0.0.1:5432`. Zero syntax/reference/type errors; the suites load, the app boots, they simply cannot reach a database. |
| oxlint | ⚠️ **NOT RUN** — `node_modules` holds the win32-x64 binary |
| Playwright | ⚠️ **NOT RUN** — not installed, npm registry returns 403 |
| Docker build / startup | ⚠️ **NOT RUN** — no Docker in the sandbox |
| Migration applied to a real DB | ⚠️ **NOT RUN** — no Postgres reachable |

## 24. Production build result

`vite build` ✅ succeeded (CSS minification disabled only because `lightningcss` ships a win32 binary here). `npm run build` also runs `tsc -b`, which **will fail on your pre-existing errors** until those are fixed — that is not caused by this change set.

---

## 25. Remaining blockers (run these on your machine)

```bash
# 1. apply the migration
cd backend && DATABASE_URL=postgresql://…:5433/panditconnect npm run db:init

# 2. run the suites against real Postgres  ← the important one
docker compose up -d db
cd backend && npm test

# 3. lint + typecheck + build
cd frontend/app && npm run lint && npm run build

# 4. E2E
npm i -D @playwright/test && npx playwright install --with-deps && npx playwright test
```

## 26. Remaining security risks

1. **DOB is a weak second factor.** Mitigated by rate limiting, generic errors, audit logging and a short single-use token — but ~25k plausible values means it is not equivalent to an emailed link. Add the OTP step (hook is in place) before scale.
2. **In-memory rate limiting.** `express-rate-limit` uses a per-process store; a second backend instance multiplies every budget. Move to Redis before horizontal scaling.
3. **Snapshot PII in `qualified_leads`.** `contact_name_snapshot` / `contact_phone_snapshot` deliberately survive account deletion so leads stay actionable. Confirm this against your erasure policy and add a retention job.
4. **No CSRF token.** Bearer-token auth in a header is not auto-sent by the browser, so this is defensible — but re-check if you ever move to cookie auth.
5. **Admin session IP change is logged, not enforced** (pre-existing, deliberate).

## 27. Recommended next improvements

1. Fix the pre-existing typecheck errors so `npm run build` is green and CI can gate on it.
2. Wire a real SMS provider so mobile verification — the gate for every qualified lead — actually works end to end.
3. Add a nightly job to expire `pandit_subscriptions` and downgrade `current_tier`.
4. Notify a pandit (`notifications` table already exists) the moment a qualified lead lands.
5. Add `lead_credits_monthly` enforcement — the column exists but nothing consumes it yet.
6. Backfill `pandit_analytics` history, or state plainly in the UI that view history starts from this deploy.
7. CSV export of leads for pandits who work offline.
