-- ============================================================================
-- Module 20: AI Spiritual Guidance — foundation schema
-- ============================================================================
-- Backs the three-engine architecture described in docs/AI_RAG_ARCHITECTURE.md:
--
--   1. Spiritual Intelligence Engine   problem  -> puja / havan / anushthan
--        Grounded in the approved knowledge base. This migration owns it.
--   2. Marketplace Matching Engine     service + location -> eligible pandits
--        Reads the EXISTING pandits / services / temples / pandit_services
--        tables. Nothing duplicated here.
--   3. Ranking Engine                  eligible pandits -> best 3
--        Weights live in ai_ranking_config so they are tunable without a deploy.
--
-- Hard boundary, restated because it is the whole point of the design:
--   * The vector index answers "what is traditionally relevant?"
--   * The relational tables answer "what actually exists on the platform right
--     now, and who can perform it?"
-- Price, rating, availability, verification, plan and status are NEVER read
-- from a chunk. A chunk is prose written by an admin weeks ago; those columns
-- change hourly.
--
-- What this migration does NOT do: it creates no pandit, service or temple
-- data, and it does not touch qualified_leads or any of its functions. An AI
-- recommendation is not a lead — see ai_recommendation_events.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── pgvector ────────────────────────────────────────────────────────────────
-- Requires the image built by docker/postgres/Dockerfile. The stock
-- postgis/postgis image does not ship pgvector and this line is where that
-- becomes obvious, so the error names the fix.
DO $ext$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE EXCEPTION
      'pgvector is not available in this Postgres image. Rebuild the db service: docker compose build db && docker compose up -d db';
  END IF;
END
$ext$;

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1 · PROBLEM TAXONOMY
-- ============================================================================
-- Admin-expandable, as required. Seeded from the categories that actually
-- occur in backend/src/data/knowledge/custom/problems-solutions.json rather
-- than an invented list, so the taxonomy and the knowledge agree on day one.
CREATE TABLE IF NOT EXISTS ai_problem_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(80) UNIQUE NOT NULL,
    name_en         VARCHAR(120) NOT NULL,
    name_hi         VARCHAR(120),
    -- Self-reference gives us "business" -> "business_growth" without a second
    -- table. NULL parent = top-level group.
    parent_id       UUID REFERENCES ai_problem_categories(id) ON DELETE SET NULL,
    description     TEXT,
    -- Phrases a devotee actually types, in any of the three languages. Fed into
    -- the embedding for this category so "vyapar mein rukawat" and "business
    -- not growing" land on the same node.
    example_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_problem_categories_parent
  ON ai_problem_categories(parent_id);

-- ============================================================================
-- 2 · KNOWLEDGE DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(300) NOT NULL,
    body            TEXT NOT NULL,

    document_type   VARCHAR(40) NOT NULL,          -- puja | havan | anushthan | temple | deity | faq | spiritual_guidance | testimonial | remedy | scripture
    language        VARCHAR(10) NOT NULL DEFAULT 'hinglish',   -- hi | en | hinglish

    -- Optional links into the real catalogue. ON DELETE SET NULL, not CASCADE:
    -- deleting a service must not silently destroy the written knowledge about
    -- the ritual, it just unlinks it.
    service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
    temple_id       UUID REFERENCES temples(id)  ON DELETE SET NULL,
    deity           VARCHAR(120),

    intent_tags       JSONB NOT NULL DEFAULT '[]'::jsonb,
    problem_categories JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ai_problem_categories.slug values
    city            VARCHAR(120),
    state           VARCHAR(120),

    -- Retrieval reads ONLY status='published' AND verified. Draft admin content
    -- must never ground an answer shown to a devotee.
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft | published | archived
    verified        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Where this came from: 'admin' for panel-authored, or the KB filename for
    -- ingested JSON, so a re-ingest can replace exactly its own rows.
    source          VARCHAR(200) NOT NULL DEFAULT 'admin',
    source_ref      VARCHAR(200),                             -- e.g. problems-solutions.json#ghar-mein-kalesh

    version         INTEGER NOT NULL DEFAULT 1,
    -- Set when chunks+embeddings are current for this version. Lets the admin
    -- panel show "re-index needed" honestly instead of guessing.
    indexed_at      TIMESTAMPTZ,
    index_error     TEXT,

    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_doc_status_valid CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT ai_doc_language_valid CHECK (language IN ('hi', 'en', 'hinglish')),
    CONSTRAINT ai_doc_tags_are_arrays CHECK (
      jsonb_typeof(intent_tags) = 'array' AND jsonb_typeof(problem_categories) = 'array'
    )
);

