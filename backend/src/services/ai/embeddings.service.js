/**
 * Embedding generation.
 *
 * One job: turn text into vectors of exactly EMBEDDING_DIMENSIONS floats, or
 * throw. Nothing here writes to the database.
 */

const OpenAI = require('openai');
const { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = require('./config');

/** OpenAI's per-request input cap is far higher, but 96 keeps each request
 *  small enough that a retry after a 429 is cheap rather than a 5-minute redo. */
const BATCH_SIZE = 96;
const MAX_RETRIES = 5;

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set — embeddings cannot be generated.');
  }
  client = new OpenAI({ apiKey });
  return client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry on rate limits and transient server errors only.
 *
 * A 400 means the input is wrong (too long, empty, bad encoding) and will be
 * wrong again in two seconds — retrying it just burns quota and delays the real
 * error by half a minute.
 */
function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  if (status >= 500) return true;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err?.code);
}

async function callWithRetry(inputs) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await getClient().embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      // Exponential backoff with jitter; honour Retry-After when the API sends
      // one, because guessing shorter than the server asked just gets a 429 again.
      const retryAfter = Number(err?.headers?.['retry-after']) * 1000;
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : (2 ** attempt) * 1000 + Math.random() * 400;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

/**
 * Embed an array of strings. Returns vectors in the SAME ORDER as the input.
 *
 * Order matters more than it looks: the caller zips these straight onto chunk
 * rows, so a reordering would attach every embedding to the wrong text and
 * produce a search index that is quietly, completely wrong. The API returns an
 * `index` on each item; we sort by it rather than trusting array position.
 */
async function embedBatch(texts, { onProgress } = {}) {
  const inputs = texts.map((t) => (typeof t === 'string' ? t : String(t ?? '')).trim());
  if (inputs.some((t) => !t)) {
    throw new Error('Refusing to embed an empty string — check the chunker output.');
  }

  const out = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const slice = inputs.slice(i, i + BATCH_SIZE);
    const res = await callWithRetry(slice);

    const ordered = [...res.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== slice.length) {
      throw new Error(`Embedding count mismatch: sent ${slice.length}, got ${ordered.length}`);
    }
    for (const item of ordered) {
      // Guards against a model or config change silently producing the wrong
      // width. pgvector would reject it, but only after a partial re-index —
      // failing here means nothing was written.
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Model ${EMBEDDING_MODEL} returned ${item.embedding.length} dimensions, `
          + `but the ai_knowledge_chunks.embedding column is vector(${EMBEDDING_DIMENSIONS}). `
          + 'Change the model back, or write a migration to alter the column.',
        );
      }
      out.push(item.embedding);
    }
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, inputs.length), inputs.length);
  }
  return out;
}

/** Single text — used by the query side, where there is exactly one string. */
async function embedOne(text) {
  const [vec] = await embedBatch([text]);
  return vec;
}

/** pgvector's text input format: '[0.1,0.2,...]'. */
function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

module.exports = { embedBatch, embedOne, toVectorLiteral, BATCH_SIZE };
