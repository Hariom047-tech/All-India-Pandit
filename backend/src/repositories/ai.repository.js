/**
 * Persistence for the AI assistant: conversations, messages, memory, events
 * and query analytics.
 *
 * READ THIS BEFORE ADDING ANYTHING HERE:
 * recordEvent() writes to ai_recommendation_events, which is ANALYTICS ONLY.
 * Nothing in this file creates, touches or influences a qualified lead. Those
 * still come solely from record_qualified_lead() (migration 03) with its
 * advisory lock, logged-in + phone-verified user, server-side revalidation and
 * 24-hour dedup. A card impression, a card click and a profile view are all
 * recorded here and all remain worth exactly zero leads.
 */

const { query, withAiContext } = require('../config/db');

/* ── conversations ────────────────────────────────────────────────────── */

/**
 * Find or create the conversation.
 *
 * Runs inside withAiContext so RLS sees BOTH identities. A logged-in user is
 * matched on user_id; a guest is matched on their opaque session key, which
 * migration 13 compares per row via current_app_session_key().
 *
 * Passing sessionKey is not optional for a guest — the policies fail closed, so
 * omitting it denies the row rather than widening access.
 */
async function getOrCreateConversation({ conversationId, userId = null, sessionKey = null, language }) {
  return withAiContext({ userId, sessionKey }, async (q) => {
    if (conversationId) {
      const { rows } = await q(
        `SELECT id, user_id, session_key, memory, message_count, language
           FROM ai_conversations WHERE id = $1`, [conversationId],
      );
      const conv = rows[0];
      // Ownership check. Without it, passing someone else's conversationId
      // would append to their thread and leak its memory back in the reply.
      if (conv
        && ((userId && conv.user_id === userId)
          || (!userId && sessionKey && conv.session_key === sessionKey))) {
        return conv;
      }
    }
    const { rows } = await q(
      `INSERT INTO ai_conversations (user_id, session_key, language)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, session_key, memory, message_count, language`,
      [userId, sessionKey, language || null],
    );
    return rows[0];
  });
}

/** Merge slots into ai_conversations.memory. Shallow by design — memory is a
 *  flat slot store, and a deep merge would quietly resurrect stale nested state. */
async function updateMemory(conversationId, userId, slots, sessionKey = null) {
  if (!slots || !Object.keys(slots).length) return;
  await withAiContext({ userId, sessionKey }, (q) => q(
    `UPDATE ai_conversations
        SET memory = memory || $2::jsonb,
            last_message_at = NOW(),
            message_count = message_count + 1
      WHERE id = $1`,
    [conversationId, JSON.stringify(slots)],
  ));
}

/* ── messages ─────────────────────────────────────────────────────────── */

async function addMessage(conversationId, userId, msg, sessionKey = null) {
  const { rows } = await withAiContext({ userId, sessionKey }, (q) => q(
    `INSERT INTO ai_messages
       (conversation_id, role, content, intent, retrieval, recommendations,
        confidence, model, input_tokens, output_tokens, latency_ms)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
     RETURNING id, created_at`,
    [
      conversationId, msg.role, msg.content,
      msg.intent ? JSON.stringify(msg.intent) : null,
      msg.retrieval ? JSON.stringify(msg.retrieval) : null,
      msg.recommendations ? JSON.stringify(msg.recommendations) : null,
      msg.confidence ?? null, msg.model ?? null,
      msg.inputTokens ?? null, msg.outputTokens ?? null, msg.latencyMs ?? null,
    ],
  ));
  return rows[0];
}

/** Recent turns, for debugging a bad answer. NOT used to build prompts —
 *  prompting reads the memory slots instead (see AI_RAG_ARCHITECTURE.md §6). */
