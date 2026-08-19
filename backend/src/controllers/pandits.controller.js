const engine = require('../services/distribution/engine');
const { browsingMarketFor } = require('../services/distribution/market');
const { positionWeight } = require('../services/distribution/fairness');
const distributionRepo = require('../repositories/distribution.repository');
const templesRepo = require('../repositories/temples.repository');
const { query } = require('../config/db');
const repo = require('../repositories/pandits.repository');
const qualifiedLeads = require('../repositories/qualifiedLeads.repository');
const { readPaging, paginationEnvelope } = require('../utils/paginate');
const { normalizeContactMethod, LEAD_REJECTION, toSourceSurface } = require('../config/leads');
const { logActivityEvent, deviceTypeFromUserAgent, recentlyLogged } = require('../utils/activityLog');

/** Resolve an optional slug to an id, or null. Never throws — a bad slug must
 *  degrade the analytics pool, not fail the devotee's contact attempt. */
async function resolveSlug(finder, slug) {
  if (typeof slug !== 'string' || !slug) return null;
  try { return await finder(slug); } catch { return null; }
}

async function resolveServiceId(slug) {
  if (typeof slug !== 'string' || !slug) return null;
  try {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1', [slug]);
    return rows[0]?.id || null;
  } catch { return null; }
}

/**
 * `?rg=` — which reload of the page this is, for THIS session.
 *
 * Presentation input only: the engine clamps it into a small bounded range
 * (rotation.js's clampRefreshGeneration) before it can affect anything, so
 * this parse only needs to guard against a non-numeric or absurdly long
 * string reaching that clamp — never trust-and-forward.
 */
function readRefreshGeneration(req) {
  const raw = req.query.rg;
  if (typeof raw !== 'string' || !raw) return 0;
  const n = parseInt(raw.slice(0, 8), 10);
  return Number.isFinite(n) ? n : 0;
}

/** GET /api/pandits — filterable, sortable, paginated list.
 *  maxPerPage raised from the 48 default: several pages (the directory,
 *  Search, TempleDetail, ServiceDetail) fetch one bounded batch and then
 *  filter/sort/paginate it client-side rather than round-tripping per page —
 *  a temple with hundreds of associated pandits needs all of them in that
 *  one batch, or a city/temple filter silently looks near-empty. */
async function list(req, res) {
  const paging = readPaging(req.query, 12, 1000);
  const { city, service, lang, minExp, minRating, verified, sort, q } = req.query;
  const { market } = browsingMarketFor(req, typeof req.query.country === 'string' ? req.query.country : null);
  const { data, total } = await repo.list({
    q,
    city: city && [].concat(city),
    service: service && [].concat(service),
    lang: lang && [].concat(lang),
    minExp: minExp ? parseInt(minExp, 10) : undefined,
    minRating: minRating ? parseFloat(minRating) : undefined,
    verified,
    sort,
    page: paging.page,
    perPage: paging.perPage,
    market,
  });
  res.json(paginationEnvelope(data, paging, total));
}

/**
 * GET /api/pandits/distributed
 *
 * The fair-distribution listing. Unlike GET /api/pandits — which sorts by
 * rating and therefore hands the same pandits the top slots on every request —
 * this returns a page selected by the distribution engine:
 *
 *   market entitlement → plan bucket → fairness deficit → session rotation
 *
 * Two visitors get different pandits. The same visitor refreshing gets the same
 * order. Exposure is recorded for what actually rendered, which is what makes
 * the fairness correction work on the next request.
 */
