/**
 * Chunker tests — run against the REAL knowledge files, not fixtures.
 *
 * Fixtures would have passed while the shipped index was broken: the three bugs
 * these tests now pin (an 8,618-character section that never split, groups
 * overshooting the token ceiling, and two temples colliding on one sourceRef)
 * were all invisible until the actual corpus went through.
 *
 *   npm run test:chunker
 *
 * No database, no network, no API key.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { SOURCES, chunkFile, splitLong, groupSmall } = require('../src/services/ai/chunker');
const { estimateTokens, CHUNK_MAX_TOKENS } = require('../src/services/ai/config');

const KB = path.join(__dirname, '..', 'src', 'data', 'knowledge');
const load = (file) => JSON.parse(fs.readFileSync(path.join(KB, file), 'utf8'));

/** Every chunk from every source, computed once. */
const ALL = SOURCES.flatMap((s) => chunkFile(s.file, load(s.file)));

test('every knowledge file produces chunks', () => {
  for (const s of SOURCES) {
    const chunks = chunkFile(s.file, load(s.file));
    assert.ok(chunks.length > 0, `${s.file} produced no chunks`);
  }
});

test('no chunk exceeds the token ceiling', () => {
  const over = ALL.filter((c) => c.tokens > CHUNK_MAX_TOKENS);
  assert.deepStrictEqual(
    over.map((c) => `${c.sourceRef}=${c.tokens}`), [],
    'oversized chunks would overflow the prompt context',
  );
});

test('no chunk is empty or whitespace-only', () => {
  const empty = ALL.filter((c) => !c.content || !c.content.trim());
  assert.strictEqual(empty.length, 0);
});

