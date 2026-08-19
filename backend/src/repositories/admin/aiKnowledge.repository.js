/**
 * Admin CRUD over the AI knowledge base.
 *
 * The one rule that shapes everything here: retrieval reads only
 * `status = 'published' AND verified`, and a document's chunks carry a
 * denormalised `is_retrievable` flag kept in step by a trigger (migration 12).
 * So publishing and unpublishing take effect on live answers immediately, in
 * the same transaction — no cache to bust, no re-index needed just to hide
 * something.
 *
 * Re-indexing IS needed after an edit, because the stored embedding is for the
 * old text. `indexed_at` is cleared on every content change so the panel can
 * say "re-index needed" honestly rather than guessing.
 */

const ALLOWED_TYPES = [
  'puja', 'havan', 'anushthan', 'temple', 'deity', 'faq',
  'spiritual_guidance', 'testimonial', 'remedy', 'scripture',
];

/** Columns the list view needs. Body is excluded — it is large and unused there. */
const LIST_COLUMNS = `
  d.id, d.title, d.document_type, d.language, d.status, d.verified,
  d.source, d.source_ref, d.version, d.indexed_at, d.index_error,
  d.city, d.state, d.deity, d.problem_categories, d.intent_tags,
  d.service_id, d.temple_id, d.updated_at,
  (SELECT COUNT(*)::int FROM ai_knowledge_chunks c WHERE c.document_id = d.id) AS chunk_count,
  (SELECT COUNT(*)::int FROM ai_knowledge_chunks c
     WHERE c.document_id = d.id AND c.embedding IS NOT NULL) AS embedded_count
`;

async function list(q, { search, status, documentType, source, needsIndex, page = 1, perPage = 25 }) {
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(d.title ILIKE $${params.length} OR d.body ILIKE $${params.length})`);
  }
  if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
  if (documentType) { params.push(documentType); where.push(`d.document_type = $${params.length}`); }
  if (source) { params.push(source); where.push(`d.source = $${params.length}`); }
  // "Needs re-index" is the actionable filter: content changed, embedding did not.
  if (needsIndex === 'true') where.push('d.indexed_at IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(perPage, (page - 1) * perPage);

  const [rows, count] = await Promise.all([
    q(`SELECT ${LIST_COLUMNS} FROM ai_knowledge_documents d ${whereSql}
        ORDER BY d.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
    q(`SELECT COUNT(*)::int AS total FROM ai_knowledge_documents d ${whereSql}`,
      params.slice(0, params.length - 2)),
  ]);
  return { data: rows.rows, total: count.rows[0].total };
}

async function getById(q, id) {
  const { rows } = await q(
    `SELECT d.*, ${''}
            (SELECT COUNT(*)::int FROM ai_knowledge_chunks c WHERE c.document_id = d.id) AS chunk_count
       FROM ai_knowledge_documents d WHERE d.id = $1`, [id],
  );
  return rows[0] || null;
}

function normaliseArray(value, max = 40) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v ?? '').trim()).filter(Boolean))].slice(0, max);
}

async function create(q, doc, adminUserId) {
  if (!ALLOWED_TYPES.includes(doc.documentType)) {
    throw new Error(`documentType must be one of: ${ALLOWED_TYPES.join(', ')}`);
  }
  const { rows } = await q(
    `INSERT INTO ai_knowledge_documents
       (title, body, document_type, language, service_id, temple_id, deity,
        intent_tags, problem_categories, city, state, status, verified,
        source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,'draft',FALSE,'admin',$12)
     RETURNING id`,
    [
      doc.title, doc.body, doc.documentType, doc.language || 'hinglish',
      doc.serviceId || null, doc.templeId || null, doc.deity || null,
      JSON.stringify(normaliseArray(doc.intentTags)),
      JSON.stringify(normaliseArray(doc.problemCategories)),
      doc.city || null, doc.state || null, adminUserId || null,
    ],
  );
  return rows[0];
}

