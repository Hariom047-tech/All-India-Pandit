/**
 * backend/src/utils/indexability.js — pure functions, no DB. Master SEO
 * prompt Parts 44-45: a bare name+city stub must not be indexed just
 * because a row exists; a deterministic per-entity-type rule decides.
 * Mirrored in frontend/app/src/lib/indexability.ts (docs/SEO_ARCHITECTURE.md
 * §15) — same thresholds on both sides so a crawler and a real browser
 * never disagree on whether a given entity page should be indexed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { isTempleIndexable, isServiceIndexable, isPanditIndexable } = require('../src/utils/indexability');

const LONG_TEXT = 'A genuinely long, real description with more than forty characters in it.';
const SHORT_TEXT = 'Too short.';

test('isTempleIndexable', async (t) => {
  await t.test('a bare name+city stub — no description, no relationships — is not indexable', () => {
    assert.equal(isTempleIndexable({ name: 'Stub Temple', city: 'X' }), false);
  });

  await t.test('a real description alone is enough', () => {
    assert.equal(isTempleIndexable({ description: LONG_TEXT }), true);
  });

  await t.test('short_description alias (`about`) alone is enough', () => {
    assert.equal(isTempleIndexable({ about: LONG_TEXT }), true);
  });

  await t.test('too-short text does not count as real content', () => {
    assert.equal(isTempleIndexable({ description: SHORT_TEXT }), false);
  });

  await t.test('at least one associated pandit is enough even with no description', () => {
    assert.equal(isTempleIndexable({ pandits: 1 }), true);
    assert.equal(isTempleIndexable({ pandits: 0 }), false);
  });

  await t.test('at least one linked catalogue service is enough even with no description', () => {
    assert.equal(isTempleIndexable({ services: ['rudrabhishek'] }), true);
    assert.equal(isTempleIndexable({ services: [] }), false);
  });

  await t.test('null/undefined temple is never indexable', () => {
    assert.equal(isTempleIndexable(null), false);
    assert.equal(isTempleIndexable(undefined), false);
  });
});

test('isServiceIndexable', async (t) => {
  await t.test('a catalogue entry with no description and nobody offering it is not indexable', () => {
    assert.equal(isServiceIndexable({ name: 'New Service' }), false);
  });

  await t.test('a real desc (the repository field name) is enough', () => {
    assert.equal(isServiceIndexable({ desc: LONG_TEXT }), true);
  });

  await t.test('short_description alone is enough', () => {
    assert.equal(isServiceIndexable({ short_description: LONG_TEXT }), true);
  });

  await t.test('at least one pandit actually offering it is enough even with no description', () => {
    assert.equal(isServiceIndexable({ pandit_count: 3 }), true);
    assert.equal(isServiceIndexable({ pandit_count: 0 }), false);
  });
});

test('isPanditIndexable', async (t) => {
  await t.test('verification status alone is not enough — still needs real content or a relationship', () => {
    assert.equal(isPanditIndexable({ verification_status: 'verified' }), false);
  });

  await t.test('an unverified pandit is never indexable, even with a rich bio and relationships', () => {
    assert.equal(isPanditIndexable({
      verification_status: 'pending', about: LONG_TEXT, services: ['rudrabhishek'], temples: ['kashi-vishwanath'],
    }), false);
  });

  await t.test('verified + a real bio is indexable', () => {
    assert.equal(isPanditIndexable({ verification_status: 'verified', about: LONG_TEXT }), true);
  });

  await t.test('verified + at least one linked service or temple is indexable even with a thin bio', () => {
    assert.equal(isPanditIndexable({ verification_status: 'verified', services: ['rudrabhishek'] }), true);
    assert.equal(isPanditIndexable({ verification_status: 'verified', temples: ['kashi-vishwanath'] }), true);
    assert.equal(isPanditIndexable({ verification_status: 'verified', services: [], temples: [] }), false);
  });
});
