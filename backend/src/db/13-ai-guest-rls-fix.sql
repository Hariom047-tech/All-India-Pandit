-- ============================================================================
-- Module 21: Scope guest AI conversations to their own session
-- ============================================================================
-- SECURITY FIX. Migration 12 originally shipped with no guest policy at all,
-- which correctly blocked reads but also blocked the INSERT a guest needs to
-- start a conversation. That was patched with:
--
--     CREATE POLICY ai_conv_guest ON ai_conversations
--         FOR ALL USING (user_id IS NULL AND session_key IS NOT NULL);
--
-- which unblocks the insert and, in the same stroke, makes EVERY guest
-- conversation on the platform readable, updatable and deletable by any caller
-- holding the app role. There is no clause tying the row to the requester.
--
-- Guest threads are the most sensitive rows in this database. People who are
-- not logged in describe depression, divorce, infertility, debt and court
-- cases there, and the crisis path means some of them are describing wanting
-- to die. "user_id IS NULL" is not an authorisation check.
--
-- The fix mirrors what the schema already does for logged-in users: a session
-- GUC set per transaction, read by a helper function, compared per row. A guest
-- can reach exactly one conversation — the one whose opaque key they hold.
--
-- Fails closed: if the backend forgets to set the GUC, current_setting returns
-- NULL, `session_key = NULL` is NULL, and the row is denied.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── the session key of the CURRENT request ──────────────────────────────────
-- Mirrors current_app_user_id() in 01-schema.sql. The backend sets this with
-- set_config('app.current_session_key', <key>, true) inside the transaction —
-- see withAiContext() in backend/src/config/db.js.
CREATE OR REPLACE FUNCTION current_app_session_key() RETURNS TEXT AS $fn$
  SELECT NULLIF(current_setting('app.current_session_key', true), '');
$fn$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION current_app_session_key() FROM PUBLIC;
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panditconnect_app') THEN
    GRANT EXECUTE ON FUNCTION current_app_session_key() TO panditconnect_app;
  END IF;
END
$g$;

-- ── conversations ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ai_conv_guest ON ai_conversations;

-- A guest may CREATE a conversation, but only one stamped with their own key.
-- Split from the read policy on purpose: INSERT is what was actually broken,
-- and it needs no read permission to work.
DROP POLICY IF EXISTS ai_conv_guest_insert ON ai_conversations;
CREATE POLICY ai_conv_guest_insert ON ai_conversations
    FOR INSERT WITH CHECK (
      user_id IS NULL
      AND session_key IS NOT NULL
      AND session_key = current_app_session_key()
    );

-- ...and may read and update only that conversation.
DROP POLICY IF EXISTS ai_conv_guest_select ON ai_conversations;
CREATE POLICY ai_conv_guest_select ON ai_conversations
    FOR SELECT USING (
      user_id IS NULL AND session_key = current_app_session_key()
    );

DROP POLICY IF EXISTS ai_conv_guest_update ON ai_conversations;
CREATE POLICY ai_conv_guest_update ON ai_conversations
    FOR UPDATE USING (
      user_id IS NULL AND session_key = current_app_session_key()
    );
-- Deliberately no DELETE policy for guests. Nothing in the product deletes a
-- conversation, and the previous FOR ALL grant handed that out silently.

-- ── messages ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ai_msg_guest ON ai_messages;

DROP POLICY IF EXISTS ai_msg_guest_insert ON ai_messages;
CREATE POLICY ai_msg_guest_insert ON ai_messages
    FOR INSERT WITH CHECK (
      conversation_id IN (
        SELECT id FROM ai_conversations
         WHERE user_id IS NULL AND session_key = current_app_session_key()
      )
    );

DROP POLICY IF EXISTS ai_msg_guest_select ON ai_messages;
CREATE POLICY ai_msg_guest_select ON ai_messages
    FOR SELECT USING (
      conversation_id IN (
        SELECT id FROM ai_conversations
         WHERE user_id IS NULL AND session_key = current_app_session_key()
      )
    );

-- ── feedback ────────────────────────────────────────────────────────────────
-- A guest can leave 👍/👎 on an answer in their own conversation.
DROP POLICY IF EXISTS ai_feedback_guest ON ai_feedback;
CREATE POLICY ai_feedback_guest ON ai_feedback
    FOR INSERT WITH CHECK (
      user_id IS NULL
      AND message_id IN (
        SELECT m.id FROM ai_messages m
          JOIN ai_conversations c ON c.id = m.conversation_id
         WHERE c.user_id IS NULL AND c.session_key = current_app_session_key()
      )
    );

COMMIT;

-- ============================================================================
-- Self-check
-- ============================================================================
DO $verify$
DECLARE
  bad_policy TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_app_session_key')
    THEN RAISE EXCEPTION 'Migration 13 incomplete — current_app_session_key() is missing'; END IF;

  -- The whole point: no surviving guest policy may admit a row without
  -- comparing it to the caller's session key.
  SELECT p.policyname INTO bad_policy
    FROM pg_policies p
   WHERE p.tablename IN ('ai_conversations', 'ai_messages')
     AND p.policyname LIKE '%guest%'
     AND COALESCE(p.qual, '') || COALESCE(p.with_check, '') NOT LIKE '%current_app_session_key%'
   LIMIT 1;

  IF bad_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 13 incomplete — policy "%" still admits guest rows without a session-key check', bad_policy;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename = 'ai_conversations' AND policyname = 'ai_conv_guest')
    THEN RAISE EXCEPTION 'Migration 13 incomplete — the permissive ai_conv_guest policy still exists'; END IF;

  RAISE NOTICE 'Migration 13 applied: guest AI conversations are now scoped to their own session key.';
END
$verify$;
