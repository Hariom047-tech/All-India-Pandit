/**
 * Retrieval scoring math. Pure functions, no database, no network.
 *
 * These pin the bug that made every single live query come back "low
 * confidence": raw cosine was compared against a 0.60 gate it could never
 * reach, and weights for absent signals silently ate the budget.
 *
 *   npm run test:retrieval
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  calibrateVector, effectiveWeights, confidenceOf, confidenceBand, normaliseLexical,
} = require('../src/services/ai/retrieval.service');

/* ── cosine calibration ───────────────────────────────────────────────── */

test('cosine is mapped onto a usable range, not used raw', () => {
  // Measured reality for text-embedding-3-small on short query vs long chunk:
  // an excellent match is ~0.50, an unrelated one ~0.20. Raw, both look "low".
  const floor = 0.20;
  const ceiling = 0.55;
  assert.ok(calibrateVector(0.50, floor, ceiling) > 0.8, 'a strong match must score high');
  assert.strictEqual(calibrateVector(0.20, floor, ceiling), 0, 'floor maps to 0');
  assert.strictEqual(calibrateVector(0.55, floor, ceiling), 1, 'ceiling maps to 1');
  assert.strictEqual(calibrateVector(0.10, floor, ceiling), 0, 'below floor clamps to 0');
  assert.strictEqual(calibrateVector(0.90, floor, ceiling), 1, 'above ceiling clamps to 1');
});

test('a degenerate floor/ceiling does not produce NaN', () => {
  assert.ok(Number.isFinite(calibrateVector(0.4, 0.5, 0.5)));
  assert.ok(Number.isFinite(calibrateVector(0.4, 0.8, 0.2)));
});

/* ── weight renormalisation ───────────────────────────────────────────── */

test('weights always sum to 1, whichever signals are present', () => {
  for (const combo of [
    { hasLexical: true, hasMetadata: true },
    { hasLexical: true, hasMetadata: false },
    { hasLexical: false, hasMetadata: true },
    { hasLexical: false, hasMetadata: false },
  ]) {
    const w = effectiveWeights(combo);
    const sum = w.vector + w.lexical + w.metadata;
    assert.ok(Math.abs(sum - 1) < 1e-9, `${JSON.stringify(combo)} summed to ${sum}`);
  }
});

test('a vector-only query can still reach 1.0', () => {
  // THE bug. A Devanagari query against a Roman-Hinglish corpus has no lexical
  // match, and a query naming no temple has no metadata boost — 0.40 of the
  // budget was unwinnable, capping such queries at 0.60 no matter how good.
  const w = effectiveWeights({ hasLexical: false, hasMetadata: false });
  assert.strictEqual(w.vector, 1);
  const perfect = w.vector * 1.0 + w.lexical * 0 + w.metadata * 0;
  assert.strictEqual(perfect, 1, 'a perfect vector match must be able to score 1.0');
});

test('lexical is only weighted when a lexical match exists', () => {
  assert.strictEqual(effectiveWeights({ hasLexical: false, hasMetadata: true }).lexical, 0);
  assert.ok(effectiveWeights({ hasLexical: true, hasMetadata: true }).lexical > 0);
});

/* ── confidence ───────────────────────────────────────────────────────── */

test('confidence rewards separation from the rest of the field', () => {
  const distinct = confidenceOf([0.70, 0.20, 0.15, 0.10]);
  const flat = confidenceOf([0.70, 0.68, 0.67, 0.66]);
  assert.ok(distinct.score > flat.score,
    'a clearly distinct top hit should beat a field where everything ties');
  assert.ok(distinct.margin > 0.5);
  assert.ok(flat.margin < 0.2);
});

test('an empty result set is zero confidence, not NaN', () => {
  const c = confidenceOf([]);
  assert.strictEqual(c.score, 0);
  assert.strictEqual(c.band, 'low');
});

test('a single result does not divide by zero', () => {
  const c = confidenceOf([0.8]);
  assert.ok(Number.isFinite(c.score) && Number.isFinite(c.margin));
});

test('confidence stays within 0-1', () => {
  for (const scores of [[1, 1, 1], [1, 0, 0], [0, 0, 0], [0.5], []]) {
    const c = confidenceOf(scores);
    assert.ok(c.score >= 0 && c.score <= 1, `${JSON.stringify(scores)} -> ${c.score}`);
  }
});

test('bands are ordered and reachable', () => {
  assert.strictEqual(confidenceBand(0.85), 'high');
  assert.strictEqual(confidenceBand(0.70), 'good');
  assert.strictEqual(confidenceBand(0.55), 'possible');
  assert.strictEqual(confidenceBand(0.30), 'low');
});

test('a good real-world match now clears the recommend gate', () => {
  // End-to-end sanity on the numbers actually observed live: raw cosine 0.45
  // for the correct chunk, no lexical match, no named entities. Under the old
  // scoring this produced 0.27 and was rejected. It must now pass.
  const w = effectiveWeights({ hasLexical: false, hasMetadata: false });
  const vector = calibrateVector(0.45, 0.20, 0.55);
  const top = w.vector * vector * 1.0;              // typeWeight 1.0 for guidance
  const others = [0.30, 0.25, 0.20].map((c) => w.vector * calibrateVector(c, 0.20, 0.55));
  const conf = confidenceOf([top, ...others]);

  assert.ok(conf.score >= 0.50,
    `a correct match scored ${conf.score.toFixed(3)} — still below the gate`);
});

test('an unrelated match still fails the gate', () => {
  // The fix must not simply pass everything. Raw cosine 0.22 against a flat
  // field is noise and must stay rejected.
  const w = effectiveWeights({ hasLexical: false, hasMetadata: false });
  const scores = [0.22, 0.21, 0.20, 0.20].map((c) => w.vector * calibrateVector(c, 0.20, 0.55));
  assert.ok(confidenceOf(scores).score < 0.50, 'noise was accepted as a confident match');
});

/* ── lexical normalisation ────────────────────────────────────────────── */

test('ts_rank is normalised within the result set', () => {
  const f = normaliseLexical([{ lscore: 0.08 }, { lscore: 0.04 }, { lscore: 0 }]);
  assert.strictEqual(f(0.08), 1);
  assert.strictEqual(f(0.04), 0.5);
});

test('no lexical matches yields zero, not NaN', () => {
  const f = normaliseLexical([{ lscore: 0 }, { lscore: 0 }]);
  assert.strictEqual(f(0), 0);
});
