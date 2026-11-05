const crypto = require('node:crypto');
const db = require('./db');

// Sesión corta (no se marcó "Recordar este dispositivo"): la cookie dura hasta que se cierre el navegador y, por si el navegador
// nunca se cierra, la sesión vence a las 24 horas en el servidor.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Con "Recordar este dispositivo": 20 días desde que se inicia sesión (no se renuevan), con cookie persistente. Si se cambia, cambiar también
// los "20 días" de los textos: auth_remember_label en 02-i18n.js, el login del panel (admin.html) y la política de privacidad.
const REMEMBER_TTL_MS = 20 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'cartridge_session';

// Una contraseña falsa para gastar el mismo tiempo cuando el usuario no existe (si no, la respuesta rápida delata qué cuentas existen).
let dummyHash;
function spendLoginTime(password) {
  dummyHash ??= hashPin('contrasena-que-no-existe');
  verifyPin(password, dummyHash);
}

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

// En la base se guarda el hash (SHA-256) del token, no el token: si alguien se llevara una copia de la base, no podría usar las sesiones.
// El token en sí solo vive en la cookie del navegador.
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const insertSession = db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
// Sesión y usuario en una sola consulta: cada request autenticado hace un viaje a la base, no dos.
const findSessionUser = db.prepare('SELECT u.*, s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const deleteOtherSessions = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?');
const deleteAllSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

async function createSession(userId, remember = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + (remember ? REMEMBER_TTL_MS : SESSION_TTL_MS));
  await insertSession.run(sha256(token), userId, now.toISOString(), expires.toISOString());
  return { token, expires, remember };
}

// Cierra la sesión de ese token (el de la cookie).
const endSession = token => deleteSession.run(sha256(token));
// Cierra todas las sesiones de la persona menos la actual (al cambiar la contraseña) o todas, también la actual.
const endOtherSessions = (userId, token) => deleteOtherSessions.run(userId, sha256(token));
const endAllSessions = userId => deleteAllSessions.run(userId);

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

const sessionToken = req => parseCookies(req.headers.cookie)[SESSION_COOKIE];

// session: lo que devuelve createSession. Sin Expires la cookie es "de sesión": el navegador la borra al cerrarse.
function setSessionCookie(res, { token, expires, remember }) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (remember) attrs.push(`Expires=${expires.toUTCString()}`);
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

// Limpieza de sesiones vencidas: es solo higiene (una sesión vencida igual se rechaza al usarla), así que se hace
// a lo sumo una vez cada 10 minutos por instancia y no en cada request.
let lastPurge = 0;
async function purgeExpiredSessions() {
  if (Date.now() - lastPurge < 10 * 60 * 1000) return;
  lastPurge = Date.now();
  await deleteExpired.run(new Date().toISOString());
}

async function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null; // visitante sin sesión: ni siquiera se consulta la base
  await purgeExpiredSessions();
  const row = await findSessionUser.get(sha256(token));
  if (!row) return null;
  const { session_expires_at, ...user } = row;
  if (new Date(session_expires_at) < new Date()) {
    await endSession(token);
    return null;
  }
  return user;
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}

module.exports = {
  hashPin, verifyPin, spendLoginTime, createSession, currentUser, requireAuth,
  setSessionCookie, clearSessionCookie, sessionToken, endSession, endOtherSessions, endAllSessions, parseCookies, SESSION_COOKIE,
};
