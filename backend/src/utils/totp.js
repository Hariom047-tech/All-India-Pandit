const crypto = require('crypto');

/** Hand-rolled RFC 6238 TOTP (SHA-1/6-digit/30s — the parameters every
 *  authenticator app, Google Authenticator included, assumes by default)
 *  instead of pulling in `speakeasy`: that package has been unmaintained for
 *  years, and the algorithm itself is ~30 lines on top of Node's built-in
 *  `crypto.createHmac`. One dependency less for code this security-sensitive. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) output += BASE32_ALPHABET[parseInt(bits.slice(-remainder).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

function hotp(secretBuffer, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

/** Verifies a submitted 6-digit code, allowing ±`window` 30s steps of clock
 *  drift (the RFC-recommended tolerance) — timing-safe per candidate. */
function verifyTotp(base32Secret, token, { step = 30, window = 1, time = Date.now() } = {}) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;
  const secretBuffer = base32Decode(base32Secret);
  const counter = Math.floor(time / 1000 / step);
  for (let drift = -window; drift <= window; drift++) {
    const candidate = hotp(secretBuffer, counter + drift);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(String(token)))) return true;
  }
  return false;
}

/** otpauth:// URL any authenticator app (Google/Microsoft/Authy/1Password...)
 *  can scan as a QR code or accept as manual entry — no `qrcode` dependency
 *  needed since we're not rendering the image ourselves, just the URL/secret. */
function otpAuthUrl(base32Secret, { label, issuer = 'PanditConnect' }) {
  const path = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${path}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, verifyTotp, otpAuthUrl };
