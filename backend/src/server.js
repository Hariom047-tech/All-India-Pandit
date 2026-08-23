const app = require('./app');
const { pool } = require('./config/db');
const { port } = require('./config/env');

const server = app.listen(port, () => {
  console.log(`PanditConnect API listening on http://localhost:${port}`);
});

// Initialize chat service
const chatService = require('./services/chat.service');
chatService.initialize();

// Keeps pandits.current_tier from staying stale after a paid period expires
// (the distribution engine itself needs no cron — it already checks expiry
// reactively; see services/billing/expiryScheduler.js for what this is and
// isn't responsible for).
require('./services/billing/expiryScheduler').start();

// Dispatches subscription-expiry reminder notifications (7/5/3/1/0/-3 days
// by default, admin-configurable) — see services/billing/reminderScheduler.js.
require('./services/billing/reminderScheduler').start();

function shutdown(signal) {
  console.log(`\n${signal} received, closing server and database pool...`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));


