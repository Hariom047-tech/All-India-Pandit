const { nodeEnv } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[panditconnect-backend]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(nodeEnv === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
