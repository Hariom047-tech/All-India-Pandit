/**
 * Knowledge ingestion: JSON files -> documents -> chunks -> embeddings -> index.
 *
 * Idempotent by design. Every document is keyed on (source, source_ref), which
 * has a unique index in migration 12, so re-running updates in place instead of
 * doubling the corpus. Chunks are deleted and rebuilt per document rather than
 * diffed — a document has a handful of chunks, and a diff would be more code
 * with more ways to leave a stale chunk behind.
 */

const fs = require('fs');
const path = require('path');
const { query, pool } = require('../../config/db');
const { SOURCES, chunkFile, splitLong } = require('./chunker');
const { estimateTokens } = require('./config');
const { embedBatch, toVectorLiteral } = require('./embeddings.service');

const KB_DIR = path.join(__dirname, '..', '..', 'data', 'knowledge');

/**
 * Text that actually gets embedded.
 *
 * The heading is prepended because a retrieved fragment must carry its own
 * context — "Samagri: haldi, peele phool" is meaningless without "Stambhan
 * Havan" attached, both to the reader and to the embedding.
 */
function embeddingText(chunk) {
  return chunk.heading && !chunk.content.startsWith(chunk.heading)
    ? `${chunk.heading}\n\n${chunk.content}`
    : chunk.content;
}

/** Upsert the document row and return its id. */
async function upsertDocument(q, source, chunk) {
  const { rows } = await q(
    `INSERT INTO ai_knowledge_documents
       (title, body, document_type, language, deity, city, state,
        intent_tags, problem_categories, status, verified, source, source_ref, version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'published',TRUE,$10,$11,1)
     ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
     DO UPDATE SET
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       document_type = EXCLUDED.document_type,
       language = EXCLUDED.language,
       deity = EXCLUDED.deity,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       intent_tags = EXCLUDED.intent_tags,
       problem_categories = EXCLUDED.problem_categories,
       version = ai_knowledge_documents.version + 1,
       updated_at = NOW(),
       -- Cleared deliberately: the text just changed, so the stored embedding
       -- is now for the OLD text. Leaving indexed_at set would make the admin
       -- panel report this document as current while it is silently stale.
       indexed_at = NULL,
       index_error = NULL
     RETURNING id`,
    [
      chunk.title, chunk.content, chunk.documentType, chunk.language || 'hinglish',
      chunk.deity || null, chunk.city || null, chunk.state || null,
      JSON.stringify(chunk.intentTags || []),
      JSON.stringify(chunk.problemCategories || []),
      source, chunk.sourceRef,
    ],
  );
  return rows[0].id;
}

async function writeChunk(q, documentId, chunk, embedding) {
  await q('DELETE FROM ai_knowledge_chunks WHERE document_id = $1', [documentId]);
  await q(
    `INSERT INTO ai_knowledge_chunks
       (document_id, chunk_index, content, heading, token_count, embedding)
     VALUES ($1, 0, $2, $3, $4, $5::vector)`,
    [documentId, chunk.content, chunk.heading || null, chunk.tokens || null,
      toVectorLiteral(embedding)],
  );
  await q(
    'UPDATE ai_knowledge_documents SET indexed_at = NOW(), index_error = NULL WHERE id = $1',
    [documentId],
  );
}

/**
 * Fail before spending money.
 *
 * Learned the hard way: without this, a database missing the AI tables still
 * embedded all 598 chunks first — 40 seconds and 598 API calls — and only then
 * printed the same "relation does not exist" error 598 times. The cause is
 * almost always that the migration and the ingest connected to DIFFERENT
 * databases, so the error names the connection target.
 */
async function preflight() {
  const target = (process.env.DATABASE_URL || 'default (localhost:5433)')
    .replace(/:\/\/[^@]*@/, '://***@');

  const { rows } = await query(
    `SELECT
       to_regclass('public.ai_knowledge_documents') IS NOT NULL AS docs,
       to_regclass('public.ai_knowledge_chunks')    IS NOT NULL AS chunks,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector`,
  );
  const r = rows[0];

  if (!r.docs || !r.chunks) {
    throw new Error(
      `The AI tables do not exist in the database this process connected to.\n`
      + `  connected to : ${target}\n`
      + `  ai_knowledge_documents : ${r.docs ? 'present' : 'MISSING'}\n`
      + `  ai_knowledge_chunks    : ${r.chunks ? 'present' : 'MISSING'}\n\n`
      + `Migration 12 either has not run, or ran against a different database.\n`
      + `Check that backend/.env DATABASE_URL points at the SAME database you migrated\n`
      + `(docker-compose publishes Postgres on host port 5433, not 5432), then run:\n`
      + `  npm run db:migrate && npm run verify:ai`,
    );
  }
  if (!r.vector) {
    throw new Error(
      `pgvector is not installed in ${target}. Embeddings cannot be stored.\n`
      + `  docker compose build db && docker compose up -d db && npm run db:migrate`,
    );
  }
  return target;
}

/**
 * Ingest one or more KB files.
 *
 * @param {object}   opts
 * @param {string[]} opts.only     restrict to files whose path contains one of these
 * @param {boolean}  opts.dryRun   chunk and report, but do not embed or write
 * @param {function} opts.log
 */
