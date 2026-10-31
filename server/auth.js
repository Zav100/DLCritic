const crypto = require('node:crypto');
const db = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = 'cartridge_session';

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const insertSession = db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
const findSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  insertSession.run(token, userId, now.toISOString(), expires.toISOString());
  return { token, expires };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function setSessionCookie(res, token, expires) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function currentUser(req) {
  deleteExpired.run(new Date().toISOString());
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = findSession.get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    deleteSession.run(token);
    return null;
  }
  return findUserById.get(session.user_id) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}

module.exports = {
  hashPin, verifyPin, createSession, currentUser, requireAuth,
  setSessionCookie, clearSessionCookie, deleteSession, parseCookies, SESSION_COOKIE,
};
