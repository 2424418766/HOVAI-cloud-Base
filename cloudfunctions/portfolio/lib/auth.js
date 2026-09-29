'use strict';
// Mirrors the original worker auth: HMAC-SHA256 signed, timestamped bearer token.
// The HMAC key is ADMIN_PASSWORD, and the token is `<expiryMs>.<base64url-mac>`.
const { createHmac, createHash, timingSafeEqual } = require('crypto');

const TOKEN_TTL = 86400000; // 24h, same as the original worker.

const secret = (env) => env.ADMIN_PASSWORD || '';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const sign = (env, payload) => b64url(createHmac('sha256', secret(env)).update(payload).digest());

const issueToken = (env) => {
  const payload = String(Date.now() + TOKEN_TTL);
  return payload + '.' + sign(env, payload);
};

const verifyToken = (env, token) => {
  if (!secret(env) || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(payload) || Number(payload) < Date.now()) return false;
  const expected = sign(env, payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const digestHex = (value) => createHash('sha256').update(value).digest();

const passwordMatches = (env, password) => {
  const given = digestHex(String(password));
  const want = digestHex(String(secret(env)));
  return timingSafeEqual(given, want);
};

const bearer = (req) => {
  const header = req.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

const isOwner = (req, env) => {
  if (!secret(env)) return false;
  return verifyToken(env, bearer(req));
};

module.exports = { TOKEN_TTL, secret, issueToken, verifyToken, passwordMatches, isOwner };