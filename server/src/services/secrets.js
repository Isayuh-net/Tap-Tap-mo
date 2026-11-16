// Encrypts secrets saved in the database, like an SMS API key typed on Lunch and SMS settings, so a
// copy of the database or a backup on the external drive doesn't reveal them (AES-256-GCM).
// The encryption key is SECRETS_KEY in server/.env, which is never in the database or the backups.
// Keep a copy of server/.env somewhere safe: without SECRETS_KEY, saved keys can't be read back.
const crypto = require('node:crypto');
const config = require('../config');

const PREFIX = 'enc:v1:';

function encryptionKey() {
  return /^[0-9a-f]{64}$/i.test(config.secretsKey) ? Buffer.from(config.secretsKey, 'hex') : null;
}

const canEncrypt = () => encryptionKey() !== null;

// "abc" -> "enc:v1:<iv>:<tag>:<data>"
function encrypt(text) {
  const key = encryptionKey();
  if (!key) throw new Error('SECRETS_KEY is not set in server/.env');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

// The secret, or '' when it can't be read (no SECRETS_KEY, or it changed).
function decrypt(stored) {
  if (!stored) return '';
  if (!String(stored).startsWith(PREFIX)) return String(stored); // saved before encryption existed
  const key = encryptionKey();
  if (!key) return '';
  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

const isEncrypted = (stored) => String(stored ?? '').startsWith(PREFIX);

module.exports = { encrypt, decrypt, canEncrypt, isEncrypted };
