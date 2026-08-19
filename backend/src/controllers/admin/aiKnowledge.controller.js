/**
 * Admin → AI Knowledge Base, and AI Analytics.
 *
 * Every handler runs behind requireAdmin (see routes/admin/index.js), inside
 * the withUserContext transaction adminHandler sets up, so RLS and the audit
 * log both see who acted.
 */

const repo = require('../../repositories/admin/aiKnowledge.repository');
const { reindexDocument, indexStatus } = require('../../services/ai/ingest.service');
const { readPaging, paginationEnvelope } = require('../../utils/paginate');
const { logAdminAction } = require('../../utils/adminLog');
const { query } = require('../../config/db');

/* ── documents ────────────────────────────────────────────────────────── */

async function list(req, res) {
  const paging = readPaging(req.query, 25, 100);
  const { search, status, documentType, source, needsIndex } = req.query;
  const { data, total } = await repo.list(req.db, {
    search, status, documentType, source, needsIndex,
    page: paging.page, perPage: paging.perPage,
  });
  res.json(paginationEnvelope(data, paging, total));
}

async function getById(req, res) {
  const doc = await repo.getById(req.db, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
}

async function create(req, res) {
  const { title, body, documentType } = req.body || {};
  if (!title?.trim() || !body?.trim() || !documentType) {
    return res.status(400).json({ error: 'title, body and documentType are required' });
  }
  const doc = await repo.create(req.db, req.body, req.adminUser.id);
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'AI_KB_CREATED',
    targetType: 'ai_document', targetId: doc.id, details: { title }, ip: req.ip,
  });
  // Created as a draft, always. Publishing is a separate, deliberate act.
  res.status(201).json({ ...doc, status: 'draft' });
}

async function update(req, res) {
  const updated = await repo.update(req.db, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Document not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'AI_KB_UPDATED',
    targetType: 'ai_document', targetId: req.params.id, ip: req.ip,
  });
  res.json(updated);
}

/**
 * Publish / unpublish / archive.
 *
 * Unpublishing takes effect on live answers immediately — trg_ai_doc_status
 * flips is_retrievable on the chunks in the same transaction. So this is the
 * emergency stop for a bad article: unpublish first, fix afterwards.
 */
async function setStatus(req, res) {
  const { status } = req.body || {};
  let row;
  try {
    row = await repo.setStatus(req.db, req.params.id, status);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!row) return res.status(404).json({ error: 'Document not found' });

  await logAdminAction({
    adminUserId: req.adminUser.id,
    action: status === 'published' ? 'AI_KB_PUBLISHED' : 'AI_KB_UNPUBLISHED',
    targetType: 'ai_document', targetId: req.params.id, details: { status }, ip: req.ip,
  });
  res.json(row);
}

async function remove(req, res) {
  const row = await repo.remove(req.db, req.params.id);
  if (!row) return res.status(404).json({ error: 'Document not found' });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'AI_KB_DELETED',
    targetType: 'ai_document', details: { id: req.params.id, source: row.source }, ip: req.ip,
  });
  res.json({ ok: true });
}

/**
 * Re-index one document.
 *
 * Runs OUTSIDE req.db: embedding is a network call taking seconds, and holding
 * the admin request's transaction open across it would pin a pooled connection
 * and block other admin work.
 */
async function reindex(req, res) {
  const result = await reindexDocument(req.params.id);
  if (!result.ok) return res.status(422).json({ error: result.error });
  await logAdminAction({
    adminUserId: req.adminUser.id, action: 'AI_KB_REINDEXED',
    targetType: 'ai_document', targetId: req.params.id,
    details: { chunks: result.chunks }, ip: req.ip,
  });
  res.json(result);
}

async function stats(req, res) {
  const [counts, bySource] = await Promise.all([repo.stats(req.db), indexStatus()]);
  res.json({ ...counts, bySource });
}

async function categories(req, res) {
  res.json(await repo.categories(req.db));
}

/* ── analytics ────────────────────────────────────────────────────────── */

/**
 * The demand-gap report — the most commercially useful thing the AI produces.
 *
 * Grouped by gap type first, because the three kinds need different responses:
 * write an article, add a service, or recruit a pandit in that city.
 */
async function demandGaps(req, res) {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const { rows } = await query(
    `SELECT gap_type,
            COALESCE(requested_service, problem_category, 'unspecified') AS want,
            COALESCE(requested_city, requested_state, 'any')             AS location,
            COUNT(*)::int                                                AS searches,
            MAX(created_at)                                              AS last_seen
       FROM ai_query_analytics
      WHERE gap_type IS NOT NULL
        AND created_at > NOW() - ($1 || ' days')::interval
      GROUP BY gap_type, want, location
      ORDER BY searches DESC
      LIMIT 100`, [String(days)],
  );
  res.json(rows);
}

async function overview(req, res) {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const window = `NOW() - ('${days}' || ' days')::interval`;

  const [volume, categories_, events, feedback, cost] = await Promise.all([
    query(`SELECT COUNT(DISTINCT conversation_id)::int AS conversations,
                  COUNT(*)::int                        AS turns,
                  ROUND(AVG(latency_ms))::int          AS avg_latency_ms,
                  COUNT(*) FILTER (WHERE gap_type IS NOT NULL)::int AS unmet
             FROM ai_query_analytics WHERE created_at > ${window}`),
    query(`SELECT problem_category AS category, COUNT(*)::int AS n
             FROM ai_query_analytics
            WHERE created_at > ${window} AND problem_category IS NOT NULL
            GROUP BY 1 ORDER BY n DESC LIMIT 12`),
    query(`SELECT event_type, COUNT(*)::int AS n
             FROM ai_recommendation_events WHERE created_at > ${window}
            GROUP BY 1 ORDER BY n DESC`),
    query(`SELECT COUNT(*) FILTER (WHERE helpful)::int      AS helpful,
                  COUNT(*) FILTER (WHERE NOT helpful)::int  AS unhelpful,
                  reason, COUNT(*)::int AS n
             FROM ai_feedback WHERE created_at > ${window}
            GROUP BY reason ORDER BY n DESC`),
    // Token totals are measured, not estimated — they come off the API response.
    query(`SELECT COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                  COUNT(*) FILTER (WHERE model IS NOT NULL)::int AS generations
             FROM ai_messages WHERE created_at > ${window} AND role = 'assistant'`),
  ]);

  // CTR is only meaningful against impressions of the same kind.
  const byType = Object.fromEntries(events.rows.map((r) => [r.event_type, r.n]));
  const shown = byType.pandit_recommended || 0;
  const clicked = (byType.pandit_card_clicked || 0) + (byType.pandit_profile_opened || 0);

  res.json({
    windowDays: days,
    volume: volume.rows[0],
    topCategories: categories_.rows,
    events: byType,
    panditCtr: shown ? Number((clicked / shown).toFixed(4)) : null,
    contactClicks: (byType.call_clicked || 0) + (byType.whatsapp_clicked || 0),
    feedback: feedback.rows,
    tokens: cost.rows[0],
  });
}

/** Recent low-confidence queries, so an admin can read what people actually typed. */
async function lowConfidence(req, res) {
  const { rows } = await query(
    `SELECT query_text, language, problem_category, retrieval_top_score, gap_type, created_at
       FROM ai_query_analytics
      WHERE gap_type IN ('low_confidence', 'no_knowledge')
      ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
}

module.exports = {
  list, getById, create, update, setStatus, remove, reindex, stats, categories,
  demandGaps, overview, lowConfidence,
};
