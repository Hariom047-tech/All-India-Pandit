/**
 * Which market is this visitor in?
 *
 * Answering this without a signup and without asking for GPS. Two DIFFERENT
 * answers are needed and conflating them is the mistake to avoid:
 *
 *   browsingMarket  — which pandits to SHOW. Guessed from IP. Cheap to get
 *                     wrong: a VPN user sees the wrong pool for one page.
 *   leadMarket      — which market a qualified lead is BILLED to. Must be
 *                     evidence-backed, because it decides whose plan gets
 *                     credited and therefore who gets paid.
 *
 * IP is fine for the first. It is not acceptable for the second — a VPN, a
 * corporate proxy, a roaming SIM or a devotee travelling would misattribute
 * revenue, and the pandit whose plan was charged has no way to dispute it.
 */

/** The only two markets. UNKNOWN is a real state, not a synonym for one of them. */
const MARKETS = { INDIA: 'INDIA', INTERNATIONAL: 'INTERNATIONAL', UNKNOWN: 'UNKNOWN' };

const toMarket = (countryCode) => {
  if (!countryCode) return MARKETS.UNKNOWN;
  return String(countryCode).trim().toUpperCase() === 'IN'
    ? MARKETS.INDIA
    : MARKETS.INTERNATIONAL;
};

/* ── CDN geolocation ──────────────────────────────────────────────────── */

/**
 * Country from the edge, in order of trust.
 *
 * CDN headers only. A client-supplied country header is worthless — anyone can
 * send `X-Country: US` with curl, and if that decided the pool it would be a
 * free upgrade into the international pandit list.
 *
 * The trust boundary is the CDN: these headers are set by CloudFront or
 * Cloudflare and cannot be forged by the browser, PROVIDED the origin is not
 * reachable directly. If your ALB accepts public traffic, an attacker bypasses
 * the CDN and forges these freely — lock the origin to the CDN's IP ranges.
 */
/*
 * Values every CDN uses to mean "could not determine".
 *
 * These must be rejected for ALL sources, not just Cloudflare. CloudFront and
 * Vercel both emit XX as well, and letting one through is worse than having no
 * country at all: `toMarket` maps anything that is not IN to INTERNATIONAL, so
 * an unrecognised placeholder becomes a free upgrade into the premium pool.
 */
const EDGE_PLACEHOLDERS = new Set(['XX', 'T1', 'ZZ', 'A1', 'A2', 'O1', 'AP', 'EU']);

/**
 * Normalise one header value into a country code, or null.
 *
 * The shape check is the important part. A country code is exactly two ASCII
 * letters — anything else is a misconfigured proxy or a forged header, and in
 * both cases the honest answer is "unknown".
 */
function normaliseCountry(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (EDGE_PLACEHOLDERS.has(code)) return null;
  return code;
}

/**
 * The edge headers this deployment trusts, highest-priority first.
 *
 * The four well-known vendor headers are always available — a deployment
 * behind CloudFront gets working geo detection with zero configuration.
 * `GEO_COUNTRY_HEADER` lets ops ADD one more (a header a load balancer or a
 * not-yet-listed CDN uses) without a code change, and it is tried FIRST,
 * since an explicitly configured header is a stronger signal than a guess
 * from the vendor list. `TRUST_CDN_GEO=false` is the kill switch: every
 * source is disabled at once, for a deployment that is not yet confident its
 * origin is unreachable directly (see Cloud Section 9 / docker-compose.yml's
 * backend port binding) and would rather fall back to UNKNOWN for everyone
 * than risk trusting a forgeable header.
 *
 * Evaluated per call, not cached at module load — this file's test suite
 * flips the env var mid-run, and a production process must not need a
 * restart to pick up a config change either.
 */
function trustedEdgeSources() {
  if (process.env.TRUST_CDN_GEO === 'false') return [];
  const configured = (process.env.GEO_COUNTRY_HEADER || '').trim().toLowerCase();
  const base = [
    ['cloudfront-viewer-country', 'cloudfront'],
    ['cf-ipcountry', 'cloudflare'],
    ['x-appengine-country', 'gae'],
    ['x-vercel-ip-country', 'vercel'],
  ];
  if (!configured || base.some(([header]) => header === configured)) return base;
  return [[configured, 'configured'], ...base];
}

function countryFromEdge(headers = {}) {
  const h = (name) => headers[name] || headers[name.toLowerCase()] || null;

  // Only headers a CDN sets at the edge — never an application header a
  // client could set, because a proxy that forgets to strip those would let
  // any visitor pick their own market.
  for (const [header, source] of trustedEdgeSources()) {
    const code = normaliseCountry(h(header));
    if (code) return { code, source };
  }

  return { code: null, source: 'none' };
}

