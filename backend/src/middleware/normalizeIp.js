/** Node/Express often reports an IPv4 connection as an IPv4-mapped IPv6
 *  address ("::ffff:172.20.0.1") — true for requests inside Docker's bridge
 *  network, which is every request this backend sees in local dev. Left
 *  alone, that means a ban stored as "172.20.0.1" (what an admin would
 *  naturally type, and what other tooling reports) never matches req.ip at
 *  check time — Postgres treats the two as different address families for
 *  INET equality. Stripped once, here, early, so checkIpBan, honeypot/audit
 *  logging, and admin session IP-pinning all compare and store the same
 *  canonical form. req.ip is a getter (Express defines it via
 *  Object.defineProperty), so plain assignment would silently no-op —
 *  this replaces it with a plain, writable value instead. */
function normalizeIp(req, res, next) {
  if (req.ip && req.ip.startsWith('::ffff:')) {
    Object.defineProperty(req, 'ip', { value: req.ip.slice(7), configurable: true, enumerable: true });
  }
  next();
}

module.exports = { normalizeIp };
