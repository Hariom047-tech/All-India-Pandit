/** Wraps an async route handler so a rejected promise reaches errorHandler
 *  instead of becoming an unhandled rejection. Every controller is async now
 *  that they query Postgres. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
