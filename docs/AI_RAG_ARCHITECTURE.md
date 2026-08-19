# PanditSuggest AI — RAG & Recommendation Architecture

Status: **foundation implemented** (schema + infrastructure). Pipeline services are
the next stage. Nothing in this document describes behaviour that is already
live unless it says so explicitly.

---

## 1. Why three engines, not one

The single most common way this feature goes wrong is building it as
`user → LLM → answer`. The second most common is building it as
`user → vector search → answer`, which is the same mistake with extra steps:
a vector index returns prose that *resembles* the question, and prose cannot
know whether a pandit is verified this morning.

So the system is three engines with a hard boundary between them.

| Engine | Question it answers | Source of truth |
|---|---|---|
| **Spiritual Intelligence** | "What is traditionally done for this problem?" | Approved knowledge base (vector + lexical) |
| **Marketplace Matching** | "What do we actually offer, and where?" | `services`, `temples`, `temple_services`, `pandit_services` |
| **Ranking** | "Who is the best fit, right now?" | `pandits`, `reviews`, `qualified_leads`, `ai_ranking_config` |

**The rule that makes this work:** a retrieved chunk may never supply a price,
rating, availability, verification status, plan, lead count, active flag or
location. Those come from relational queries, every time. A chunk is prose an
admin wrote weeks ago; those columns change hourly.

---

## 2. Pipeline

```
user message
  ↓  language detect + query understanding      → structured intent JSON
  ↓  safety / domain / crisis check             → may short-circuit
  ↓  query rewrite (retrieval-optimised)
  ↓  hybrid retrieval  ── vector (HNSW cosine)
  │                    ├─ lexical (tsvector, 'simple')
  │                    └─ metadata filter + boost
  ↓  confidence gate                            → below 0.60: ask, don't guess
  ↓  service matching   (ai_problem_service_mappings → services)
  ↓  temple matching    (temple_services, location priority)
  ↓  pandit eligibility (hard gates — see AI_RANKING_ENGINE.md)
  ↓  ranking            (deterministic, weighted, normalised)
  ↓  LLM generation     (grounded; explains, never selects)
  ↓  structured output validation
  ↓  cards + analytics events
```

The LLM appears **once**, near the end, and it receives an already-decided
shortlist. It writes the words. It does not choose the pandits.

---

## 3. Knowledge base

### 3.1 What we have

`backend/src/data/knowledge/` — ~611 retrievable units, 1.2 MB.

| File | Units | Role |
|---|---|---|
| `custom/problems-solutions.json` | 30 | **The core asset.** Each record has `userMightSay` (real devotee phrasings), `diagnosis`, `recommendedPujas`, `diyRemedy`, `connectToPandit`, `urgencyLevel` |
| `custom/real-experiences.json` | 110 testimonials | Relatability. `problemDescription` → `whatTheyDid` → `result` → `timeToResult` |
| `custom/baglamukhi-knowledge.json` | ~348 | Deity, Nalkheda temple, 13 havan types, mantras, kavach, yantra, FAQs |
| `custom/puja-vidhi-guide.json` | 30 | Ritual procedure |
| `custom/diy-remedies.json` | 25 | Self-performed upay |
| `custom/herbs-encyclopedia.json` | 40 | Samagri reference |
| `scriptures/bhagavad-gita.json` | 18 chapters | Scriptural grounding |

`userMightSay` is why this corpus works: it is a ready-made set of query-side
examples in the user's own register. Embedding those verbatim is what lets
"vyapar mein rukawat hai", "business not growing" and "व्यापार में रुकावट है"
converge on one node.

### 3.2 The mapping problem, and why the mapping table is admin-owned

Every `problems-solutions.json` record carries `connectToPandit.serviceId`.
**29 of 30 of those values match no slug in the services catalogue.**

```
KB says              catalogue has
navagraha_shanti  →  navgrah-shanti     (near miss)
pitru_dosh_shanti →  pitru-dosh         (near miss)
saraswati_puja    →  (nothing)
baglamukhi_puja   →  (nothing)
shani_shanti      →  (nothing)
```

Deriving links from those strings would have produced **zero** service
recommendations for almost every problem, silently — the same class of failure
this codebase has hit repeatedly (fabricated availability, dropped review
photos, homepage tiles filtered on a field the API never returned).