/** Region and city, for personalisation only — never for entitlement. */
function regionFromEdge(headers = {}) {
  const h = (name) => headers[name] || headers[name.toLowerCase()] || null;
  return {
    region: h('cloudfront-viewer-country-region') || h('x-vercel-ip-country-region') || null,
    city: h('cloudfront-viewer-city') || h('x-vercel-ip-city') || null,
  };
}

/* ── browsing market ──────────────────────────────────────────────────── */

/**
 * What to show a visitor who has not logged in.
 *
 * An explicit choice wins over IP: an NRI visiting India should be able to say
 * "serve me as international" and have that respected. That is a SERVING
 * preference, not a claim about physical location, which is why it is allowed
 * to override the edge — and why it never touches leadMarket.
 */
function resolveBrowsingMarket({ headers = {}, selectedCountry = null, user = null }) {
  if (user?.verified_phone_country) {
    return {
      market: toMarket(user.verified_phone_country),
      source: 'verified_phone',
      countryCode: user.verified_phone_country,
    };
  }
  if (user?.country_code) {
    return { market: toMarket(user.country_code), source: 'account', countryCode: user.country_code };
  }
  if (selectedCountry) {
    return { market: toMarket(selectedCountry), source: 'user_selected', countryCode: selectedCountry };
  }
  const edge = countryFromEdge(headers);
  if (edge.code) return { market: toMarket(edge.code), source: edge.source, countryCode: edge.code };

  return { market: MARKETS.UNKNOWN, source: 'none', countryCode: null };
}

/**
 * What an UNKNOWN visitor should see.
 *
 * Not a coin flip, and not silently "INTERNATIONAL". Showing the union of both
 * pools is the honest default — every pandit visible to somebody gets a chance,
 * nobody is excluded on a guess — and the UI asks the visitor to pick, which
 * costs one tap and produces a real answer.
 */
function poolsForBrowsing(market) {
  switch (market) {
    case MARKETS.INDIA: return ['bharat', 'global'];
    case MARKETS.INTERNATIONAL: return ['international', 'global'];
    default: return ['bharat', 'global', 'international'];
  }
}

/* ── lead market ──────────────────────────────────────────────────────── */

/**
 * Which market a QUALIFIED LEAD belongs to. This decides billing, so the
 * precedence is strict and every answer records how it was reached.
 *
 * IP is last and, on its own, produces a LOW-confidence result. The caller
 * should treat low confidence as "attribute, but flag for review" rather than
 * silently charging a plan on the strength of a geolocation lookup.
 */
function resolveLeadMarket({
  verifiedPhoneCountry = null,
  verifiedAccountCountry = null,
  selectedCountry = null,
  ipCountry = null,
} = {}) {
  if (verifiedPhoneCountry) {
    return {
      market: toMarket(verifiedPhoneCountry),
      source: 'VERIFIED_PHONE',
      confidence: 'high',
      countryCode: verifiedPhoneCountry,
    };
  }
  if (verifiedAccountCountry) {
    return {
      market: toMarket(verifiedAccountCountry),
      source: 'VERIFIED_ACCOUNT',
      confidence: 'high',
      countryCode: verifiedAccountCountry,
    };
  }
  if (selectedCountry) {
    return {
      market: toMarket(selectedCountry),
      source: 'USER_SELECTED',
      confidence: 'medium',
      countryCode: selectedCountry,
    };
  }
  if (ipCountry) {
    return { market: toMarket(ipCountry), source: 'IP_GEO', confidence: 'low', countryCode: ipCountry };
  }
  return { market: MARKETS.UNKNOWN, source: 'NONE', confidence: 'none', countryCode: null };
}

/**
 * Dialling code → ISO country, for the countries that matter here.
 *
 * Order matters: +1 is a prefix of nothing here, but longer codes must be
 * tested before shorter ones or +971 would match +97... nothing, and +91 would
 * shadow +91xx. Sorted by length descending at match time.
 */
const DIAL_CODES = {
  91: 'IN', 977: 'NP', 880: 'BD', 94: 'LK',
  1: 'US', 44: 'GB', 971: 'AE', 61: 'AU', 65: 'SG', 60: 'MY',
  64: 'NZ', 27: 'ZA', 966: 'SA', 974: 'QA', 968: 'OM', 973: 'BH', 965: 'KW',
  49: 'DE', 33: 'FR', 39: 'IT', 31: 'NL', 41: 'CH', 46: 'SE', 47: 'NO',
  353: 'IE', 351: 'PT', 34: 'ES', 81: 'JP', 82: 'KR', 852: 'HK', 66: 'TH',
};

/** ISO country from an E.164 phone number. Null when it cannot be determined. */
function countryFromPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) {
    // A bare 10-digit number in this product is an Indian mobile — but say so
    // rather than assuming silently elsewhere in the codebase.
    return /^\d{10}$/.test(digits) ? 'IN' : null;
  }
  const bare = digits.slice(1);
  const codes = Object.keys(DIAL_CODES).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (bare.startsWith(code)) return DIAL_CODES[code];
  }
  return null;
}

