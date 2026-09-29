const crypto = require('crypto');

const COOKIE = 'hovai_session';
const TTL = 60 * 60 * 24 * 7; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function secret() {
  return process.env.SESSION_SECRET || '';
}

function signature(ts) {
  return b64url(crypto.createHmac('sha256', secret()).update(String(ts)).digest());
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf('=');
        return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
      })
  );
}

function isConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && secret().length >= 24);
}

function passwordMatches(input) {
  const expected = Buffer.from(String(process.env.ADMIN_PASSWORD || ''));
  const got = Buffer.from(String(input || ''));
  if (expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
}

function createSessionCookie(secure) {
  const ts = Math.floor(Date.now() / 1000);
  const value = `${ts}.${signature(ts)}`;
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function isAuthed(cookieHeader) {
  if (!isConfigured()) return false;
  const value = parseCookies(cookieHeader)[COOKIE];
  if (!value) return false;
  const [tsRaw, sig] = value.split('.');
  const ts = Number(tsRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || !sig || now - ts > TTL || ts > now + 60) return false;
  const expected = Buffer.from(signature(ts));
  const b = Buffer.from(sig);
  return expected.length === b.length && crypto.timingSafeEqual(expected, b);
}

module.exports = { isConfigured, passwordMatches, createSessionCookie, clearSessionCookie, isAuthed };