Therefore `ai_problem_service_mappings` is explicit, admin-editable, and joins
on `services.slug` so a non-existent service inserts no row at all. Migration 12
seeds 22 mappings that genuinely resolve, and records the 13 unservable
categories as `gap_type = 'no_service'` in `ai_query_analytics`. **Your demand
report is populated on day one, from real knowledge, before a single user asks.**

### 3.3 Chunking

Not fixed-size. Target 400–800 tokens, content-aware, heading always kept with
its body (`ai_knowledge_chunks.heading` is stored separately *and* prepended to
the embedded text).

Measured output of `backend/src/services/ai/chunker.js` against the real files
(`npm run ai:ingest -- --dry-run`):

| Source | Chunks | Median tokens | Chunk boundary |
|---|---:|---:|---|
| `problems-solutions.json` | 30 | 326 | One per problem record. Never split `diagnosis` from `recommendedPujas` — the diagnosis is what makes the answer land, the pujas are what make it actionable |
| `real-experiences.json` | 110 | 182 | One per testimonial; problem → action → result stays together |
| `baglamukhi-knowledge.json` | 83 | 535 | One per `havanTypes[]` / `mantras[]` / `temples[]` / `stories[]`; 150 FAQs and 100 glossary terms grouped; long prose split on headings |
| `puja-vidhi-guide.json` | 30 | 471 | One per ritual |
| `diy-remedies.json` | 25 | 331 | One per remedy |
| `herbs-encyclopedia.json` | 40 | 183 | One per herb |
| `bhagavad-gita.json` | 280 | 553 | Chapter summary, then verse groups with the chapter heading repeated |
| **Total** | **598** | | ~235,000 tokens ≈ **$0.005** to embed the whole corpus |

Three bugs were found by running this rather than reasoning about it, and are
now pinned by `tests/ai-chunker.test.js`:

1. `splitLong` only split on blank lines. The generated sections in
   `baglamukhi-knowledge.json` are joined by single newlines, so an
   8,618-character section passed through untouched as one 2,159-token chunk.
2. Group building targeted the 800-token ceiling rather than the 600-token
   target, so the final item always pushed groups over.
3. Two temples are both named "Baglamukhi Mandir" (Ludhiana and Ujjain).
   Slugifying the name alone gave them one `source_ref`, and
   `uq_ai_doc_source_ref` would have made the second **silently overwrite** the
   first — a lost temple with no error anywhere.

---

## 4. Retrieval

### 4.1 Hybrid, always

Vector alone fails on proper nouns — "Nalkheda" and "Baglamukhi" are exactly the
tokens a devotee is most specific about, and exactly the ones cosine similarity
smooths away.

```
score = 0.60 · cosine_similarity
      + 0.25 · ts_rank(content_tsv, query)
      + 0.15 · metadata_boost
```

`metadata_boost` fires on explicit signals: requested temple matches
`temple_id`, requested deity matches `deity`, requested city matches `city`,
detected problem category appears in `problem_categories`.

Lexical search uses the `'simple'` dictionary, not `'english'`. The corpus is
Hinglish and Devanagari; the English stemmer would mangle "puja"/"pooja" and
does nothing useful for Devanagari.

### 4.2 Filtering is not optional

Retrieval reads only `is_retrievable = TRUE` on `ai_knowledge_chunks`, which the
`trg_ai_doc_status` trigger keeps equal to `status='published' AND verified`.
This is a trigger and not application code on purpose: unpublishing an article
must remove it from retrieval in the same transaction, or archived content keeps
grounding live answers.

The HNSW index is partial (`WHERE is_retrievable`) so drafts cost nothing.

### 4.3 Confidence

| Top score | Behaviour |
|---|---|
| ≥ 0.90 | High confidence — recommend directly |
| 0.75–0.90 | Good — recommend, hedge the wording |
| 0.60–0.75 | Possible — recommend with an explicit "aap chahein to..." |
| < 0.60 | **Do not recommend.** Ask one clarifying question, log `low_confidence` |

Threshold lives in `ai_ranking_config['retrieval.min_confidence']`.

---

## 5. Location priority

Never assume Nalkheda. Strict order:

1. Temple the user named explicitly
2. City the user named
3. State the user named
4. User's selected location on the platform
5. None → ask, or show broader options

An explicit user preference outranks every knowledge-base suggestion. "Mujhe
Maa Baglamukhi Nalkheda me hi havan karvana hai" filters to that temple first
and retrieves within it — it does not get a list of alternatives above it.

---

## 6. Memory

`ai_conversations.memory` is a JSONB **slot store**, not a transcript:

```json
{ "problemCategory": "business-loss", "city": "Ujjain",
  "temple": null, "serviceInterest": "havan-yagna", "language": "hinglish" }
```

Slots, not raw history, because the requirement is that "Nalkheda" in turn 3
resolves against the business puja from turn 1. Replaying the transcript into
the prompt would cost tokens linearly and still leave the model to re-infer what
was already settled. Slots are also inspectable, which matters when an answer
goes wrong.

Raw turns live in `ai_messages` for audit and debugging, not for prompting.

---

## 7. Safety

**Never guaranteed outcomes.** Not "yeh havan aapka case jita dega" but
"paramparagat roop se devotees is havan mein nyaay ki prarthana karte hain".
Full wording rules in `AI_KNOWLEDGE_GUIDE.md`.

**Medical / legal / financial.** Spiritual support may be offered alongside, and
explicitly never instead of, professional care. Any health intent appends the
medical-care line.

**Crisis.** Self-harm, suicide or violence intent short-circuits the pipeline
before recommendation. No puja upsell on a crisis message.

**Prompt injection.** Both user messages and retrieved chunks are untrusted.
Chunks are inserted into the prompt inside delimited, labelled blocks and the
system prompt states that content within them is reference material and never
instruction. A document containing "ignore previous instructions" is data.

**Data minimisation.** The LLM receives a sanitized pandit object — id, name,
public profile, rating, services, city, verified, public stats. Never phone,
DOB, email, lead history, admin notes or anything from `password_*`.

---

## 8. Analytics, and the line that must not be crossed

`ai_recommendation_events` records impressions and clicks:
`ai_response_shown`, `service_recommended`, `pandit_recommended`,
`pandit_card_clicked`, `call_clicked`, `whatsapp_clicked`, …

**None of these is a qualified lead, and none may ever be counted as one.**
Qualified leads keep the existing path unchanged: `record_qualified_lead()` with
its `pg_advisory_xact_lock`, logged-in and phone-verified user, server-side
revalidation of every invariant in SQL, and 24-hour rolling dedup (migration 03).
A card impression is worth zero. A profile view is worth zero. A repeated click
is worth zero. The AI feature adds a new *surface*; it does not add a new way to
manufacture leads.

`ai_query_analytics` is the marketplace-intelligence table. Three gap types are
tracked separately because they need different responses:

| `gap_type` | Meaning | Admin action |
|---|---|---|
| `no_knowledge` | Nothing written about this problem | Write an article |
| `no_service` | Remedy known, not in the catalogue | Add the service |
| `no_pandit` | Offered, but nobody eligible there | Recruit in that city |
| `low_confidence` | Understood poorly | Improve `example_phrases` |

---

## 9. Cost

Never send the whole KB or the whole pandit table. Per conversation turn:

1. Embedding of the rewritten query — `text-embedding-3-small`, ~$0.00002
2. Retrieval — Postgres, no API cost
3. Ranking — SQL + JS, no API cost
4. One generation call with ~6 chunks and ≤3 sanitized pandit objects

Embeddings are computed once at ingest, not per query. Identical queries hit a
cache. Token counts land in `ai_messages.input_tokens` / `output_tokens` so the
admin cost report is measured, not estimated.

---

## 10. Environment

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Embeddings + generation (already used by `chat.service.js`) |
| `AI_EMBEDDING_MODEL` | Default `text-embedding-3-small` (1536-dim, matches the column) |
| `AI_CHAT_MODEL` | Default `gpt-4o-mini` |
| `AI_ENABLED` | Kill switch; when off the UI shows the search fallback |

---

## 11. Migration

```bash
docker compose build db && docker compose up -d db   # pgvector image
cd backend && npm run db:migrate                     # applies 03–12
```

`docker/postgres/Dockerfile` layers pgvector onto `postgis/postgis:16-3.4`,
because 01-schema.sql needs PostGIS and no published image ships both.
**Do not run `docker compose down -v`** — that deletes the volume.

---

## 12. Known limitations

- Pipeline services are not yet built; this stage delivers schema + infrastructure.
- The mapping seed covers 22 pairs. The other 13 problem categories have no
  purchasable service and are recorded as demand gaps, not hidden.
- Re-ranking is specified but a cross-encoder is not yet wired; initial cut uses
  the hybrid score directly.
- None of this has been executed against a live database from this environment
  (no Postgres available here). The migration carries its own self-check and
  will refuse to report success if a table, the extension or the HNSW index is
  missing.