-- One row per source item, so re-ingesting a KB file updates in place instead
-- of duplicating every chunk on each run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_doc_source_ref
  ON ai_knowledge_documents (source, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_doc_retrievable
  ON ai_knowledge_documents (document_type)
  WHERE status = 'published' AND verified;

CREATE INDEX IF NOT EXISTS idx_ai_doc_service ON ai_knowledge_documents(service_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc_temple  ON ai_knowledge_documents(temple_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc_needs_index
  ON ai_knowledge_documents (updated_at) WHERE indexed_at IS NULL;

-- ============================================================================
-- 3 · KNOWLEDGE CHUNKS  (the vector index)
-- ============================================================================
-- 1536 dimensions = OpenAI text-embedding-3-small, chosen in
-- docs/AI_RAG_ARCHITECTURE.md for multilingual coverage at low cost. The
-- dimension is fixed in the column type, so switching model families means a
-- new migration, not a silent mismatch — which is the safe failure mode.
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,

    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    -- Heading kept with its body (see the chunking rules in the architecture
    -- doc); stored separately so it can also be prepended to the embedding text.
    heading         VARCHAR(300),
    token_count     INTEGER,

    embedding       vector(1536),

    -- Denormalised from the parent purely so the hot retrieval query can filter
    -- without a join. Kept in step by trg_ai_chunk_denorm below — not by
    -- application code, which would drift.
    language        VARCHAR(10),
    document_type   VARCHAR(40),
    is_retrievable  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Lexical half of hybrid retrieval. 'simple' rather than 'english': the
    -- corpus is mostly Hinglish and Devanagari, where the English stemmer does
    -- more harm than good ("puja"/"pooja" are not English words).
    content_tsv     tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(heading, '') || ' ' || content)) STORED,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, chunk_index)
);

-- HNSW over cosine distance. Built only over retrievable rows: draft and
-- archived content is a large share of the table on a busy panel and never
-- appears in results, so indexing it wastes build time and memory.
CREATE INDEX IF NOT EXISTS idx_ai_chunk_embedding
  ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE is_retrievable;

CREATE INDEX IF NOT EXISTS idx_ai_chunk_tsv
  ON ai_knowledge_chunks USING GIN (content_tsv);

CREATE INDEX IF NOT EXISTS idx_ai_chunk_document ON ai_knowledge_chunks(document_id);

-- Keeps the denormalised copies honest.
CREATE OR REPLACE FUNCTION ai_sync_chunk_denorm() RETURNS TRIGGER AS $fn$
BEGIN
  SELECT d.language, d.document_type, (d.status = 'published' AND d.verified)
    INTO NEW.language, NEW.document_type, NEW.is_retrievable
    FROM ai_knowledge_documents d WHERE d.id = NEW.document_id;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_chunk_denorm ON ai_knowledge_chunks;
CREATE TRIGGER trg_ai_chunk_denorm
  BEFORE INSERT OR UPDATE OF document_id ON ai_knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION ai_sync_chunk_denorm();

-- Unpublishing a document must remove it from retrieval immediately. Without
-- this, an admin archives an article and it keeps grounding answers — the
-- "stale deleted content still searchable" failure the spec calls out.
CREATE OR REPLACE FUNCTION ai_propagate_doc_status() RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.language IS DISTINCT FROM OLD.language
     OR NEW.document_type IS DISTINCT FROM OLD.document_type THEN
    UPDATE ai_knowledge_chunks
       SET is_retrievable = (NEW.status = 'published' AND NEW.verified),
           language       = NEW.language,
           document_type  = NEW.document_type
     WHERE document_id = NEW.id;
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_doc_status ON ai_knowledge_documents;
CREATE TRIGGER trg_ai_doc_status
  AFTER UPDATE ON ai_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION ai_propagate_doc_status();