async function recentMessages(conversationId, userId, limit = 10, sessionKey = null) {
  const { rows } = await withAiContext({ userId, sessionKey }, (q) => q(
    `SELECT role, content, created_at FROM ai_messages
      WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit],
  ));
  return rows.reverse();
}

/* ── events (analytics only — NOT leads) ──────────────────────────────── */

const EVENT_TYPES = new Set([
  'ai_response_shown', 'service_recommended', 'temple_recommended',
  'pandit_recommended', 'pandit_card_clicked', 'pandit_profile_opened',
  'call_clicked', 'whatsapp_clicked', 'booking_started', 'booking_completed',
]);

/**
 * Record one impression or click.
 *
 * Best-effort: analytics must never break a devotee's conversation, so a
 * failure here is swallowed after logging. The CHECK constraint on event_type
 * would reject an unknown value, so it is validated first rather than throwing
 * from inside Postgres.
 */
async function recordEvent(evt) {
  if (!EVENT_TYPES.has(evt.eventType)) {
    console.warn(`[ai] ignoring unknown event type: ${evt.eventType}`);
    return null;
  }
  try {
    const { rows } = await query(
      `INSERT INTO ai_recommendation_events
         (conversation_id, message_id, event_type, pandit_id, service_id, temple_id,
          position, score, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [evt.conversationId || null, evt.messageId || null, evt.eventType,
        evt.panditId || null, evt.serviceId || null, evt.templeId || null,
        evt.position ?? null, evt.score ?? null, evt.userId || null],
    );
    return rows[0]?.id || null;
  } catch (err) {
    console.error('[ai] event write failed (non-fatal):', err.message);
    return null;
  }
}

/** Batch the impressions emitted when one answer renders. */
async function recordImpressions({ conversationId, messageId, userId, services, temples, pandits }) {
  const events = [
    { eventType: 'ai_response_shown' },
    ...(services || []).map((s, i) => ({ eventType: 'service_recommended', serviceId: s.id, position: i })),
    ...(temples || []).map((t, i) => ({ eventType: 'temple_recommended', templeId: t.id, position: i })),
    ...(pandits || []).map((p, i) => ({
      eventType: 'pandit_recommended', panditId: p.panditId, position: i, score: p._score,
    })),
  ];
  await Promise.all(events.map((e) => recordEvent({ ...e, conversationId, messageId, userId })));
}

/* ── query analytics + demand gaps ────────────────────────────────────── */

/**
 * Every turn lands here, and the ones that failed are the valuable ones:
 * "187 people asked for Pitru Dosh Puja in Ujjain and we had no pandit" is a
 * recruiting decision, not a lost session.
 */
async function recordQueryAnalytics(row) {
  try {
    await query(
      `INSERT INTO ai_query_analytics
         (conversation_id, query_text, language, detected_intent, problem_category,
          requested_service, requested_city, requested_state, requested_temple,
          retrieval_top_score, chunks_retrieved, services_found, pandits_found,
          gap_type, fallback_used, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        row.conversationId || null, String(row.queryText || '').slice(0, 2000),
        row.language || null, row.detectedIntent || null, row.problemCategory || null,
        row.requestedService || null, row.requestedCity || null,
        row.requestedState || null, row.requestedTemple || null,
        row.topScore ?? null, row.chunksRetrieved ?? 0,
        row.servicesFound ?? 0, row.panditsFound ?? 0,
        row.gapType || null, row.fallbackUsed || null, row.latencyMs ?? null,
      ],
    );
  } catch (err) {
    console.error('[ai] analytics write failed (non-fatal):', err.message);
  }
}

/* ── feedback ─────────────────────────────────────────────────────────── */

async function recordFeedback({ messageId, userId, sessionKey, helpful, reason, note }) {
  return withAiContext({ userId, sessionKey }, (q) => q(
    `INSERT INTO ai_feedback (message_id, user_id, session_key, helpful, reason, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (message_id, user_id) WHERE user_id IS NOT NULL
     DO UPDATE SET helpful = EXCLUDED.helpful, reason = EXCLUDED.reason, note = EXCLUDED.note`,
    [messageId, userId || null, sessionKey || null, Boolean(helpful),
      reason || null, note ? String(note).slice(0, 500) : null],
  ));
}

module.exports = {
  getOrCreateConversation,
  updateMemory,
  addMessage,
  recentMessages,
  recordEvent,
  recordImpressions,
  recordQueryAnalytics,
  recordFeedback,
  EVENT_TYPES,
};
