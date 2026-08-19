/**
 * backend/src/utils/seoMeta.js — pure functions, no DB, no server. These
 * lock down the exact fallback formulas that render.controller.js (Phase 7)
 * depends on matching frontend/app/src/lib/{Seo.tsx,structuredData.ts}'s
 * client-side generation field-for-field (docs/SEO_ARCHITECTURE.md §9) — a
 * regression here is a silent SEO content drift, not a crash, so it needs
 * its own tests rather than relying on the render endpoint's tests to catch it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const seoMeta = require('../src/utils/seoMeta');

test('homeMeta', () => {
  const meta = seoMeta.homeMeta();
  assert.equal(meta.canonicalPath, '/');
  assert.match(meta.title, /PanditSuggest/);
  assert.equal(meta.structuredData.length, 3);
  const org = meta.structuredData.find((n) => n['@type'] === 'Organization');
  const site = meta.structuredData.find((n) => n['@type'] === 'WebSite');
  const page = meta.structuredData.find((n) => n['@type'] === 'WebPage');
  assert.ok(org && site && page, 'expected Organization, WebSite, and WebPage nodes');

  // @id/@graph linking (docs/SEO_ARCHITECTURE.md §14): each node is stably
  // identified and cross-references the others, not three disconnected objects.
  assert.equal(org['@id'], 'https://panditsuggest.com/#organization');
  assert.equal(site['@id'], 'https://panditsuggest.com/#website');
  assert.deepEqual(site.publisher, { '@id': org['@id'] });
  assert.deepEqual(page.isPartOf, { '@id': site['@id'] });
  assert.deepEqual(page.about, { '@id': org['@id'] });
});

test('templeMeta', async (t) => {
  const base = {
    slug: 'kashi-vishwanath', name: 'Kashi Vishwanath Temple',
    city: 'Varanasi', state: 'Uttar Pradesh', address_line1: 'Lahori Tola',
    img: '/uploads/temple.jpg', lat: '25.310000', lng: '83.010000',
    rating: '4.80', reviews: 12, meta_title: null, meta_description: null,
  };

  await t.test('falls back to a generated title/description when meta_title/meta_description are unset', () => {
    const meta = seoMeta.templeMeta(base);
    assert.match(meta.title, /Kashi Vishwanath Temple/);
    assert.match(meta.description, /Varanasi/);
    assert.match(meta.description, /Uttar Pradesh/);
  });

  await t.test('admin-set meta_title/meta_description win when present', () => {
    const meta = seoMeta.templeMeta({ ...base, meta_title: 'Custom Title', meta_description: 'Custom description.' });
    assert.match(meta.title, /Custom Title/);
    assert.equal(meta.description, 'Custom description.');
  });

  await t.test('canonicalPath and OG image are built from real fields', () => {
    const meta = seoMeta.templeMeta(base);
    assert.equal(meta.canonicalPath, '/temples/kashi-vishwanath');
    assert.match(meta.ogImage, /\/uploads\/temple\.jpg$/);
  });

  await t.test('falls back to the default OG image when the temple has no img', () => {
    const meta = seoMeta.templeMeta({ ...base, img: null });
    assert.match(meta.ogImage, /logo-new\.png$/);
  });

  await t.test('lat/lng arrive as Postgres DECIMAL strings — geo must be numeric, not a quoted string', () => {
    const meta = seoMeta.templeMeta(base);
    const place = meta.structuredData.find((n) => n['@type'] === 'PlaceOfWorship');
    assert.equal(typeof place.geo.latitude, 'number');
    assert.equal(typeof place.geo.longitude, 'number');
    assert.equal(place.geo.latitude, 25.31);
  });

  await t.test('no lat/lng on the row means no geo field at all — never a fabricated 0,0', () => {
    const meta = seoMeta.templeMeta({ ...base, lat: null, lng: null });
    const place = meta.structuredData.find((n) => n['@type'] === 'PlaceOfWorship');
    assert.equal('geo' in place, false);
  });

  await t.test('aggregateRating only appears when there are real reviews behind it', () => {
    const withReviews = seoMeta.templeMeta(base);
    const placeWith = withReviews.structuredData.find((n) => n['@type'] === 'PlaceOfWorship');
    assert.deepEqual(placeWith.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 12 });

    const noReviews = seoMeta.templeMeta({ ...base, reviews: 0 });
    const placeWithout = noReviews.structuredData.find((n) => n['@type'] === 'PlaceOfWorship');
    assert.equal('aggregateRating' in placeWithout, false, 'zero reviews must never produce a fabricated aggregateRating');
  });

  await t.test('breadcrumb has Home > Temples > this temple, as absolute URLs', () => {
    const meta = seoMeta.templeMeta(base);
    const crumb = meta.structuredData.find((n) => n['@type'] === 'BreadcrumbList');
    assert.equal(crumb.itemListElement.length, 3);
    assert.equal(crumb.itemListElement[2].name, 'Kashi Vishwanath Temple');
    assert.match(crumb.itemListElement[2].item, /^https?:\/\/.+\/temples\/kashi-vishwanath$/);
  });

  await t.test('WebPage.about links to the PlaceOfWorship node by @id, not a duplicated copy', () => {
    const meta = seoMeta.templeMeta(base);
    const page = meta.structuredData.find((n) => n['@type'] === 'WebPage');
    const place = meta.structuredData.find((n) => n['@type'] === 'PlaceOfWorship');
    assert.deepEqual(page.about, { '@id': place['@id'] });
    assert.equal(place['@id'], 'https://panditsuggest.com/temples/kashi-vishwanath#place');
  });
});

test('serviceMeta', async (t) => {
  // services.repository.js aliases the description column as `desc`, not
  // `description` — a real bug this file's field name once had (see Phase 7
  // fix in seoMeta.js). Every fixture below intentionally omits `description`
  // to make sure a regression back to that field name shows up as a failure.
  const base = {
    slug: 'rudrabhishek', name: 'Rudrabhishek', desc: 'A powerful abhishek ritual for Lord Shiva.',
    short_description: 'Shiva abhishek ritual.', image_url: '/uploads/rudrabhishek.jpg',
    meta_title: null, meta_description: null, faqs: [],
  };

  await t.test('description falls back through meta_description -> short_description -> generated text', () => {
    assert.match(seoMeta.serviceMeta({ ...base, meta_description: 'Admin description.' }).description, /^Admin description\.$/);
    assert.equal(seoMeta.serviceMeta({ ...base, short_description: 'Short desc.' }).description, 'Short desc.');
    assert.match(
      seoMeta.serviceMeta({ ...base, short_description: null }).description,
      /Rudrabhishek: traditional significance/,
    );
  });

  await t.test('Service JSON-LD description uses `desc` (the repository field name), not a `description` field that does not exist', () => {
    const meta = seoMeta.serviceMeta(base);
    const svc = meta.structuredData.find((n) => n['@type'] === 'Service');
    assert.equal(svc.description, 'A powerful abhishek ritual for Lord Shiva.');
  });

  await t.test('FAQPage schema only appears when there are real FAQs to show', () => {
    const withFaqs = seoMeta.serviceMeta({ ...base, faqs: [{ q: 'Is samagri included?', a: 'Yes.' }] });
    assert.ok(withFaqs.structuredData.some((n) => n['@type'] === 'FAQPage'), 'expected a FAQPage node');
    const faqNode = withFaqs.structuredData.find((n) => n['@type'] === 'FAQPage');
    assert.equal(faqNode.mainEntity[0].name, 'Is samagri included?');
    assert.equal(faqNode.mainEntity[0].acceptedAnswer.text, 'Yes.');

    const withoutFaqs = seoMeta.serviceMeta({ ...base, faqs: [] });
    assert.equal(withoutFaqs.structuredData.some((n) => n['@type'] === 'FAQPage'), false);
  });

  await t.test('canonicalPath is built from the slug', () => {
    assert.equal(seoMeta.serviceMeta(base).canonicalPath, '/services/rudrabhishek');
  });

  await t.test('Service.provider references the Organization node by @id, and WebPage.about references the Service', () => {
    const meta = seoMeta.serviceMeta(base);
    const org = meta.structuredData.find((n) => n['@type'] === 'Organization');
    const svc = meta.structuredData.find((n) => n['@type'] === 'Service');
    const page = meta.structuredData.find((n) => n['@type'] === 'WebPage');
    assert.deepEqual(svc.provider, { '@id': org['@id'] });
    assert.equal('name' in svc.provider, false, 'must be a reference, not a re-embedded copy of Organization');
    assert.deepEqual(page.about, { '@id': svc['@id'] });
  });
});

test('panditMeta', async (t) => {
  const base = {
    slug: 'ramesh-sharma', name: 'Ramesh Sharma', city: 'Varanasi', state: 'Uttar Pradesh',
    exp: 22, img: '/uploads/pandit.jpg', rating: '4.90', reviews: 186,
    meta_title: null, meta_description: null,
  };

  await t.test('generated description includes years of experience and city/state', () => {
    const meta = seoMeta.panditMeta(base);
    assert.match(meta.description, /22 years of experience/);
    assert.match(meta.description, /Varanasi, Uttar Pradesh/);
  });

  await t.test('generated title prepends "Pandit " when the stored name lacks it', () => {
    const meta = seoMeta.panditMeta(base);
    assert.match(meta.title, /^Pandit Ramesh Sharma —/);
  });

  await t.test('generated title does not duplicate the honorific when the stored name already has it (Phase 12 technical SEO batch — real seeded data has 16 such rows)', () => {
    const meta = seoMeta.panditMeta({ ...base, name: 'Pandit Ramesh Sharma' });
    assert.match(meta.title, /^Pandit Ramesh Sharma —/);
    assert.equal(meta.title.includes('Pandit Pandit'), false);
  });

  await t.test('admin-set meta_description wins when present', () => {
    const meta = seoMeta.panditMeta({ ...base, meta_description: 'Custom pandit description.' });
    assert.equal(meta.description, 'Custom pandit description.');
  });

  await t.test('aggregateRating only appears with real reviews, matches numeric rating/reviews', () => {
    const meta = seoMeta.panditMeta(base);
    const profile = meta.structuredData.find((n) => n['@type'] === 'ProfilePage');
    assert.deepEqual(profile.mainEntity.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.9, reviewCount: 186 });

    const noReviews = seoMeta.panditMeta({ ...base, reviews: 0 });
    const profileNoReviews = noReviews.structuredData.find((n) => n['@type'] === 'ProfilePage');
    assert.equal('aggregateRating' in profileNoReviews.mainEntity, false);
  });

  await t.test('no fabricated LocalBusiness/credentials — Person type only, real fields only', () => {
    const meta = seoMeta.panditMeta(base);
    const profile = meta.structuredData.find((n) => n['@type'] === 'ProfilePage');
    assert.equal(profile.mainEntity['@type'], 'Person');
    assert.deepEqual(Object.keys(profile.mainEntity).sort(), ['@id', '@type', 'address', 'aggregateRating', 'image', 'name'].sort());
  });

  await t.test('Person and ProfilePage carry stable @ids, and ProfilePage is isPartOf the WebSite', () => {
    const meta = seoMeta.panditMeta(base);
    const site = meta.structuredData.find((n) => n['@type'] === 'WebSite');
    const profile = meta.structuredData.find((n) => n['@type'] === 'ProfilePage');
    assert.equal(profile['@id'], 'https://panditsuggest.com/pandits/ramesh-sharma#profilepage');
    assert.equal(profile.mainEntity['@id'], 'https://panditsuggest.com/pandits/ramesh-sharma#person');
    assert.deepEqual(profile.isPartOf, { '@id': site['@id'] });
    // Pandit pages deliberately have no separate generic WebPage node —
    // ProfilePage already is one (schema.org subtype) — see
    // structuredData.ts's webPageSchema docstring.
    assert.equal(meta.structuredData.some((n) => n['@type'] === 'WebPage'), false);
  });
});
