// El segundo paso del login de una cuenta con 2FA: un código de la app de autenticación o un código de recuperación.
const db = require('./db');
const totp = require('./totp');
const { consume } = require('./rateLimit');

// Los UPDATE llevan una condición para que dos pedidos a la vez no puedan usar el mismo código: gana uno y el otro ve changes = 0.
const markStepUsed = db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?');
const setRecovery = db.prepare('UPDATE users SET totp_recovery = ? WHERE id = ? AND totp_recovery = ?');
const sealStored = db.prepare('UPDATE users SET totp_secret = ? WHERE id = ? AND totp_secret = ?');

// Un secreto guardado en claro (de antes del cifrado) se cifra la primera vez que su dueño entra con un código bueno. Si no se puede (falta la clave), sigue valiendo en claro.
async function sealIfPlain(user, secret) {
  if (totp.isSealed(user.totp_secret)) return;
  try { await sealStored.run(totp.sealSecret(secret), user.id, user.totp_secret); }
  catch (e) { console.error('No se pudo cifrar el secreto del segundo paso:', e.message); }
}

// 10 intentos cada 15 minutos por cuenta (además del tope por IP del login): quien ya sabe la contraseña igual no puede probar los
// 1.000.000 de códigos posibles. Solo se llega aquí con la contraseña correcta, así que este tope no sirve para dejar afuera a otra persona.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// Devuelve { ok: true } o { ok: false, error: 'bad_code' | 'too_many_requests', retryAfter? }.
async function checkSecondFactor(user, rawCode) {
  const limit = await consume('2fa', 'u:' + user.id, WINDOW_MS, MAX_ATTEMPTS);
  if (limit.limited) return { ok: false, error: 'too_many_requests', retryAfter: limit.retryAfter };

  const code = String(rawCode).trim();
  const digits = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(digits)) {
    const secret = totp.openSecret(user.totp_secret);
    const step = totp.verifyCode(secret, digits, Number(user.totp_last_step));
    if (step !== null && (await markStepUsed.run(step, user.id, step)).changes === 1) { await sealIfPlain(user, secret); return { ok: true }; }
    return { ok: false, error: 'bad_code' };
  }

  const hash = totp.hashRecoveryCode(code);
  const hashes = JSON.parse(user.totp_recovery || '[]');
  if (hashes.includes(hash)) {
    const left = JSON.stringify(hashes.filter(h => h !== hash));
    if ((await setRecovery.run(left, user.id, user.totp_recovery)).changes === 1) return { ok: true };
  }
  return { ok: false, error: 'bad_code' };
}

module.exports = { checkSecondFactor, MAX_ATTEMPTS, WINDOW_MS };