-- ============================================================================
-- 4 · PROBLEM → SERVICE MAPPING  (admin-owned, deterministic)
-- ============================================================================
-- The reason this table exists, concretely: problems-solutions.json carries a
-- connectToPandit.serviceId on every record, and 29 of those 30 values match no
-- slug in the services catalogue ('navagraha_shanti' vs 'navgrah-shanti',
-- 'saraswati_puja' vs nothing at all). Deriving links from those strings would
-- have produced zero service recommendations for almost every problem, quietly.
--
-- So the mapping is explicit, admin-editable, and only ever references a
-- service that really exists. Unmatched intent is not fabricated — it is
-- recorded in ai_query_analytics as a demand gap.
CREATE TABLE IF NOT EXISTS ai_problem_service_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_category_id UUID NOT NULL REFERENCES ai_problem_categories(id) ON DELETE CASCADE,
    service_id          UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,

    -- 0..1. Multiplies into service ranking; 1.0 = the canonical remedy.
    relevance_score     NUMERIC(3,2) NOT NULL DEFAULT 0.80,
    -- Shown to the devotee as the "why", so it must be written in the careful
    -- register described in docs/AI_KNOWLEDGE_GUIDE.md — traditional practice,
    -- never a promised outcome.
    reason              TEXT,

    temple_id           UUID REFERENCES temples(id) ON DELETE SET NULL,
    deity               VARCHAR(120),

    status              VARCHAR(20) NOT NULL DEFAULT 'published',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (problem_category_id, service_id, temple_id),
    CONSTRAINT ai_mapping_score_range CHECK (relevance_score >= 0 AND relevance_score <= 1),
    CONSTRAINT ai_mapping_status_valid CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_ai_mapping_lookup
  ON ai_problem_service_mappings (problem_category_id, relevance_score DESC)
  WHERE status = 'published';

