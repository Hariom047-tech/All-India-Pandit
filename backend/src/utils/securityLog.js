const { query } = require('../config/db');

/** Roughly follows security_architecture.md's severity list — trimmed to
 *  the events this app actually raises today. */
const SEVERITY = {
  LOGIN_FAILED: 'warn',
  RATE_LIMIT_EXCEEDED: 'warn',
  AUTH_RATE_LIMIT_EXCEEDED: 'warn',
  WEBHOOK_SIGNATURE_INVALID: 'error',
  UNAUTHORIZED_ACCESS: 'warn',
};

/** Writes to security_audit_log (01-schema.sql) — append-only, no
 *  email/Slack alerting wired up (no mail/webhook service configured; see
 *  docs/SECURITY.md). Deliberately not awaited by callers on hot paths (the
 *  rate-limit handler in particular): a slow or failing audit write must
 *  never add latency to, or break, the request it's describing — errors
 *  are swallowed here, not propagated. */
async function logSecurityEvent(eventType, req, details = {}) {
  const severity = SEVERITY[eventType] || 'info';
  try {
    await query(
      `INSERT INTO security_audit_log (event_type, severity, user_id, ip_address, user_agent, request_path, request_method, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        eventType, severity, req?.user?.id || null, req?.ip || null,
        req?.headers?.['user-agent'] || null, req?.path || null, req?.method || null,
        JSON.stringify(details),
      ],
    );
  } catch (err) {
    console.error('[panditconnect-backend] failed to write security_audit_log:', err.message);
  }
}

module.exports = { logSecurityEvent };