/**
 * Update. Content changes clear indexed_at, because the stored vector is now
 * for text that no longer exists — leaving it set would make the panel report
 * a stale document as current and keep serving the old embedding.
 */
async function update(q, id, fields) {
  const sets = [];
  const params = [id];
  const map = {
    title: 'title', body: 'body', deity: 'deity', city: 'city', state: 'state',
    serviceId: 'service_id', templeId: 'temple_id',
  };
  for (const [key, column] of Object.entries(map)) {
    if (fields[key] !== undefined) { params.push(fields[key] || null); sets.push(`${column} = $${params.length}`); }
  }
  if (fields.documentType !== undefined) {
    if (!ALLOWED_TYPES.includes(fields.documentType)) {
      throw new Error(`documentType must be one of: ${ALLOWED_TYPES.join(', ')}`);
    }
    params.push(fields.documentType); sets.push(`document_type = $${params.length}`);
  }
  if (fields.language !== undefined) {
    params.push(fields.language); sets.push(`language = $${params.length}`);
  }
  for (const [key, column] of [['intentTags', 'intent_tags'], ['problemCategories', 'problem_categories']]) {
    if (fields[key] !== undefined) {
      params.push(JSON.stringify(normaliseArray(fields[key])));
      sets.push(`${column} = $${params.length}::jsonb`);
    }
  }
  if (!sets.length) return getById(q, id);

  const touchesContent = fields.title !== undefined || fields.body !== undefined;
  const { rows } = await q(
    `UPDATE ai_knowledge_documents
        SET ${sets.join(', ')},
            version = version + 1,
            updated_at = NOW()
            ${touchesContent ? ', indexed_at = NULL, index_error = NULL' : ''}
      WHERE id = $1 RETURNING id`,
    params,
  );
  return rows[0] || null;
}

/**
 * Publish / unpublish.
 *
 * Publishing sets verified too: on this platform the admin who publishes is the
 * approver, and a document that is published-but-unverified would be invisible
 * to retrieval while looking live in the panel — the worst of both.
 *
 * Unpublishing propagates to chunks via trg_ai_doc_status, so the article stops
 * grounding answers in the same transaction.
 */
async function setStatus(q, id, status) {
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error('status must be draft, published or archived');
  }
  const { rows } = await q(
    `UPDATE ai_knowledge_documents
        SET status = $2, verified = ($2 = 'published'), updated_at = NOW()
      WHERE id = $1 RETURNING id, status, verified`,
    [id, status],
  );
  return rows[0] || null;
}

/** Hard delete. Chunks go with it via ON DELETE CASCADE. */
async function remove(q, id) {
  const { rows } = await q(
    'DELETE FROM ai_knowledge_documents WHERE id = $1 RETURNING id, source', [id],
  );
  return rows[0] || null;
}

/** Counts for the panel header — what is live, what needs attention. */
async function stats(q) {
  const { rows } = await q(`
    SELECT
      COUNT(*)::int                                                     AS total,
      COUNT(*) FILTER (WHERE status = 'published' AND verified)::int    AS live,
      COUNT(*) FILTER (WHERE status = 'draft')::int                     AS drafts,
      COUNT(*) FILTER (WHERE indexed_at IS NULL)::int                   AS needs_index,
      COUNT(*) FILTER (WHERE index_error IS NOT NULL)::int              AS errored
    FROM ai_knowledge_documents`);
  return rows[0];
}

/** Taxonomy for the editor's category picker. */
async function categories(q) {
  const { rows } = await q(
    `SELECT slug, name_en, name_hi, parent_id, example_phrases
       FROM ai_problem_categories WHERE is_active = TRUE
      ORDER BY display_order, name_en`);
  return rows;
}

module.exports = {
  list, getById, create, update, setStatus, remove, stats, categories, ALLOWED_TYPES,
};