async function ingest({ only = [], dryRun = false, log = console.log } = {}) {
  // Dry runs never touch the database, so they stay usable with no DB at all.
  if (!dryRun) {
    const target = await preflight();
    log(`Database: ${target}\n`);
  }
  const targets = only.length
    ? SOURCES.filter((s) => only.some((o) => s.file.includes(o)))
    : SOURCES;

  if (!targets.length) {
    throw new Error(`No knowledge files matched: ${only.join(', ')}`);
  }

  const summary = { files: 0, documents: 0, chunks: 0, tokens: 0, failed: 0, skipped: 0 };

  for (const source of targets) {
    const full = path.join(KB_DIR, source.file);
    if (!fs.existsSync(full)) {
      log(`  ! missing, skipped: ${source.file}`);
      summary.skipped += 1;
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      log(`  ✗ ${source.file}: invalid JSON — ${err.message}`);
      summary.failed += 1;
      continue;
    }

    const chunks = chunkFile(source.file, parsed);
    const fileTokens = chunks.reduce((a, c) => a + c.tokens, 0);
    log(`  ${source.file}: ${chunks.length} chunks, ~${fileTokens.toLocaleString()} tokens`);
    summary.files += 1;
    summary.chunks += chunks.length;
    summary.tokens += fileTokens;
    if (dryRun || !chunks.length) continue;

    // Embed the whole file in one pass so batching is efficient, then write
    // each document in its own transaction. A failure partway through leaves
    // the documents already written intact and correctly indexed, rather than
    // rolling back an hour of embedding work.
    const embeddings = await embedBatch(chunks.map(embeddingText), {
      onProgress: (done, total) => {
        if (done === total || done % (96 * 4) === 0) log(`      embedded ${done}/${total}`);
      },
    });

    const sourceName = path.basename(source.file);
    for (const [i, chunk] of chunks.entries()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = (text, params) => client.query(text, params);
        const documentId = await upsertDocument(q, sourceName, chunk);
        await writeChunk(q, documentId, chunk, embeddings[i]);
        await client.query('COMMIT');
        summary.documents += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        summary.failed += 1;
        log(`  ✗ ${chunk.sourceRef}: ${err.message}`);
        // Record the failure against the document when one exists, so the admin
        // panel can show which articles are unindexed and why.
        await query(
          `UPDATE ai_knowledge_documents SET index_error = $2, indexed_at = NULL
            WHERE source = $1 AND source_ref = $3`,
          [sourceName, String(err.message).slice(0, 500), chunk.sourceRef],
        ).catch(() => {});
      } finally {
        client.release();
      }
    }
  }

  return summary;
}

/**
 * Re-index ONE admin-authored document.
 *
 * Different from file ingestion: the text is already in the database, and it is
 * free prose rather than a known JSON shape, so it is split by the generic
 * heading-aware splitter instead of a per-file adapter.
 *
 * Chunks are deleted and rebuilt rather than diffed. A document has a handful
 * of chunks, and a partial update is how a stale embedding survives an edit.
 */
async function reindexDocument(documentId) {
  const { rows } = await query(
    `SELECT id, title, body FROM ai_knowledge_documents WHERE id = $1`, [documentId],
  );
  const doc = rows[0];
  if (!doc) return { ok: false, error: 'Document not found' };
  if (!String(doc.body || '').trim()) {
    await query(
      `UPDATE ai_knowledge_documents SET index_error = $2, indexed_at = NULL WHERE id = $1`,
      [documentId, 'Body is empty — nothing to index'],
    );
    return { ok: false, error: 'Body is empty' };
  }

  const parts = splitLong(doc.title, `${doc.title}\n\n${doc.body}`);
  const client = await pool.connect();
  try {
    // Embed BEFORE opening the transaction. Holding a database transaction open
    // across a network call to OpenAI would pin a pooled connection for seconds.
    const embeddings = await embedBatch(parts);

    await client.query('BEGIN');
    await client.query('DELETE FROM ai_knowledge_chunks WHERE document_id = $1', [documentId]);
    for (let i = 0; i < parts.length; i += 1) {
      await client.query(
        `INSERT INTO ai_knowledge_chunks
           (document_id, chunk_index, content, heading, token_count, embedding)
         VALUES ($1,$2,$3,$4,$5,$6::vector)`,
        [documentId, i, parts[i], doc.title, estimateTokens(parts[i]),
          toVectorLiteral(embeddings[i])],
      );
    }
    await client.query(
      'UPDATE ai_knowledge_documents SET indexed_at = NOW(), index_error = NULL WHERE id = $1',
      [documentId],
    );
    await client.query('COMMIT');
    return { ok: true, chunks: parts.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Surfaced in the panel so a failed re-index is visible rather than silent.
    await query(
      'UPDATE ai_knowledge_documents SET index_error = $2, indexed_at = NULL WHERE id = $1',
      [documentId, String(err.message).slice(0, 500)],
    ).catch(() => {});
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
}

/** Counts for the admin panel and the verify script. */
async function indexStatus() {
  const { rows } = await query(`
    SELECT d.source,
           COUNT(*)::int                                            AS documents,
           COUNT(*) FILTER (WHERE d.indexed_at IS NOT NULL)::int    AS indexed,
           COUNT(*) FILTER (WHERE d.index_error IS NOT NULL)::int   AS errored,
           COUNT(c.id)::int                                         AS chunks,
           COUNT(c.id) FILTER (WHERE c.embedding IS NOT NULL)::int  AS embedded,
           COUNT(c.id) FILTER (WHERE c.is_retrievable)::int         AS retrievable
      FROM ai_knowledge_documents d
      LEFT JOIN ai_knowledge_chunks c ON c.document_id = d.id
     GROUP BY d.source ORDER BY d.source`);
  return rows;
}

module.exports = { ingest, indexStatus, embeddingText, preflight, reindexDocument, KB_DIR };