async function distributed(req, res) {
  const paging = readPaging(req.query, 20, 50);
  const { temple, service } = req.query;

  /*
   * Market.
   *
   * geoMiddleware runs before optionalAuth, so req.geo was resolved without a
   * user — for a signed-in devotee it only ever saw the CDN header. Re-resolve
   * here, where req.user exists, so a verified phone or account country
   * outranks IP as the design requires.
   *
   * ?country= is honoured because it is a SERVING preference, not a location
   * claim: an NRI visiting India should be able to ask for the international
   * pool. It never touches billing — leadMarket is resolved separately, from
   * evidence, at the point a lead is qualified.
   */
  const browsing = browsingMarketFor(
    req,
    typeof req.query.country === 'string' ? req.query.country : null,
  );
  const market = browsing.market;

  /*
   * Do NOT charge exposure when the market came from an unverified self-
   * selection. Otherwise anyone could append ?country=US, browse the ₹15,000
   * international pool, and burn those pandits' exposure with no real prospect
   * behind it — quietly pushing them down for everyone else. Same reasoning the
   * engine already applies to UNKNOWN.
   */
  const trustedMarket = browsing.source !== 'user_selected';

  let templeId = null;
  if (temple) {
    const t = await templesRepo.findIdBySlug(temple);
    if (!t) return res.status(404).json({ error: 'Temple not found' });
    templeId = t;
  }
  let serviceId = null;
  if (service) {
    const { rows } = await query('SELECT id FROM services WHERE slug = $1 AND is_active', [service]);
    if (!rows[0]) return res.status(404).json({ error: 'Service not found' });
    serviceId = rows[0].id;
  }

  const result = await engine.distribute({
    market,
    templeId,
    serviceId,
    // Stable per visitor. A logged-in id is best (same order across their
    // devices); otherwise the client's own session key; IP only as a last
    // resort, since a shared NAT would give a whole office one rotation.
    sessionKey: req.user?.id || (typeof req.query.sk === 'string' ? req.query.sk.slice(0, 64) : null) || req.ip,
    pageSize: paging.perPage,
    page: paging.page,
    record: trustedMarket,
    refreshGeneration: readRefreshGeneration(req),
  });

  res.json({
    data: engine.toPublic(result.pandits),
    meta: {
      market: result.market,
      marketWasUnknown: result.marketWasUnknown || false,
      // Surfaced so the UI can prompt "India ya bahar se?" when we genuinely
      // do not know, instead of silently guessing on the devotee's behalf.
      marketSource: browsing.source,
      pool: result.pool,
      eligible: result.eligible,
      total: result.poolSize || 0,
      page: paging.page,
      perPage: paging.perPage,
      totalPages: Math.max(1, Math.ceil((result.poolSize || 0) / paging.perPage)),
    },
  });
}

/**
 * GET /api/pandits/distribution-order
 *
 * The whole fair order as `{ slug, position }[]`, not a page.
 *
 * For pages that fetch every pandit and filter/sort client-side (Pandits.tsx,
 * Home.tsx, and now TempleDetail.tsx/ServiceDetail.tsx), this gives them an
 * order to apply on top instead of rebuilding their filtering server-side —
 * the ordering is what was unfair, so the ordering is what moves.
 *
 * Deliberately records NO exposure. The server cannot know which of these the
 * client actually painted, because the client filters afterwards. Crediting all
 * of them would inflate every pandit's exposure equally and neutralise the very
 * counter it feeds. The client reports what it rendered via POST /exposure.
 */
async function distributionOrder(req, res) {
  const browsing = browsingMarketFor(
    req,
    typeof req.query.country === 'string' ? req.query.country : null,
  );

  const templeId = req.query.temple
    ? await resolveSlug(templesRepo.findIdBySlug, req.query.temple)
    : null;
  const serviceId = req.query.service ? await resolveServiceId(req.query.service) : null;

  const result = await engine.distribute({
    market: browsing.market,
    templeId,
    serviceId,
    sessionKey: req.user?.id || (typeof req.query.sk === 'string' ? req.query.sk.slice(0, 64) : null) || req.ip,
    // The full pool, not a page — this endpoint exists to give the client an
    // ordering it can apply to a list it already holds.
    pageSize: 1000,
    record: false,
    refreshGeneration: readRefreshGeneration(req),
  });

  res.json({
    generatedAt: new Date().toISOString(),
    market: result.market,
    marketSource: browsing.source,
    pool: result.pool,
    refreshGeneration: result.refreshGeneration,
    order: result.pandits.map((p) => ({ slug: p.slug, tier: p.tier, position: p.position })),
  });
}

