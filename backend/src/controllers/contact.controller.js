const repo = require('../repositories/contact.repository');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/contact */
async function send(req, res) {
  const { name, email, phone, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email is not valid' });

  const id = await repo.addMessage({ name, email, phone, subject, message });
  res.status(201).json({ ok: true, id });
}

/** POST /api/newsletter */
async function subscribe(req, res) {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'a valid email is required' });

  if (await repo.findSubscriber(email)) return res.json({ ok: true, alreadySubscribed: true });

  const id = await repo.addSubscriber(email);
  res.status(201).json({ ok: true, id });
}

module.exports = { send, subscribe };