/* ── express middleware ───────────────────────────────────────────────── */

/**
 * Attaches req.geo. Never reads a body or query parameter for country — a
 * client-declared country would let anyone pick their own pool.
 *
 * `selectedCountry` comes from a signed/session-held preference, which the
 * caller sets explicitly; it is not accepted from an arbitrary request field.
 */
/**
 * Development-only country override.
 *
 * WHY THIS EXISTS: on localhost there is no CDN, so no edge header, so the
 * market is always UNKNOWN — and the exposure endpoint deliberately refuses to
 * record against an unknown market. The result is that a developer testing
 * locally sees an empty `pandit_exposure` table and concludes the fairness
 * engine is broken, when it is behaving exactly as designed. There is no way to
 * exercise the INDIA/INTERNATIONAL split on a laptop without this.
 *
 * WHY IT IS SAFE: it requires an explicit opt-in environment variable AND a
 * non-production NODE_ENV. Not NODE_ENV alone — NODE_ENV is frequently unset,
 * and "unset" must never be enough to unlock a header that picks which pandits
 * a visitor sees. Both conditions are checked on every call rather than cached,
 * so it cannot be flipped on by a later mutation.
 *
 *     ALLOW_DEV_GEO_HEADER=1 npm run dev
 *     curl -H 'X-Dev-Country: US' localhost:4000/api/pandits/distribution-order
 */
/**
 * Same override, without a header — one env var a developer sets once for
 * the whole local server instead of remembering a curl flag every time.
 *
 * A per-request header (`X-Dev-Country`, above) is still the better tool for
 * exercising more than one market against a single running server — this is
 * for the common case of "everyone on this team just wants INDIA locally"
 * without a curl incantation. The safety gate is identical and independent:
 * `ALLOW_DEV_GEO_HEADER` does not need to be set for this one to apply, but
 * `NODE_ENV === 'production'` disables it exactly the same way.
 */
function devCountryOverrideEnv() {
  if (process.env.NODE_ENV === 'production') return null;
  return normaliseCountry(process.env.DEV_COUNTRY_OVERRIDE);
}

/**
 * The per-request header wins when both are set — it is the more specific,
 * more deliberate signal (someone is actively testing one request as a
 * different market), while the env var is a passive whole-server default.
 */
function devCountryOverride(headers = {}) {
  if (process.env.ALLOW_DEV_GEO_HEADER === '1' && process.env.NODE_ENV !== 'production') {
    const fromHeader = normaliseCountry(headers['x-dev-country'] || headers['X-Dev-Country']);
    if (fromHeader) return fromHeader;
  }
  return devCountryOverrideEnv();
}

function geoMiddleware(req, res, next) {
  const dev = devCountryOverride(req.headers);
  const edge = dev ? { code: dev, source: 'dev_override' } : countryFromEdge(req.headers);
  const { region, city } = regionFromEdge(req.headers);
  const selected = req.session?.selectedCountry || null;

  const browsing = dev
    ? { market: toMarket(dev), source: 'dev_override', countryCode: dev }
    : resolveBrowsingMarket({
      headers: req.headers,
      selectedCountry: selected,
      user: req.user || null,
    });

  req.geo = {
    countryCode: browsing.countryCode,
    detectedCountryCode: edge.code,
    detectionSource: edge.source,
    region,
    city,
    market: browsing.market,
    marketSource: browsing.source,
    pools: poolsForBrowsing(browsing.market),
  };
  next();
}

/**
 * The browsing market for a request, resolved at the point req.user exists.
 *
 * geoMiddleware runs before optionalAuth, so `req.geo` was computed without a
 * user and only ever saw the CDN header. Route handlers that care about a
 * signed-in devotee's verified country must re-resolve — and they must do it
 * through THIS function, not by calling resolveBrowsingMarket directly, or the
 * dev override silently applies in the middleware and not in the handler.
 *
 * @param {object} req
 * @param {string|null} selectedCountry an explicit serving preference, if the
 *        route accepts one. Never a location claim — see resolveBrowsingMarket.
 */
function browsingMarketFor(req, selectedCountry = null) {
  const dev = devCountryOverride(req.headers || {});
  if (dev) return { market: toMarket(dev), source: 'dev_override', countryCode: dev };

  return resolveBrowsingMarket({
    headers: req.headers || {},
    selectedCountry,
    user: req.user || null,
  });
}

module.exports = {
  normaliseCountry,
  devCountryOverride,
  browsingMarketFor,
  MARKETS,
  toMarket,
  countryFromEdge,
  regionFromEdge,
  resolveBrowsingMarket,
  resolveLeadMarket,
  countryFromPhone,
  poolsForBrowsing,
  geoMiddleware,
  DIAL_CODES,
};
