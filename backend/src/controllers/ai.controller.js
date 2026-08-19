/**
 * AI assistant HTTP layer. Thin on purpose — validation, identity and shaping
 * only. All reasoning lives in services/ai/pipeline.service.js.
 */

const crypto = require('crypto');
const { runTurn } = require('../services/ai/pipeline.service');
const { fallbackResponse } = require('../services/ai/response.service');
const repo = require('../repositories/ai.repository');
const { AI_ENABLED } = require('../services/ai/config');
const { browsingMarketFor } = require('../services/distribution/market');

const MAX_MESSAGE = 1000;

/**
 * Guest identity, without a cookie.
 *
 * The obvious implementation puts an httpOnly cookie on the response — but
 * cookie-parser is not a dependency of this project, so `req.cookies` is always
 * undefined and every turn would mint a fresh key. A guest's conversation would
 * silently never continue, and "Nalkheda" in turn 3 would lose the business
 * puja from turn 1.
 *
 * So the key is issued in the response body and echoed back by the client. It
 * is 128 bits of randomness and grants nothing except the ability to continue
 * that one conversation — the same exposure a cookie would have had, with one
 * fewer dependency and no silent failure mode.
 */
function guestSessionKey(req) {
  const provided = req.body?.sessionKey;
  return (typeof provided === 'string' && /^[a-f0-9]{32}$/.test(provided))
    ? provided
    : crypto.randomBytes(16).toString('hex');
}

/** POST /api/ai/chat */
async function chat(req, res) {
  const { message, conversationId } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `message must be ${MAX_MESSAGE} characters or fewer` });
  }
  if (conversationId && !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return res.status(400).json({ error: 'conversationId must be a UUID' });
  }

  const sessionKey = req.user ? null : guestSessionKey(req);
  // Same resolution the listing endpoints use — a verified phone/account
  // outranks the CDN header, and a client cannot claim a market for itself.
  const { market } = browsingMarketFor(req, null);

  try {
    const result = await runTurn({
      message: message.trim(),
      conversationId,
      user: req.user || null,
      sessionKey,
      market,
    });
    // Echoed back so the guest's next turn lands on the same conversation.
    // Never sent to a logged-in user — their identity comes from the session.
    return res.json(sessionKey ? { ...result, sessionKey } : result);
  } catch (err) {
    // A devotee mid-conversation must never see a stack trace or a blank
    // screen. Log for us, degrade gracefully for them.
    console.error('[ai] pipeline failure:', err);
    return res.status(200).json({
      ...fallbackResponse('hinglish'),
      conversationId: conversationId || null,
      degraded: true,
    });
  }
}

/**
 * POST /api/ai/events
 *
 * Card clicks, profile opens, call and WhatsApp taps FROM THE ASSISTANT.
 *
 * This endpoint cannot create a qualified lead and must never be wired to do
 * so. Contact actions still go through the existing contact endpoint, which
 * runs record_qualified_lead() with its own auth, verification and dedup rules.
 * Recording an event here in addition is purely so CTR can be measured.
 */
async function recordEvent(req, res) {
  const { eventType, conversationId, messageId, panditId, serviceId, templeId, position } = req.body || {};

  if (!repo.EVENT_TYPES.has(eventType)) {
    return res.status(400).json({ error: 'unknown eventType' });
  }
  await repo.recordEvent({
    eventType,
    conversationId: conversationId || null,
    messageId: messageId || null,
    panditId: panditId || null,
    serviceId: serviceId || null,
    templeId: templeId || null,
    position: Number.isInteger(position) ? position : null,
    userId: req.user?.id || null,
  });
  // 202: recorded best-effort. Analytics must not make the UI wait or fail.
  return res.status(202).json({ ok: true });
}

/** POST /api/ai/feedback — the 👍/👎 under an answer. */
async function feedback(req, res) {
  const { messageId, helpful, reason, note } = req.body || {};
  if (!messageId || !/^[0-9a-f-]{36}$/i.test(messageId)) {
    return res.status(400).json({ error: 'messageId must be a UUID' });
  }
  if (typeof helpful !== 'boolean') {
    return res.status(400).json({ error: 'helpful must be true or false' });
  }
  const allowed = ['wrong_puja', 'wrong_pandit', 'wrong_location', 'not_relevant', 'other'];
  if (reason && !allowed.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${allowed.join(', ')}` });
  }

  await repo.recordFeedback({
    messageId,
    userId: req.user?.id || null,
    sessionKey: req.user ? null : (req.body?.sessionKey || null),
    helpful,
    reason,
    note,
  });
  return res.json({ ok: true });
}

/** GET /api/ai/status — lets the UI hide the assistant when it cannot work. */
async function status(req, res) {
  res.json({
    enabled: AI_ENABLED && Boolean(process.env.OPENAI_API_KEY),
  });
}

module.exports = { chat, recordEvent, feedback, status };
