# Lead Distribution v2 — markets, plans, and fair opportunity

Status: engine and tests implemented and verified. Schema and seeder written,
not yet run against your database.

---

## 1. The promise

**Fair opportunity, not equal leads.**

You cannot promise equal leads, because the devotee chooses. Give two pandits
identical exposure and the one with 100 reviews and a video will get more
contacts than the one with a blank profile. Promising equal leads means
promising something you do not control.

What you *can* promise, and what this engine measures: within one comparable
pool, every pandit receives a comparable share of the **chances**.

---

## 2. ⚠️ The plan ladder is inverted — read this before building

Your proposed model, run with your own numbers from §13 (10,000 India leads,
3,000 international):

| Plan | Seats | India | Intl | Total | **₹/lead** |
|---|---:|---:|---:|---:|---:|
| ₹5,000 Bharat | 200 | 35.0 | — | **35.0** | **₹143** |
| ₹9,000 Global | 150 | 20.0 | 6.0 | **26.0** | **₹346** |
| ₹15,000 International | 150 | — | 14.0 | **14.0** | **₹1,071** |

**A pandit paying ₹9,000 receives fewer leads than one paying ₹5,000.** Cost per
lead rises 7.5× across the ladder. The first pandit who does this arithmetic
downgrades, and tells the others.

No distribution engine fixes this. It is arithmetic: you cannot give more leads
to fewer, more expensive seats out of a smaller pool.

### Why it happens

A "70% to Bharat" split sounds like Bharat is favoured. But 70% of India traffic
across **200** seats is more per seat than 30% across **150** seats. The
percentage hides the seat count.

### Three ways out

**A · Fewer premium seats.** Scarcity is what a premium tier actually sells.
To equalise ₹/lead at ₹143:

| Plan | Needs | Pool supports | You planned |
|---|---:|---:|---:|
| ₹5k | 35 leads/seat | 200 seats | 200 ✅ |
| ₹9k | 63 leads/seat | **61 seats** | 150 ❌ |
| ₹15k | 105 leads/seat | **20 seats** | 150 ❌ |

**B · Price on value, and prove it.** If an international lead genuinely
converts at higher value, the ladder is defensible — but you must be able to
show it. Your own §14 credits idea, at 2.5×, gives:

| Plan | Credits/seat | ₹/credit |
|---|---:|---:|
| ₹5k | 35.0 | ₹143 |
| ₹9k | 35.0 | ₹257 |
| ₹15k | 35.0 | ₹429 |

Interesting: **your allocation already equalises delivered value at 35 credits
each.** Still inverted on price, but far less so. Flat pricing would need an
international lead to be worth ~7.5×.

**C · Reposition the premium as reach, not volume.** ₹15k buys access to a
market ₹5k cannot touch at all. That is a real product — it is just not "more
leads", and the sales pitch must not imply it is.

`leadsPerSeat()` in `rotation.js` computes this, the simulation prints it with a
warning, and a test asserts the inversion so it cannot be forgotten.

---

## 3. Architecture

```
                        VISITOR
                           │
                 Market resolution (server-side)
                           │
              ┌────────────┴────────────┐
            INDIA                 INTERNATIONAL
              │                          │
      ┌───────┴───────┐          ┌───────┴───────┐
   Bharat 70%     Global 30%   Global 30%   Intl 70%
      │               │            │            │
      └───────┬───────┘            └─────┬──────┘
         Plan bucket                Plan bucket
              │                           │
     Hard eligibility gates      Hard eligibility gates
              │                           │
        Fairness ranking            Fairness ranking
     (lead deficit + exposure deficit)
              │                           │
       Session-stable rotation     Session-stable rotation
              │                           │
              └───────────┬───────────────┘
                    Page 1 slots
                          │
                   Record exposure
                          │
                 Devotee contacts
                          │
              record_qualified_lead()   ← unchanged
                          │
                  Update counters
```

Fairness pool = **temple × market × plan**. A Nalkheda Bharat pandit competes
with other Nalkheda Bharat pandits — not with a Kashi pandit, and not with a
₹15k international pandit whose entitlement is different.