test('sourceRefs are unique', () => {
  // uq_ai_doc_source_ref means a collision is a SILENT OVERWRITE, not an error,
  // so a duplicate here loses a document without any failure being reported.
  const seen = new Map();
  for (const c of ALL) seen.set(c.sourceRef, (seen.get(c.sourceRef) || 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  assert.deepStrictEqual(dupes, [], 'duplicate sourceRef would overwrite a document');
});

test('every chunk carries the metadata retrieval filters on', () => {
  for (const c of ALL) {
    assert.ok(c.title && c.title.trim(), `${c.sourceRef} has no title`);
    assert.ok(c.documentType, `${c.sourceRef} has no documentType`);
    assert.ok(['hi', 'en', 'hinglish'].includes(c.language),
      `${c.sourceRef} language "${c.language}" violates the ai_doc_language_valid CHECK`);
    assert.ok(Array.isArray(c.problemCategories));
    assert.ok(Array.isArray(c.intentTags));
  }
});

test('problem records keep diagnosis and pujas in ONE chunk', () => {
  // The whole point of content-aware chunking. Split these and retrieval
  // returns either empathy with no action, or action with no empathy.
  const problems = chunkFile('custom/problems-solutions.json', load('custom/problems-solutions.json'));
  assert.strictEqual(problems.length, 30, 'expected one chunk per problem record');

  const kalesh = problems.find((c) => c.sourceRef.endsWith('#ghar-mein-kalesh'));
  assert.ok(kalesh, 'ghar-mein-kalesh missing');
  assert.match(kalesh.content, /Samajh:/, 'diagnosis missing');
  assert.match(kalesh.content, /Navagraha Shanti Puja/, 'recommended puja missing');
  assert.match(kalesh.content, /Ghar ki Shuddhi/, 'DIY remedy missing');
});

test('userMightSay phrases are embedded verbatim', () => {
  // These are the strongest retrieval signal in the corpus — they live in the
  // same register as the incoming query. Paraphrasing them would break search.
  const raw = load('custom/problems-solutions.json');
  const chunks = chunkFile('custom/problems-solutions.json', raw);
  for (const record of raw) {
    const chunk = chunks.find((c) => c.sourceRef.endsWith(`#${record.id}`));
    for (const phrase of record.userMightSay || []) {
      assert.ok(chunk.content.includes(phrase),
        `"${phrase}" was not preserved verbatim in ${record.id}`);
    }
  }
});

test('every problem category reaches the taxonomy', () => {
  const raw = load('custom/problems-solutions.json');
  const chunks = chunkFile('custom/problems-solutions.json', raw);
  for (const record of raw) {
    const chunk = chunks.find((c) => c.sourceRef.endsWith(`#${record.id}`));
    assert.ok(chunk.problemCategories.includes(record.id), `${record.id} leaf slug missing`);
    assert.ok(chunk.problemCategories.includes(record.problemCategory),
      `${record.id} group "${record.problemCategory}" missing`);
  }
});

test('testimonials keep problem, action and result together', () => {
  const chunks = chunkFile('custom/real-experiences.json', load('custom/real-experiences.json'));
  assert.strictEqual(chunks.length, 110);
  const sample = chunks[0];
  assert.match(sample.content, /Samasya:/);
  assert.match(sample.content, /Kya kiya:/);
  assert.match(sample.content, /Kya hua:/);
  assert.strictEqual(sample.documentType, 'testimonial');
});

test('both temples named "Baglamukhi Mandir" survive', () => {
  // Ludhiana and Ujjain share a name; slugifying alone collapsed them into one.
  const chunks = chunkFile('custom/baglamukhi-knowledge.json', load('custom/baglamukhi-knowledge.json'));
  const temples = chunks.filter((c) => c.sourceRef.includes('#temple-'));
  const raw = load('custom/baglamukhi-knowledge.json').temples || [];
  assert.strictEqual(temples.length, raw.length, 'a temple was lost to a sourceRef collision');
});

test('the Gita is damped as scripture, not treated as guidance', () => {
  const chunks = chunkFile('scriptures/bhagavad-gita.json', load('scriptures/bhagavad-gita.json'));
  assert.ok(chunks.length > 0);
  for (const c of chunks) {
    assert.strictEqual(c.documentType, 'scripture');
    assert.ok(c.content.includes('Adhyay'), 'chapter heading not repeated on the chunk');
  }
});

test('splitLong handles text with no blank lines', () => {
  // The exact shape that shipped a 2,159-token chunk: single newlines only.
  const text = Array.from({ length: 400 }, (_, i) => `Line ${i} with some content here.`).join('\n');
  const parts = splitLong('Heading', text);
  assert.ok(parts.length > 1, 'single-newline text was not split');
  for (const p of parts) assert.ok(estimateTokens(p) <= CHUNK_MAX_TOKENS);
});

test('splitLong handles one unbroken oversized sentence', () => {
  const parts = splitLong('H', 'x'.repeat(20000));
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(estimateTokens(p) <= CHUNK_MAX_TOKENS);
});

test('groupSmall leaves headroom for the overshoot item', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ q: `Question ${i}?`, a: 'A'.repeat(300) }));
  const groups = groupSmall(items, (f) => `${f.q}\n${f.a}`);
  for (const g of groups) {
    const text = g.map((f) => `${f.q}\n${f.a}`).join('\n');
    assert.ok(estimateTokens(text) <= CHUNK_MAX_TOKENS,
      `group of ${g.length} exceeded the ceiling`);
  }
});

test('Devanagari is not under-counted by the token estimate', () => {
  // chars/4 would report Hindi as ~4x cheaper than it is and let chunks
  // silently blow the context budget.
  const hindi = 'व्यापार में रुकावट आ रही है और कोई भी काम नहीं बन रहा है।';
  const english = 'There are obstacles in business and no work is getting done.';
  const perChar = estimateTokens(hindi) / hindi.length;
  assert.ok(perChar > 0.5, `Devanagari estimated at ${perChar.toFixed(2)} tokens/char — too low`);
  assert.ok(estimateTokens(english) / english.length < 0.5);
});

test('chunking is deterministic', () => {
  // Re-ingest keys on sourceRef; if chunking were unstable, every run would
  // orphan the previous chunks and quietly grow the index.
  const a = chunkFile('custom/problems-solutions.json', load('custom/problems-solutions.json'));
  const b = chunkFile('custom/problems-solutions.json', load('custom/problems-solutions.json'));
  assert.deepStrictEqual(a.map((c) => c.sourceRef), b.map((c) => c.sourceRef));
  assert.deepStrictEqual(a.map((c) => c.content), b.map((c) => c.content));
});

test('unknown filenames return empty rather than throwing', () => {
  assert.deepStrictEqual(chunkFile('does-not-exist.json', {}), []);
});
