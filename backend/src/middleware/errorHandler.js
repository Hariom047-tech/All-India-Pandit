const { nodeEnv } = require('../config/env');

/**
 * Deliberately does NOT echo the requested path.
 *
 * `No route: GET /api/<secret>/users` reflected an attacker's own probe back
 * at them, which confirms what they tried and makes scanning output tidy and
 * greppable. A flat response tells them nothing they did not already know.
 */
function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Postgres error codes that mean "this database is not on the current schema".
 * Worth a distinct, actionable message: the operator seeing it is an
 * authenticated admin, and "run the migration" is exactly what they need to
 * know. The raw SQL text still never leaves the server.
 */
const SCHEMA_ERROR_CODES = new Set([
  '42883', // undefined_function
  '42P01', // undefined_table
  '42703', // undefined_column
]);

const MIGRATION_HINT =
  'This database is missing a required migration. '
  + 'Run: docker compose exec -T db psql -U panditconnect -d panditconnect < backend/src/db/03-qualified-leads.sql';

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Full detail always goes to the server log, never to the client.
  console.error('[panditconnect-backend]', err);

  // Errors this app raised on purpose carry a status and a message written for
  // a human — those are safe to pass through verbatim.
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  /*
   * A business rule the database enforced, not a fault.
   *
   * The seat-cap trigger (migration 19) raises this when someone tries to sell
   * a plan that is full. Without this branch it would fall through to the
   * generic 500 handler and the admin would see "Kuch galat ho gaya" for a
   * situation that has a precise cause and an obvious fix — which is exactly
   * how a working safety rail gets mistaken for a broken app and switched off.
   *
   * DETAIL and HINT are written for an operator and contain no schema
   * information, so they are safe to pass through.
   */
  if (err.message === 'seat_cap_reached' || err.detail?.includes('seats held')) {
    return res.status(409).json({
      error: err.detail || 'That plan has no seats left.',
      hint: err.hint,
      code: 'seat_cap_reached',
    });
  }

  if (SCHEMA_ERROR_CODES.has(err.code)) {
    const detail = nodeEnv === 'development'
      ? ` | DB error: ${err.message}`
      : '';
    return res.status(503).json({ error: MIGRATION_HINT + detail, code: 'migration_pending' });
  }

  // Everything else is an unhandled fault. A raw driver message can disclose
  // table names, column names and query shape, so it is replaced with a
  // generic one outside development.
  res.status(err.status || 500).json({
    error: nodeEnv === 'development'
      ? (err.message || 'Internal server error')
      : 'Kuch galat ho gaya. Thodi der baad try karein.',
    ...(nodeEnv === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