---

## 4. Two counters, not one

This is the core design decision.

| Counter | What it measures |
|---|---|
| `qualifiedLeads` | Verified devotees who actually made contact |
| `weightedExposure` | Visibility given, weighted by slot position |

**Why leads alone fails.** A pandit shown 500 times who converted nobody has a
lead count of zero. A leads-only engine reads that as "starved" and boosts them
forever — when in truth they have had every chance and the profile is the
problem.

**Why exposure alone fails.** Exposure is not what a pandit is paying for.

**Why position weighting matters.** Slot 1 is worth ~7× slot 20. Counting raw
impressions treats them as equal, so whoever holds slot 1 accumulates real
advantage while appearing equally exposed.

Position weight is **stored on the row**, not derived at read time — retuning
the curve later must not silently rewrite everyone's historical fairness.

---

## 5. The score

```
score = qualityWeight × profileQuality          (0.25)
      + fairnessStrength × (                    (0.75)
            0.55 × normalisedLeadDeficit
          + 0.45 × normalisedExposureDeficit )
      + coldStartBoost
      − overServicePenalty
      + sessionNoise                            (0.02, tie-break only)

deficit = (fairShare − actualShare) / fairShare
```

Deficits are **normalised by fair share** so they mean the same thing in a pool
of 20 and a pool of 500. Without that, large pools have tiny deficits and
fairness quietly stops working at scale.

Quality is deliberately mostly **completeness**, not rating — rating is only a
quarter of it, with Bayesian shrinkage so 5.0-from-two-reviews doesn't beat
4.8-from-three-hundred. Ranking by rating is the winner-takes-all trap this
whole engine exists to avoid.

**A subscription tier gives no ranking advantage.** Plans decide which *pool*
you are in; inside a pool everyone competes on fairness and quality alone.
Asserted by a test — otherwise same-plan fairness is fiction.

---

## 6. Rotation, and the pagination problem

500 pandits, 20 slots. Pandit #250 is invisible however large their deficit,
because a deficit only reorders a list nobody scrolls. Fairness has to operate
on **first-page slots**.

But per-request randomness makes a refresh reshuffle the page under the
devotee's thumb — the site feels rigged. And fixed ordering lets whoever holds
slot 1 harvest clicks forever.

The resolution:

```
seed = hash(sessionKey + templeId + serviceId + hourBucket)
```

Same visitor, same hour → identical order. Different visitor → different order.
The hour bucket stops a tab left open all day from holding the same pandits at
#1 indefinitely.

Rotation applies to a **band** of `pageSize × rotationDepth` comparably-deserving
candidates, and **slot 1 is always the top-ranked pandit** — pure rotation would
bury the most under-served candidate at slot 12 and defeat the correction just
computed.

---

## 7. Market detection without signup or GPS

Two different questions, and conflating them is the mistake:

| | Decides | Source | Cost of error |
|---|---|---|---|
| **browsingMarket** | which pandits to show | IP / CDN header | one wrong page |
| **leadMarket** | which plan gets billed | verified evidence | wrong pandit charged |

IP is fine for the first. **It is not acceptable for the second** — a VPN,
corporate proxy, roaming SIM or a devotee travelling would misattribute revenue,
and the pandit charged has no way to dispute it.

Strict precedence for `leadMarket`:

```
verified phone country   → high confidence
verified account country → high
explicit user selection  → medium
IP geolocation           → LOW — attribute, but flag for review
none                     → UNKNOWN, never a guess
```

Country comes only from CDN headers (`CloudFront-Viewer-Country`,
`CF-IPCountry`). A client-sent country is worthless — anyone can curl
`X-Country: US` and grant themselves the international pool.

⚠️ **The trust boundary is the CDN.** If your origin accepts public traffic, an
attacker bypasses CloudFront and forges these headers freely. Lock the origin to
the CDN's IP ranges.

**UNKNOWN visitors see all three pools** and are asked to choose. Not a coin
flip, not a silent default — every pandit gets a chance and one tap produces a
real answer.

