const app = require('./app');
const { pool } = require('./config/db');
const { port } = require('./config/env');

const server = app.listen(port, () => {
  console.log(`PanditConnect API listening on http://localhost:${port}`);
});

// Initialize chat service
const chatService = require('./services/chat.service');
chatService.initialize();

function shutdown(signal) {
  console.log(`\n${signal} received, closing server and database pool...`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