/**
 * POST /api/pandits/exposure
 *
 * "These are the pandits I actually showed, in this order."
 *
 * Exposure has to be reported by whoever did the rendering. The alternative —
 * the server assuming its ordering was displayed verbatim — is wrong the moment
 * a devotee applies a filter, and wrong in the direction that matters: pandits
 * filtered OUT would be charged for visibility they never got, and would then
 * be pushed down for everyone else.
 *
 * The client sends slugs. Positions come from the array index, not from the
 * client, so a caller cannot claim slot 1 weight for a card at the bottom of
 * the page. Market is resolved server-side. Nothing here can create or modify a
 * lead.
 */
async function reportExposure(req, res) {
  const slugs = Array.isArray(req.body?.slugs) ? req.body.slugs : null;
  if (!slugs || !slugs.length) return res.status(400).json({ error: 'slugs[] is required' });

  // Cap the batch. An unbounded list would let one request write thousands of
  // exposure rows and skew the fairness window.
  const capped = slugs
    .filter((s) => typeof s === 'string' && s.length && s.length <= 120)
    .slice(0, 60);
  if (!capped.length) return res.status(400).json({ error: 'no valid slugs' });

  // selectedCountry is deliberately not accepted here — see distributed().
  const browsing = browsingMarketFor(req, null);

  // An unresolved or self-selected market must not be charged. Same rule the
  // engine applies: a counter written against a market we guessed corrupts the
  // input to every future ranking decision.
  if (browsing.market === 'UNKNOWN') {
    return res.json({ recorded: 0, reason: 'market_unknown' });
  }

  const templeId = await resolveSlug(templesRepo.findIdBySlug, req.body?.temple);
  const serviceId = await resolveServiceId(req.body?.service);
  const sessionKey = req.user?.id
    || (typeof req.body?.sk === 'string' ? req.body.sk.slice(0, 64) : null)
    || req.ip;

  // Resolve slugs to ids — unknown slugs are dropped, never inserted blind.
  const { rows } = await query(
    `SELECT id, slug FROM pandits WHERE slug = ANY($1::text[]) AND deleted_at IS NULL`,
    [capped],
  );
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));

  const payload = [];
  capped.forEach((slug, i) => {
    const id = idBySlug.get(slug);
    if (!id) return;
    const position = i + 1;
    payload.push({
      panditId: id,
      templeId,
      serviceId,
      market: browsing.market,
      position,
      positionWeight: Number(positionWeight(position).toFixed(3)),
      sessionKey,
    });
  });

  const recorded = await distributionRepo.recordExposure(payload);
  res.json({ recorded, market: browsing.market });
}

/** GET /api/pandits/:id — :id is the pandit's slug (unchanged from the old
 *  text-id scheme; the UUID primary key is exposed separately as `id`). */
async function getById(req, res) {
  const pandit = await repo.getBySlug(req.params.id);
  if (!pandit) return res.status(404).json({ error: 'Pandit not found' });
  res.json(pandit);
}

/** POST /api/pandits/:id/enquiry — the only "action" this API performs on a
 *  profile: recording that a devotee wants to be put in touch. WhatsApp/Call
 *  happen directly, client-side, straight to the pandit's own number. */
async function inquire(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });

  const { name, phone, service, date, message } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const id = await repo.addEnquiry({ panditId, serviceSlug: service, name, phone, date, message });
  res.status(201).json({ ok: true, id });
}

/**
 * POST /api/pandits/:id/click — the single contact endpoint.
 *
 * Deliberately extends the pre-existing click tracker rather than adding a
 * parallel "create lead" route: there is exactly one moment a devotee
 * expresses intent to contact, and it should be exactly one server call.
 *
 * Mounted with optionalAuth, not requireAuth — a guest tapping Call must
 * still be counted in the raw CTA funnel and must still get a coherent
 * answer, it just must never produce a lead. Whether this is a qualified
 * lead is decided HERE and in record_qualified_lead(), never by the client.
 *
 * The caller's identity comes from the bearer session only. A userId in the
 * request body is ignored — it is not read anywhere in this path.
 */
