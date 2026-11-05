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

module.exports = { newSecret, codeForStep, verifyCode, otpauthUri, newRecoveryCodes, hashRecoveryCode, base32Encode, base32Decode, STEP_MS };
