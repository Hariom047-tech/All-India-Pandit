const { query } = require('../config/db');

async function addMessage({ name, email, phone, subject, message }) {
  const { rows } = await query(
    `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, email, phone || null, subject || null, message],
  );
  return rows[0].id;
}

async function findSubscriber(email) {
  const { rows } = await query('SELECT id FROM newsletter_subscribers WHERE lower(email) = lower($1)', [email]);
  return rows[0] || null;
}

async function addSubscriber(email) {
  const { rows } = await query('INSERT INTO newsletter_subscribers (email) VALUES ($1) RETURNING id', [email]);
  return rows[0].id;
}

module.exports = { addMessage, findSubscriber, addSubscriber };
