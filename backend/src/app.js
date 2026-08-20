const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { corsOrigin } = require('./config/env');
const { apiLimiter } = require('./middleware/security');
const { checkIpBan } = require('./middleware/ipBan');
const { normalizeIp } = require('./middleware/normalizeIp');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { verifyOrigin } = require('./middleware/originVerify');

const app = express();

// First: reject anything that did not come through CloudFront, when
// ORIGIN_SHARED_SECRET is configured — see middleware/originVerify.js.
// A no-op until that env var is set, so local dev is unaffected.
app.use(verifyOrigin);

app.use(express.static(path.join(__dirname, '../public')));

app.use(helmet({
  // This is a JSON API with no HTML views of its own, so a page-oriented
  // CSP buys nothing — but the default same-origin Cross-Origin-Resource-
  // Policy would break the supported "frontend on :8080 fetching the
  // backend directly on :4000, no nginx proxy" dev setup (see README), so
  // that one's relaxed explicitly rather than left to helmet's default.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: corsOrigin }));
// Before anything that reads req.ip (ban check, logging, sessions) — see
// middleware/normalizeIp.js for why this has to happen at all.
app.use(normalizeIp);
// Ahead of rate limiting — a banned IP shouldn't even burn rate-limit quota.
app.use(checkIpBan);
app.use(apiLimiter);
// Razorpay webhook signature verification needs the exact raw bytes sent —
// carved out here, ahead of the general json() parser, so it doesn't get
// re-serialized first (see routes/payments.routes.js + controllers/payments.controller.js).
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

/*
 * Visitor market detection, before the routes so every handler has req.geo.
 *
 * Reads CDN headers only — a client-supplied country is ignored, otherwise
 * anyone could curl their way into the international pandit pool. See
 * services/distribution/market.js for the trust boundary caveat.
 */
app.use('/api', require('./services/distribution/market').geoMiddleware);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