A browsing preference (an NRI choosing "serve me as international") changes what
they *see* and never what gets *billed*. Asserted by a test.

---

## 8. Measured results

`npm run sim:distribution -- --visitors 120000 --compare`

500 pandits at Nalkheda, 120,000 visitors, ~77% India, with the devotee's choice
modelled (better profiles convert better).

**India market, Bharat pool — 174 eligible of 200:**

| Approach | mean | min | max | p90/p10 | **Gini** | zero leads |
|---|---:|---:|---:|---:|---:|---:|
| **Fairness engine** | 32.0 | 18 | 44 | **1.67** | **0.118** | **0** |
| `ORDER BY RANDOM()` | 34.3 | 10 | 112 | 3.06 | 0.269 | 0 |
| `ORDER BY rating DESC` | 47.2 | 0 | **1,265** | ∞ | **0.924** | **154** |

Rating-ordering gives one pandit 1,265 leads while **154 of 174 get zero**. That
is the winner-takes-all outcome, and it is what "just sort by rating" produces.

Random is better but still lets one pandit take 112 while another takes 10 —
random is not fair, it is merely unbiased, and variance does the damage.

The remaining 26 excluded are blocked by the profile-completeness floor: no
photo, no bio, no services. They are not being treated unfairly — they are not
yet sellable. The simulation reports them separately, because counting their
zeros alongside real leads makes the engine look worse than it is and hides the
signal.

---

## 9. Running it

```bash
# 1 · schema
cd backend && npm run db:migrate            # applies migration 15

# 2 · 500 test pandits at Nalkheda
npm run seed:nalkheda -- --dry              # preview
npm run seed:nalkheda                       # create
npm run seed:nalkheda -- --purge            # remove them again

# 3 · verify the engine
npm run test:distribution                   # 33 tests, no DB needed
npm run sim:distribution -- --visitors 120000 --compare
```

Every seeded account is marked `seed_nalkheda_` in its email and slug, so
`--purge` finds exactly them. A seeder that cannot cleanly undo itself has no
business touching a database that also holds real pandits.

---

## 10. Admin controls

All in `distribution_config` and `plan_market_entitlements`:

| Control | Default | Effect |
|---|---|---|
| `fairness_strength` | 0.75 | 0 = pure quality, 1 = pure fairness |
| `quality_weight` | 0.25 | How much a good profile counts |
| `lead_deficit_weight` | 0.55 | Fairness split: leads |
| `exposure_deficit_weight` | 0.45 | Fairness split: exposure |
| `window_days` | 14 | Rolling window |
| `max_share_multiplier` | 3.0 | Throttle threshold |
| `cold_start_days` / `_boost` | 7 / 0.15 | New-pandit boost |
| `rotation_depth` | 3 | Band width that rotates |
| `min_profile_completeness` | 0.5 | Paid-distribution floor |
| `allocation_weight` | per plan+market | Traffic split |
| `daily_lead_cap` | per plan+market | Per-pandit daily ceiling |

**The admin panel must show `leadsPerSeat` and ₹/lead next to the allocation
sliders.** Changing a weight without seeing its effect on the plan ladder is
exactly how §2 happened.

---

## 11. What was NOT changed

`record_qualified_lead()` and its rules are untouched: logged-in, phone-verified,
advisory-lock dedup, full server-side revalidation. This engine decides **who is
shown**; it has no path to creating a lead.

An impression is not a lead. A card click is not a lead. Position #1 is not a
lead.

---

## 12. Open items

1. **Migration 15 and the seeder have not been run** — no database here. Both
   carry self-checks.
2. **The engine is not yet wired into `/api/pandits`.** The pure functions and
   schema exist; the repository query that reads real counters and the
   impression-recording call are the next step.
3. **Lead credits (§14 of your spec)** are deliberately not built. Market-specific
   counts first; weighting international leads at 2.5× is a v2 change once you
   have conversion data to justify the number.
4. **The plan ladder decision in §2 is yours to make** and should be settled
   before pandits are sold these plans.
