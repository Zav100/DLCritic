// Códigos de un solo uso por tiempo (TOTP, RFC 6238), los que muestran Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.
// Solo la parte criptográfica: no toca la base (eso está en twofactor.js).
const crypto = require('node:crypto');

const STEP_MS = 30 * 1000; // cada código vale una ventana de 30 segundos
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.toUpperCase().replace(/=+$/, '')) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// Clave secreta nueva: 20 bytes al azar (160 bits, lo que pide el RFC), en base32 para escribirla o pasarla en el QR.
const newSecret = () => base32Encode(crypto.randomBytes(20));

// El código de 6 dígitos de ese paso (el número de ventana de 30 s desde 1970).
function codeForStep(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[19] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// Devuelve el paso al que corresponde el código, o null si no vale. Acepta la ventana actual y la anterior y la siguiente (relojes
// un poco corridos) y rechaza cualquier paso que no sea posterior a lastStep: un código ya usado no sirve de nuevo.
function verifyCode(secret, code, lastStep = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / STEP_MS);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && crypto.timingSafeEqual(Buffer.from(codeForStep(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

// La dirección que lee la app de autenticación (la que va dentro del QR).
function otpauthUri(secret, account, issuer = 'DLCritic') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Códigos de recuperación (por si se pierde el teléfono): 10 caracteres al azar (50 bits) con forma XXXXX-XXXXX. Cada uno sirve una sola vez.
const RECOVERY_COUNT = 8;
function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
// En la base se guarda el hash (SHA-256, alcanza porque el código ya es aleatorio y largo). Mayúsculas y guiones no importan al escribirlo.
const hashRecoveryCode = code => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// El secreto se guarda cifrado en la base (AES-256-GCM): una copia de la base o de un respaldo no alcanza para generar códigos. La clave son 32 bytes en
// hexadecimal (64 caracteres) en la variable TOTP_ENCRYPTION_KEY, que NO está en la base ni en los respaldos (en Vercel: Settings > Environment Variables).
// Un secreto guardado antes de esto (sin el prefijo enc1:) sigue valiendo y se cifra solo la próxima vez que su dueño entra con un código (twofactor.js).
// Fuera de producción, sin la variable, se usa una clave fija de desarrollo; en producción sin ella no se puede cifrar uno nuevo (falla, nunca guarda en claro).
const SEALED = 'enc1:';
function encryptionKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('TOTP_ENCRYPTION_KEY tiene que tener 64 caracteres hexadecimales (32 bytes)');
    return Buffer.from(hex, 'hex');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Falta la variable TOTP_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update('dlcritic: clave solo para desarrollo').digest();
}
const isSealed = stored => typeof stored === 'string' && stored.startsWith(SEALED);
function sealSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return SEALED + [iv, cipher.getAuthTag(), body].map(b => b.toString('base64')).join('.');
}
// Devuelve el secreto en claro (si lo guardado no está cifrado, tal cual).
function openSecret(stored) {
  if (!isSealed(stored)) return stored;
  const [iv, tag, body] = stored.slice(SEALED.length).split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

module.exports = { newSecret, codeForStep, verifyCode, otpauthUri, newRecoveryCodes, hashRecoveryCode, base32Encode, base32Decode, sealSecret, openSecret, isSealed, STEP_MS };