-- ============================================================================
-- 5 · CONVERSATIONS + MEMORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable: a guest can use the assistant. Guests are identified by
    -- session_key only, and a guest conversation never becomes a lead.
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    session_key     VARCHAR(64),

    title           VARCHAR(200),
    language        VARCHAR(10),

    -- Rolling structured memory: the facts worth carrying between turns
    -- (established intent, city, temple, service). NOT a transcript — the spec
    -- is explicit that "Nalkheda" in turn 3 must resolve against the business
    -- puja from turn 1, and that needs slots, not more raw text in the prompt.
    memory          JSONB NOT NULL DEFAULT '{}'::jsonb,

    message_count   INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_conv_owner_present CHECK (user_id IS NOT NULL OR session_key IS NOT NULL),
    CONSTRAINT ai_conv_memory_is_object CHECK (jsonb_typeof(memory) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_session ON ai_conversations(session_key);

CREATE TABLE IF NOT EXISTS ai_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

    role            VARCHAR(20) NOT NULL,             -- user | assistant | system
    content         TEXT NOT NULL,

    -- The structured query understanding for a user turn, and the validated
    -- structured output for an assistant turn. Kept so a bad answer can be
    -- debugged without re-running the pipeline.
    intent          JSONB,
    -- Chunk ids + scores that grounded this answer. This is what makes an
    -- answer auditable: "which approved document did that sentence come from?"
    retrieval       JSONB,
    -- Card payload actually rendered (service/temple/pandit ids only).
    recommendations JSONB,

    confidence      NUMERIC(4,3),
    model           VARCHAR(80),
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    latency_ms      INTEGER,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_msg_role_valid CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_ai_msg_conversation ON ai_messages(conversation_id, created_at);

-- ============================================================================
-- 6 · EVENTS  —  deliberately NOT qualified leads
-- ============================================================================
-- Read this before wiring anything to it. Rows here are impressions and clicks
-- inside the assistant. They exist for CTR and demand analytics.
--
-- A row in this table is NOT a qualified lead and must never be counted as one.
-- Qualified leads keep their own path, unchanged: record_qualified_lead() with
-- its advisory lock, logged-in + phone-verified user, server-side revalidation
-- and 24-hour dedup (migration 03). A card impression, a profile view and a
-- repeated click are all recorded here and all remain worth zero leads.
CREATE TABLE IF NOT EXISTS ai_recommendation_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    message_id      UUID REFERENCES ai_messages(id) ON DELETE CASCADE,

    event_type      VARCHAR(40) NOT NULL,
    -- Exactly one of these is set, depending on event_type.
    pandit_id       UUID REFERENCES pandits(id) ON DELETE CASCADE,
    service_id      UUID REFERENCES services(id) ON DELETE CASCADE,
    temple_id       UUID REFERENCES temples(id) ON DELETE CASCADE,

    position        INTEGER,        -- rank in the card list, for CTR by slot
    score           NUMERIC(5,4),   -- ranking score at display time
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_event_type_valid CHECK (event_type IN (
      'ai_response_shown', 'service_recommended', 'temple_recommended',
      'pandit_recommended', 'pandit_card_clicked', 'pandit_profile_opened',
      'call_clicked', 'whatsapp_clicked', 'booking_started', 'booking_completed'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ai_event_type_time ON ai_recommendation_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_event_pandit ON ai_recommendation_events(pandit_id, created_at DESC);

-- ============================================================================
-- 7 · FEEDBACK
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    session_key     VARCHAR(64),

    helpful         BOOLEAN NOT NULL,
    reason          VARCHAR(40),      -- wrong_puja | wrong_pandit | wrong_location | not_relevant | other
    note            VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One verdict per person per answer; a second submission updates it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_feedback_user
  ON ai_feedback (message_id, user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 8 · QUERY ANALYTICS  +  DEMAND GAPS
-- ============================================================================
-- The marketplace-intelligence table. Every low-confidence or zero-result query
-- lands here, so "187 people asked for Pitru Dosh Puja in Ujjain and we had no
-- pandit" becomes a number an admin can act on rather than a lost session.
CREATE TABLE IF NOT EXISTS ai_query_analytics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,

    -- Raw text is kept only for the operator's own review, never re-embedded.
    query_text          TEXT NOT NULL,
    language            VARCHAR(10),
    detected_intent     VARCHAR(80),
    problem_category    VARCHAR(80),

    requested_service   VARCHAR(200),   -- free text as understood, may not exist yet
    requested_city      VARCHAR(120),
    requested_state     VARCHAR(120),
    requested_temple    VARCHAR(200),

    retrieval_top_score NUMERIC(5,4),
    chunks_retrieved    INTEGER,
    services_found      INTEGER NOT NULL DEFAULT 0,
    pandits_found       INTEGER NOT NULL DEFAULT 0,

    -- The three states worth acting on, separately:
    --   no_knowledge  we have nothing written about this problem
    --   no_service    we know the remedy but do not offer the service
    --   no_pandit     we offer it, but nobody eligible serves that location
    gap_type            VARCHAR(30),
    fallback_used       VARCHAR(40),
    latency_ms          INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_gap_type_valid CHECK (
      gap_type IS NULL OR gap_type IN ('no_knowledge', 'no_service', 'no_pandit', 'low_confidence')
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_analytics_gap
  ON ai_query_analytics (gap_type, requested_city, created_at DESC) WHERE gap_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_analytics_time ON ai_query_analytics(created_at DESC);

-- ============================================================================
-- 9 · RANKING CONFIG
-- ============================================================================
-- Single-row-per-key config so weights are tunable from the admin panel.
-- Hard-coding these would mean a deploy every time the marketplace balance
-- shifts, and would scatter a business decision across the codebase.
CREATE TABLE IF NOT EXISTS ai_ranking_config (
    key             VARCHAR(60) PRIMARY KEY,
    value           NUMERIC(6,3) NOT NULL,
    description     TEXT,
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

-- ============================================================================
-- 10 · ROW-LEVEL SECURITY
-- ============================================================================
-- Conversations and messages are personal. The app connects as the
-- unprivileged panditconnect_app role (RLS does not apply to a table owner),
-- so these policies are real boundaries, not decoration.
--
-- Guest rows (user_id IS NULL) are deliberately NOT readable through RLS by
-- anyone: a guest is identified by an opaque session_key the server holds, and
-- a policy keyed on it would let any caller who guessed a key read a stranger's
-- conversation. Guest sessions are served from the request's own session, not
-- by querying across users.
ALTER TABLE ai_conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conv_own ON ai_conversations;
CREATE POLICY ai_conv_own ON ai_conversations
    FOR ALL USING (user_id IS NOT NULL AND user_id = current_app_user_id());

DROP POLICY IF EXISTS ai_conv_guest ON ai_conversations;
CREATE POLICY ai_conv_guest ON ai_conversations
    FOR ALL USING (user_id IS NULL AND session_key IS NOT NULL);

DROP POLICY IF EXISTS ai_conv_admin ON ai_conversations;
CREATE POLICY ai_conv_admin ON ai_conversations
    FOR SELECT USING (current_app_user_is_admin());

DROP POLICY IF EXISTS ai_msg_own ON ai_messages;
CREATE POLICY ai_msg_own ON ai_messages
    FOR ALL USING (
      conversation_id IN (
        SELECT id FROM ai_conversations
         WHERE user_id IS NOT NULL AND user_id = current_app_user_id()
      )
    );

DROP POLICY IF EXISTS ai_msg_guest ON ai_messages;
CREATE POLICY ai_msg_guest ON ai_messages
    FOR ALL USING (
      conversation_id IN (
        SELECT id FROM ai_conversations
         WHERE user_id IS NULL AND session_key IS NOT NULL
      )
    );

DROP POLICY IF EXISTS ai_msg_admin ON ai_messages;
CREATE POLICY ai_msg_admin ON ai_messages
    FOR SELECT USING (current_app_user_is_admin());

DROP POLICY IF EXISTS ai_feedback_own ON ai_feedback;
CREATE POLICY ai_feedback_own ON ai_feedback
    FOR ALL USING (user_id IS NOT NULL AND user_id = current_app_user_id());

DROP POLICY IF EXISTS ai_feedback_admin ON ai_feedback;
CREATE POLICY ai_feedback_admin ON ai_feedback
    FOR SELECT USING (current_app_user_is_admin());

-- Events are written for every session including guests, and read only in
-- aggregate by admins. No per-user read path.
DROP POLICY IF EXISTS ai_events_insert ON ai_recommendation_events;
CREATE POLICY ai_events_insert ON ai_recommendation_events FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS ai_events_admin ON ai_recommendation_events;
CREATE POLICY ai_events_admin ON ai_recommendation_events
    FOR SELECT USING (current_app_user_is_admin());


-- ============================================================================
-- 11 · SEED — problem taxonomy
-- ============================================================================
-- Top-level groups, then the 30 leaf problems that problems-solutions.json
-- actually contains. Seeding anything the knowledge base cannot answer would
-- create categories that always return "no match".
INSERT INTO ai_problem_categories (slug, name_en, name_hi, display_order) VALUES
  ('business',  'Business & Finance', 'व्यापार और धन',      10),
  ('career',    'Career & Job',       'करियर और नौकरी',     20),
  ('legal',     'Legal & Disputes',   'कानूनी विवाद',       30),
  ('family',    'Family & Home',      'परिवार और घर',       40),
  ('marriage',  'Marriage',           'विवाह',              50),
  ('children',  'Children',           'संतान',              60),
  ('education', 'Education',          'शिक्षा',             70),
  ('health',    'Health & Wellbeing', 'स्वास्थ्य',          80),
  ('planetary', 'Planetary Doshas',   'ग्रह दोष',           90),
  ('ancestors', 'Ancestors',          'पितृ',              100),
  ('property',  'Property & Vastu',   'संपत्ति और वास्तु',  110),
  ('spiritual', 'Spiritual Protection','आध्यात्मिक रक्षा',  120),
  ('enemies',   'Opposition',         'शत्रु बाधा',        130)
ON CONFLICT (slug) DO NOTHING;

-- Leaf problems, each carrying the devotee's own words. example_phrases is what
-- gets embedded, which is why "Ghar mein hamesha ladai hoti hai" must be stored
-- verbatim rather than paraphrased into English.
INSERT INTO ai_problem_categories (slug, name_en, parent_id, example_phrases, display_order)
SELECT v.slug, v.name_en, p.id, v.phrases::jsonb, v.ord
  FROM (VALUES
    ('ghar-mein-kalesh',      'Household conflict',        'family',    '["Ghar mein hamesha ladai hoti hai","Pati patni mein banti nahi","Ghar mein shanti nahi hai"]', 10),
    ('court-case',            'Court case',                'legal',     '["Court case chal raha hai, jeet nahi mil rahi","Legal matter mein problem aa rahi hai"]', 10),
    ('business-loss',         'Business loss',             'business',  '["Business mein bahut loss ho raha hai","Dukaan par customer nahi aa rahe","Vyapar mein rukawat hai"]', 10),
    ('debt-rin',              'Debt burden',               'business',  '["Karza bahut badh gaya hai","Loan nahi chuka paa raha"]', 20),
    ('business-enemies',      'Business rivals',           'enemies',   '["Competitors market mein pareshan kar rahe hain","Log dushmani nikal rahe hain"]', 10),
    ('health-issues',         'Persistent illness',        'health',    '["Bimari theek nahi ho rahi hai","Ghar mein koi na koi beemar rehta hai"]', 10),
    ('depression-stress',     'Stress and low mood',       'health',    '["Bahut tension rehti hai","Depression feel hota hai","Overthinking rehti hai"]', 20),
    ('body-pain',             'Chronic pain',              'health',    '["Sharir mein hamesha dard rehta hai","Ghutno aur jodo mein bahut dard hai"]', 30),
    ('insomnia',              'Sleeplessness',             'health',    '["Raat ko neend nahi aati","Sone ki koshish karta hu par thoughts chalte rehte hain"]', 40),
    ('family-illness',        'Recurring family illness',  'health',    '["Ghar mein ek theek hota hai dusra bimar pad jata hai"]', 50),
    ('repeated-accidents',    'Repeated accidents',        'health',    '["Bar bar accident ho raha hai","Gadi bar bar kharab hoti hai"]', 60),
    ('marriage-delays',       'Delayed marriage',          'marriage',  '["Shaadi mein bahut deri ho rahi hai","Rishte aate hain par baat nahi banti"]', 10),
    ('shaadi-problems',       'Marital discord',           'marriage',  '["Shaadi ke baad problem aa rahi hai","Divorce ki naubat aa gayi hai"]', 20),
    ('post-marriage-problems','In-law conflict',           'marriage',  '["Shaadi ke baad in-laws se nahi banti","Saas-bahu mein bahut jhagda hota hai"]', 30),
    ('pitru-dosh',            'Pitru dosh',                'ancestors', '["Kundli mein Pitru dosh hai","Sapne mein mare hue log aate hain"]', 10),
    ('shani-dosh',            'Shani sade sati',           'planetary', '["Shani ki sade sati chal rahi hai","Shani ki dhaiya hai"]', 10),
    ('kaal-sarpa-dosh',       'Kaal Sarpa dosh',           'planetary', '["Kundli mein Kaal Sarpa dosh bata rahe hain"]', 20),
    ('manglik-dosh',          'Manglik dosh',              'planetary', '["Ladka ya ladki Manglik hai","Mangal dosh ke karan shaadi toot gayi"]', 30),
    ('nazar-evil-eye',        'Evil eye',                  'spiritual', '["Kisi ki buri nazar lag gayi hai","Bachha bahut rota hai"]', 10),
    ('bhoot-pret',            'Negative presence',         'spiritual', '["Ghar mein ajeeb aawazein aati hain","Koi saya dikhta hai"]', 20),
    ('santan-issues',         'Childlessness',             'children',  '["Bachha nahi ho raha hai","Pregnancy mein complications aa rahi hain"]', 10),
    ('pregnancy-issues',      'Conception difficulty',     'children',  '["Pregnancy conceive nahi ho rahi","Doctor ne bed rest bola hai"]', 20),
    ('mundan-sanskar',        'Mundan sanskar',            'children',  '["Bachche ka mundan karwana hai","Baal utarwane ka shubh muhurat chahiye"]', 30),
    ('bachche-ki-padhai',     'Study and concentration',   'education', '["Bachche ka padhai mein man nahi lagta","Exam mein marks kam aate hain"]', 10),
    ('griha-pravesh',         'Griha pravesh',             'property',  '["Naye ghar mein shift hona hai","Griha Pravesh ki puja karni hai"]', 10),
    ('vastu-dosh',            'Vastu dosh',                'property',  '["Ghar ka vastu theek nahi hai","North east mein toilet ban gaya hai"]', 20),
    ('business-opening',      'New business opening',      'career',    '["Nayi dukan kholni hai","Office ka udghatan karna hai"]', 10),
    ('job-problems',          'Job search',                'career',    '["Naukri nahi mil rahi hai","Interview clear nahi hote","Job chali gayi"]', 20),
    ('promotion-issues',      'Promotion blocked',         'career',    '["Promotion ruka hua hai","Appraisal achha nahi hua"]', 30),
    ('political-success',     'Election success',          'career',    '["Election aane wale hain, jeet chahiye","Politics mein naam kamana hai"]', 40)
  ) AS v(slug, name_en, parent_slug, phrases, ord)
  JOIN ai_problem_categories p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 12 · SEED — problem → service mappings that REALLY resolve
-- ============================================================================
-- Only pairs where the service slug exists in the catalogue. The JOIN is the
-- guard: a slug that is not there inserts no row, rather than a dangling link.
INSERT INTO ai_problem_service_mappings (problem_category_id, service_id, relevance_score, reason)
SELECT c.id, s.id, v.score, v.reason
  FROM (VALUES
    ('ghar-mein-kalesh',   'navgrah-shanti',  0.85, 'Navagraha shanti traditionally performed seeking harmony in the household.'),
    ('ghar-mein-kalesh',   'rudrabhishek',    0.75, 'Rudrabhishek is traditionally performed for peace within the family.'),
    ('health-issues',      'mahamrityunjay',  0.95, 'Mahamrityunjaya jaap is traditionally performed praying for health and longevity.'),
    ('family-illness',     'mahamrityunjay',  0.90, 'Traditionally performed by families seeking relief from recurring illness.'),
    ('body-pain',          'mahamrityunjay',  0.80, 'Traditionally taken up for physical wellbeing alongside medical care.'),
    ('pitru-dosh',         'pitru-dosh',      1.00, 'The traditional observance for pitru dosh.'),
    ('kaal-sarpa-dosh',    'kaal-sarp',       1.00, 'The traditional observance for Kaal Sarpa dosh.'),
    ('shani-dosh',         'navgrah-shanti',  0.85, 'Navagraha shanti is traditionally performed during Shani sade sati.'),
    ('manglik-dosh',       'navgrah-shanti',  0.80, 'Traditionally performed seeking relief from Mangal dosh before marriage.'),
    ('griha-pravesh',      'griha-pravesh',   1.00, 'The traditional rite on entering a new home.'),
    ('vastu-dosh',         'bhoomi-pujan',    0.70, 'Bhoomi pujan is traditionally performed for the land and dwelling.'),
    ('mundan-sanskar',     'mundan',          1.00, 'The traditional mundan sanskar.'),
    ('business-opening',   'shop-opening',    1.00, 'The traditional rite on opening a new shop or office.'),
    ('business-loss',      'navgrah-shanti',  0.75, 'Traditionally performed seeking stability and removal of obstacles in trade.'),
    ('bachche-ki-padhai',  'ganesh-puja',     0.80, 'Ganesh puja is traditionally performed seeking focus in study.'),
    ('marriage-delays',    'navgrah-shanti',  0.80, 'Traditionally performed seeking removal of obstacles to marriage.'),
    ('santan-issues',      'rudrabhishek',    0.75, 'Traditionally performed by couples praying for a child.'),
    ('nazar-evil-eye',     'havan-yagna',     0.70, 'A havan is traditionally performed for cleansing and protection.'),
    ('bhoot-pret',         'sunderkand',      0.80, 'Sunderkand path is traditionally recited seeking protection.'),
    ('depression-stress',  'sunderkand',      0.70, 'Traditionally recited for inner steadiness; not a substitute for medical care.'),
    ('court-case',         'havan-yagna',     0.70, 'A havan is traditionally performed seeking a fair outcome in disputes.'),
    ('insomnia',           'rudrabhishek',    0.65, 'Traditionally performed seeking calm; medical advice remains important.')
  ) AS v(problem_slug, service_slug, score, reason)
  JOIN ai_problem_categories c ON c.slug = v.problem_slug
  JOIN services s ON s.slug = v.service_slug AND s.is_active = TRUE
ON CONFLICT (problem_category_id, service_id, temple_id) DO NOTHING;

-- ============================================================================
-- 13 · SEED — demand gaps already visible in the knowledge base
-- ============================================================================
-- problems-solutions.json recommends 28 services this platform does not offer
-- (baglamukhi_puja, saraswati_puja, shani_shanti, santan_gopal_havan, ...).
-- Rather than inventing catalogue entries for them, they are recorded as
-- supply gaps on day one, so the admin's demand report is populated from real
-- knowledge rather than waiting for users to hit the hole.
INSERT INTO ai_query_analytics (query_text, language, detected_intent, problem_category, requested_service, gap_type)
SELECT v.q, 'hinglish', 'seeded_from_knowledge_base', v.cat, v.svc, 'no_service'
  FROM (VALUES
    ('Baglamukhi puja / anushthan karvana hai',        'legal',     'Baglamukhi Puja / Anushthan'),
    ('Saraswati puja padhai ke liye',                  'education', 'Saraswati Puja'),
    ('Lakshmi Kubera puja dhan ke liye',               'business',  'Lakshmi Kubera Puja'),
    ('Shani shanti puja karvani hai',                  'planetary', 'Shani Shanti Puja'),
    ('Surya shanti puja',                              'planetary', 'Surya Shanti Puja'),
    ('Mangal dosh puja shaadi ke liye',                'marriage',  'Mangal Dosh Puja'),
    ('Santan Gopal havan bachche ke liye',             'children',  'Santan Gopal Havan'),
    ('Dhanvantari puja swasthya ke liye',              'health',    'Dhanvantari Puja'),
    ('Nazar dosh havan',                               'spiritual', 'Nazar Dosh Havan'),
    ('Tantra badha nivaran',                           'spiritual', 'Tantra Badha Nivaran'),
    ('Vahan puja gaadi ke liye',                       'health',    'Vahan Puja'),
    ('Vastu shanti puja ghar ke liye',                 'property',  'Vastu Shanti Puja'),
    ('Kumbh vivah / ark vivah manglik ke liye',        'marriage',  'Kumbh Vivah / Ark Vivah')
  ) AS v(q, cat, svc)
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_query_analytics a
    WHERE a.detected_intent = 'seeded_from_knowledge_base' AND a.requested_service = v.svc
 );

-- ============================================================================
-- 14 · SEED — ranking weights
-- ============================================================================
-- Starting defaults from the specification. Documented in
-- docs/AI_RANKING_ENGINE.md; tunable from the admin panel without a deploy.
INSERT INTO ai_ranking_config (key, value, description) VALUES
  ('weight.service_match',       0.30, 'Pandit offers the exact requested service'),
  ('weight.location_match',      0.20, 'Serves the requested temple / city / state'),
  ('weight.performance',         0.15, 'Verified completion performance'),
  ('weight.review_quality',      0.10, 'Bayesian-adjusted rating, not raw average'),
  ('weight.service_experience',  0.10, 'Experience with THIS service, not overall years'),
  ('weight.recent_activity',     0.05, 'Responded / active recently'),
  ('weight.profile_completeness',0.05, 'Photo, bio, credentials, languages present'),
  ('weight.availability',        0.05, 'Currently eligible to receive contact'),
  ('rating.prior_mean',          4.30, 'Bayesian prior: platform mean rating'),
  ('rating.prior_weight',       20.00, 'Reviews needed before a rating is trusted at face value'),
  ('exploration.slots',          1.00, 'Reserved slots in the top 3 for newly verified pandits'),
  ('exploration.min_score',      0.60, 'A new pandit still must clear this relevance to be shown'),
  ('retrieval.min_confidence',   0.60, 'Below this, ask a clarifying question instead of recommending'),
  ('retrieval.top_k',           20.00, 'Chunks fetched before re-ranking'),
  ('retrieval.final_k',          6.00, 'Chunks actually sent to the LLM')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 15 · GRANTS
-- ============================================================================
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      ai_problem_categories, ai_knowledge_documents, ai_knowledge_chunks,
      ai_problem_service_mappings, ai_conversations, ai_messages,
      ai_recommendation_events, ai_feedback, ai_query_analytics, ai_ranking_config
      TO panditconnect_app;
  END IF;
END
$grant$;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  missing   TEXT := '';
  t         TEXT;
  cats      INTEGER;
  maps      INTEGER;
  weights   INTEGER;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_problem_categories','ai_knowledge_documents','ai_knowledge_chunks',
    'ai_problem_service_mappings','ai_conversations','ai_messages',
    'ai_recommendation_events','ai_feedback','ai_query_analytics','ai_ranking_config'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t)
      THEN missing := missing || ' ' || t; END IF;
  END LOOP;
  IF missing <> '' THEN RAISE EXCEPTION 'Migration 12 incomplete — missing tables:%', missing; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
    THEN RAISE EXCEPTION 'Migration 12 incomplete — the vector extension is not installed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE tablename = 'ai_knowledge_chunks' AND indexname = 'idx_ai_chunk_embedding')
    THEN RAISE EXCEPTION 'Migration 12 incomplete — the HNSW embedding index is missing'; END IF;

  SELECT COUNT(*) INTO cats FROM ai_problem_categories;
  IF cats < 40 THEN RAISE EXCEPTION 'Migration 12 incomplete — taxonomy seed short (% rows, expected 43)', cats; END IF;

  SELECT COUNT(*) INTO weights FROM ai_ranking_config;
  IF weights < 15 THEN RAISE EXCEPTION 'Migration 12 incomplete — ranking config short (% rows)', weights; END IF;

  -- Not an error: how many mappings resolved depends on which services this
  -- particular database actually has seeded.
  SELECT COUNT(*) INTO maps FROM ai_problem_service_mappings;

  RAISE NOTICE 'Migration 12 applied: pgvector ready, % problem categories, % problem->service mappings resolved against the live catalogue, % ranking weights.', cats, maps, weights;
  RAISE NOTICE 'Qualified lead logic untouched — ai_recommendation_events is analytics only.';
END
$verify$;