async function trackClick(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });

  const method = normalizeContactMethod(req.body?.method);
  if (!method) {
    return res.status(400).json({ error: 'method must be one of: call, phone_call, whatsapp' });
  }

  const rawSource = typeof req.body?.source === 'string' ? req.body.source.slice(0, 60) : null;
  const templeId = await resolveSlug(templesRepo.findIdBySlug, req.body?.temple);
  const serviceId = await resolveServiceId(req.body?.service);

  const { leadId, qualifiedLead, reason } = await qualifiedLeads.recordContact({
    panditId,
    userId: req.user?.id || null,   // session-derived, never client-supplied
    method,
    source: rawSource,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    // Pool context, resolved server-side from slugs the client sends. Validated
    // rather than trusted: an unknown slug becomes NULL (a lead with no pool),
    // never an arbitrary id written straight into qualified_leads.
    templeId,
    serviceId,
  });

  // contactAllowed is about the tel:/wa.me link, not about lead credit: a
  // duplicate inside the dedup window is still a perfectly legitimate call.
  // Only an unauthenticated or unverified devotee is asked to do something
  // first, and the frontend decides which prompt to show from `reason`.
  const needsAuth = reason === LEAD_REJECTION.NOT_AUTHENTICATED;
  const needsVerification = reason === LEAD_REJECTION.USER_NOT_VERIFIED;

  // Admin-visible activity timeline — best-effort, fired after the response
  // path is decided but not awaited, so a slow/failed write can never delay
  // or fail the devotee's Call/WhatsApp action. Separate from contact_clicks
  // (unchanged, still the funnel table the distribution engine reads) and
  // from qualified_leads (unchanged, still transactional) — this is a third,
  // additive, cross-event-type record purely for the admin timeline.
  const browsing = browsingMarketFor(req);
  void logActivityEvent({
    userId: req.user?.id || null,
    panditId,
    eventType: method === 'whatsapp' ? 'PANDIT_CHAT_CLICK' : 'PANDIT_CALL_CLICK',
    sourceSurface: toSourceSurface(rawSource),
    templeId,
    serviceId,
    country: browsing.countryCode,
    market: browsing.market === 'UNKNOWN' ? null : browsing.market,
    locationSource: browsing.source,
    qualifiedLeadId: leadId || null,
    deviceType: deviceTypeFromUserAgent(req.headers['user-agent']),
    metadata: { contactMethod: method, qualified: qualifiedLead, reason: qualifiedLead ? null : reason },
  });

  res.json({
    success: true,
    contactAllowed: !needsAuth && !needsVerification,
    interactionRecorded: true,
    qualifiedLead,
    ...(leadId ? { leadId } : {}),
    ...(qualifiedLead ? {} : { reason }),
  });
}

async function trackView(req, res) {
  const panditId = await repo.findIdBySlug(req.params.id);
  if (!panditId) return res.status(404).json({ error: 'Pandit not found' });
  await repo.addView(panditId);
  res.json({ ok: true });

  // Admin-visible timeline only — the pre-existing lifetime/daily counters
  // above (repo.addView) are unchanged and remain the source of truth for
  // the pandit's own dashboard. This is additive and intentionally NOT
  // awaited before responding (a view must never be slowed down by it).
  //
  // Deduped per (pandit, actor) within an hour — matching pandit_exposure's
  // own dedup window — so a page reload / React StrictMode double-mount /
  // retry does not spam the timeline with the "same visit" (Section 35/36:
  // a profile view is "the user opened the profile page", not every render).
  const userId = req.user?.id || null;
  const sessionKey = typeof req.body?.sk === 'string' ? req.body.sk.slice(0, 64) : null;
  (async () => {
    if (await recentlyLogged({ panditId, eventType: 'PANDIT_PROFILE_VIEW', userId, sessionKey })) return;
    const browsing = browsingMarketFor(req);
    await logActivityEvent({
      userId,
      sessionKey,
      panditId,
      eventType: 'PANDIT_PROFILE_VIEW',
      sourceSurface: 'PANDIT_PROFILE',
      country: browsing.countryCode,
      market: browsing.market === 'UNKNOWN' ? null : browsing.market,
      locationSource: browsing.source,
      deviceType: deviceTypeFromUserAgent(req.headers['user-agent']),
    });
  })().catch((err) => console.error('[activity] profile view tracking failed (non-fatal):', err.message));
}

module.exports = {
  list, getById, inquire,
  distributed, distributionOrder, reportExposure,
  trackClick, trackView,
};
