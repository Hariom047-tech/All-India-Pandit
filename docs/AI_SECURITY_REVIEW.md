# AI feature — security & privacy review

STEP 20. Covers the surface added by migrations 12–13, `src/services/ai/*`,
`/api/ai/*` and `/api/<admin>/ai/*`.

Verdict: **safe to run in production**, with the four open items in §8 tracked.

---

## 1. What the feature added

| Surface | Auth | Rate limit |
|---|---|---|
| `POST /api/ai/chat` | optional (guests allowed) | 20 / 15 min / IP |
| `POST /api/ai/events` | optional | 120 / 15 min |
| `POST /api/ai/feedback` | optional | 40 / 15 min |
| `GET /api/ai/status` | optional | 60 / 15 min |
| `/api/<admin>/ai/*` | `requireAdmin` (password + TOTP) | inherits admin |

Ten new tables, all prefixed `ai_`. No existing table's meaning changed.

---

## 2. The qualified-lead boundary

**The single most important property.** An AI recommendation is not a lead, and
the pipeline has no way to make one.

Verified mechanically:

- `grep record_qualified_lead src/services/ai/ src/controllers/ai.controller.js
  src/repositories/ai.repository.js` → **zero calls** (two matches, both in
  explanatory comments).
- The only `qualified_leads` references in AI code are `SELECT MAX/COUNT` used
  as ranking signals.
- No FK from any `ai_*` table to `qualified_leads`; asserted in migration 12's
  self-check.
- `tests/ai-pipeline.test.js` — "a full AI turn creates NO qualified lead".

Contact from an AI card routes through `usePanditContact`, the same hook the
rest of the site uses. The AI page contains **zero** direct `wa.me` or `tel:`
links, so the server-side rules (logged in, phone verified, advisory-lock dedup,
full revalidation in SQL) cannot be bypassed by going through the assistant.

---

## 3. Row-Level Security

`ai_conversations`, `ai_messages`, `ai_feedback` and `ai_recommendation_events`
all have RLS enabled. The app connects as the unprivileged `panditconnect_app`
role, so these are real boundaries.

**One issue was found and fixed during the build.** A patch to unblock guest
INSERT shipped as:

```sql
CREATE POLICY ai_conv_guest ON ai_conversations
    FOR ALL USING (user_id IS NULL AND session_key IS NOT NULL);
```

`FOR ALL` covers SELECT, UPDATE and DELETE, and nothing ties the row to the
caller — every guest conversation on the platform was readable and deletable by
any request holding the app role. Guest threads are the most sensitive rows in
the database: people who are not logged in describe depression, divorce,
infertility, debt and court cases there, and the crisis path means some are
describing wanting to die.

Migration 13 replaces it with per-command policies comparing
`session_key = current_app_session_key()`, a GUC set per transaction by
`withAiContext()`. It **fails closed** — an unset GUC denies the row. No guest
DELETE policy exists at all, because nothing in the product deletes a
conversation and `FOR ALL` was granting it silently.

Guest session keys are 128 bits of `crypto.randomBytes`, issued server-side.

---

## 4. Prompt injection

Both user messages and retrieved chunks are treated as untrusted.

- **Structural** — chunks are placed inside `<<<KNOWLEDGE n | type | source>>>`
  fences that the system prompt explicitly describes as reference material,
  never instruction.
- **Lexical** — `neutraliseInjection()` defangs the common override phrasings
  in place (quoted, not deleted, so a legitimate article that mentions one is
  not silently altered).
- **Fence escape** — `<<<`, `>>>` and ``` inside content are rewritten, so a
  chunk cannot close its own block and appear system-level.

Covered by `tests/ai-response.test.js` (5 tests), including one asserting that
ordinary devotional text passes through **unchanged**.

---

## 5. Data minimisation

The model receives a hand-built allow-list: id, name, city, verified, rating,
review count, experience, service reviews, match label, reason.

It never receives phone, WhatsApp, email, DOB, ID-proof hash, lead history,
admin notes, internal ranking scores or subscription tier. An allow-list, not a
deny-list — a deny-list silently leaks the next column somebody adds.

`_score` and `_factors` are stripped before the HTTP response; asserted in both
the ranking and pipeline tests.

Raw query text is stored in `ai_query_analytics` for the operator's own review.
It is never re-embedded and never leaves the database.

---

## 6. Safety

| Risk | Control |
|---|---|
| Guaranteed outcomes | `GUARANTEE_PATTERNS` rejects the whole response; the fallback is shown instead. Refuses rather than repairs. |
| Medical / legal / financial | Detected in `safetyCheck()`, disclaimer appended in the devotee's language |
| Crisis | Short-circuits **before** retrieval and matching. Fixed text, never model-generated, no cards, offers Tele-MANAS 14416 |
| Hallucinated entities | Any UUID in the answer must be in the candidate set or the response is rejected |
| Unverified pandits | Hard SQL gate, not a weight — no score passes an unverified or suspended pandit |

Crisis detection is deliberately broad. A false positive costs one gentle
message; a false negative is unconscionable. Ordinary distress ("business me
bahut loss ho raha hai") is asserted **not** to trip it.

---

## 7. Cost & abuse

Per turn: one embedding (~$0.00002) plus one generation (~400 output tokens
max). At 20 requests / 15 min / IP the worst case per IP is roughly $0.02/hour.
Token counts are measured off the API response into `ai_messages`, so the admin
cost panel reports real usage rather than an estimate. `AI_ENABLED=false` is a
kill switch.

---

## 8. Open items

1. **Rate limiting is per IP, not per session.** A NAT'd office shares a bucket;
   a botnet does not. Consider a per-session or per-account limit if abuse
   appears.
2. **No admin approval queue for AI answers.** Answers are generated live from
   approved knowledge. The controls are the knowledge base and the output
   validator, not human review of each reply.
3. **Guest conversations are retained indefinitely.** They contain sensitive
   disclosures. A retention policy (e.g. purge guest threads after 90 days)
   should be agreed and implemented.
4. **`ai_query_analytics` stores raw query text.** Justified for demand
   intelligence, but it is personal data in a GDPR/DPDP sense and belongs in
   whatever deletion process the platform offers.

---

## 9. Test coverage

`npm run test:ai` — **91 tests, no database, no network, no API key.**

| Suite | Tests | Covers |
|---|---:|---|
| `ai-chunker` | 17 | chunk integrity, no oversized chunks, no `source_ref` collisions |
| `ai-ranking` | 27 | eligibility, Bayesian rating, weights, exploration, privacy |
| `ai-retrieval-scoring` | 14 | calibration, weight renormalisation, confidence |
| `ai-response` | 19 | guarantees, hallucination, injection, crisis, disclaimers |
| `ai-pipeline` | 14 | end-to-end wiring, the lead boundary, gaps, memory |

Not covered by automated tests, and verified manually against the live stack:
retrieval quality (`npm run ai:calibrate` — recall@1 73.3%, category 85% on 60
labelled phrases) and the eligibility SQL against real pandit rows.
