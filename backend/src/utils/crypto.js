const crypto = require('crypto');
const { encryptionKey } = require('../config/env');

const ALGORITHM = 'aes-256-gcm';

/** The only field in this schema that needs reversible encryption rather
 *  than a one-way hash: a TOTP secret has to be decrypted back to raw bytes
 *  to generate the code it should be compared against (see utils/totp.js).
 *  Format: iv:authTag:ciphertext, all hex. */
function getKey() {
  if (!encryptionKey || encryptionKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — see backend/.env.example');
  }
  return Buffer.from(encryptionKey, 'hex');
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
