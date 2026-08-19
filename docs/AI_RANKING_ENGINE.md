# PanditSuggest AI — Pandit Ranking Engine

Deterministic. Written in code and SQL, never delegated to the LLM.

> **Bad:** send 500 pandits to the model and ask "pick the best".
> **Good:** eligibility gates → scoring → top 10 → optional re-rank → top 3 →
> the model *explains* why those three match.

The model never sees a pandit that the code did not already select, so it cannot
invent one.

---

## 1. Eligibility — hard gates, before any scoring

A candidate that fails **any** gate is removed. These are not weights; there is
no score high enough to pass an ineligible pandit.

| Gate | Rule |
|---|---|
| Active | `pandits.is_active = TRUE`, `deleted_at IS NULL` |
| Verified | `verification_status = 'verified'` |
| Not suspended | Account status permits recommendation |
| Offers the service | Row in `pandit_services` for the matched `service_id` |
| Serves the location | `pandit_temples` for the temple, **or** city/state match, **or** offers the ritual remotely when the user asked for online |
| Profile valid | Name, photo and contact present — an empty card is worse than one fewer card |
| Contactable | Has a usable WhatsApp/phone route |

Two consequences worth stating plainly, because tests assert them:

- A pandit who does not offer the requested service **never** appears, unless
  the response explicitly frames the section as a fallback.
- A Delhi pandit **never** appears for an explicit Nalkheda request without the
  response saying, in words, that it is widening the search.

---

## 2. Scoring

Weights live in `ai_ranking_config`, seeded by migration 12, editable from the
admin panel. Hard-coding them would mean a deploy every time the marketplace
balance shifts.

| Key | Default | Signal |
|---|---|---|
| `weight.service_match` | 0.30 | Offers the exact requested service |
| `weight.location_match` | 0.20 | Requested temple > city > state > remote |
| `weight.performance` | 0.15 | Verified completion performance |
| `weight.review_quality` | 0.10 | Bayesian-adjusted rating |
| `weight.service_experience` | 0.10 | Experience with **this** service |
| `weight.recent_activity` | 0.05 | Responded recently |
| `weight.profile_completeness` | 0.05 | Photo, bio, credentials, languages |
| `weight.availability` | 0.05 | Currently eligible for contact |

Each factor is normalised to 0–1 before weighting, so
`score = Σ(weight_i × factor_i)` is itself 0–1.

---

## 3. Rating: never the raw average

The failure this prevents:

| | Rating | Reviews | Raw sort | Correct |
|---|---|---|---|---|
| Pandit A | 5.0 | 2 | 1st | 2nd |
| Pandit B | 4.8 | 300 | 2nd | 1st |

Two five-star reviews is not evidence. Bayesian shrinkage toward the platform
mean:

```
adjusted = (v · R + m · C) / (v + m)

  v = review count
  R = this pandit's mean rating
  C = ai_ranking_config['rating.prior_mean']    (4.30)
  m = ai_ranking_config['rating.prior_weight']  (20)
```

Worked: A → (2·5.0 + 20·4.3)/22 = **4.36**. B → (300·4.8 + 20·4.3)/320 = **4.77**.
B ranks above A, correctly.

`rating.prior_mean` should be recomputed from the real review distribution
periodically; 4.30 is a starting estimate.

---

## 4. Service-specific experience beats total years

| | Total experience | Baglamukhi havans | Better for a Baglamukhi request |
|---|---|---|---|
| Pandit A | 10 years | 2 | |
| Pandit B | 7 years | 500 | ✅ |

`weight.service_experience` counts completed work **for the matched service**,
not career length. Overall seniority contributes only through
`weight.performance`, at 0.15.

---

## 5. Worked example

Query: *"Nalkheda Baglamukhi me business growth havan karvana hai"* → service
matched, temple matched.

| | Service | Location | Rating | Reviews | Expected |
|---|---|---|---|---|---|
| A | exact | exact (Nalkheda) | 4.8 | 300 | **1st** |
| B | exact | wrong city | 5.0 | 5 | 3rd |
| C | general puja only | exact | 4.9 | 500 | 2nd |

A wins on the two heaviest factors (0.30 + 0.20). B's perfect rating is shrunk
to 4.40 and it loses all of `location_match`. C holds location but forfeits most
of `service_match`. This is a fixture in the ranking tests.

---

## 6. Fairness for new pandits

Relevance comes first. But a purely historic-performance ranking permanently
locks out every newly verified pandit, which starves supply.

`exploration.slots` (default 1) reserves at most one of the top three for a
newly verified pandit, and only if they clear `exploration.min_score` (0.60)
**and** match the service exactly. A weak match is never shown for the sake of
distribution — that trades the devotee's outcome for the marketplace's, and the
devotee is the one who came for help.

---

## 7. Output shape

Internal:

```json
{ "panditId": "…", "score": 0.93,
  "factors": { "serviceMatch": 1.0, "locationMatch": 1.0,
               "performance": 0.90, "reviews": 0.88, "serviceExperience": 0.95 } }
```

Public UI shows **"Excellent match"**, not `93.217%`. False precision invites
argument about a number that is a weighted heuristic. The *reason* string is
shown, and every clause in it must be backed by a stored fact:

> "Recommended because Pandit ji performs Maa Baglamukhi Havan at Nalkheda and
> has strong experience with this service."

Not "our AI picked this pandit".

---

## 8. Sponsored placement

Not implemented. When it is: sponsored slots must be visually labelled and kept
in a separate list from organic relevance. Organic score is never inflated for
payment. Selling ranking silently is the fastest way to lose a marketplace's
trust, and it is not recoverable.

---

## 9. A recommendation is not a lead

Restating, because it is the rule most likely to be broken by accident:

- Appearing in the AI's top 3 → **not** a lead.
- Card impression → **not** a lead.
- Card click → **not** a lead.
- Profile view → **not** a lead.

All of the above write to `ai_recommendation_events` for CTR analytics only.

A qualified lead is still produced only by `record_qualified_lead()`: logged-in
user, phone verified, valid pandit, real contact action, every invariant
re-validated server-side in SQL, `pg_advisory_xact_lock` for concurrency, 24-hour
rolling dedup. Migration 12 does not touch that function, its table, or its
policies.

---

## 10. Tests to hold this in place

| Test | Assertion |
|---|---|
| Ranking fixture | The §5 table orders A, C, B |
| Bayesian | 5.0×2 ranks below 4.8×300 |
| Inactive | Never appears |
| Unverified | Never appears |
| Wrong service | Absent, or explicitly framed as fallback |
| Wrong location | Absent for an explicit temple request |
| Duplicates | A pandit appears at most once |
| Hallucination | Every returned id exists in `pandits` |
| Exploration | At most one exploration slot, and only above `min_score` |
| Lead isolation | A full AI session produces zero rows in `qualified_leads` |
