// Subida de imágenes (portadas, fotos de personajes, avatares).
//
// Dónde quedan guardadas:
//   - Con BLOB_READ_WRITE_TOKEN: en Vercel Blob. En Vercel el disco de las funciones no se puede escribir ni persiste.
//   - Sin token (desarrollo local): en public/uploads/, que Express sirve como archivos estáticos.
// En los dos casos la URL que devuelve saveImage() es la que se guarda en la base y se usa en un <img>.
//
// Qué se hace con cada archivo (receiveImage): se reconoce el formato por los PRIMEROS BYTES (no por el nombre ni por el tipo que declara quien lo sube),
// se rechaza lo que no sea JPEG, PNG, WebP o GIF, y se le quitan los metadatos (ubicación GPS, cámara, fecha, comentarios) sin tocar los píxeles.
// Las imágenes animadas (GIF, PNG animado y WebP animado) solo se aceptan si quien llama lo permite (animated: true): las fotos de perfil de los suscriptores.
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { put, del } = require('@vercel/blob');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const ALLOWED_EXT = new Set(Object.keys(CONTENT_TYPES));
// Vercel rechaza los requests de más de 4,5 MB antes de llegar a la función: el tope tiene que quedar por debajo.
// Si se cambia, cambiar también los textos "máximo 4MB" (admin.html, index.html y avatar_file_hint en 02-i18n.js).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Imágenes animadas (las fotos de perfil de los suscriptores): tope propio y mucho menor. Se muestran a 40-88 px en muchos sitios de cada página (header, cada reseña, listas, buscador),
// y a diferencia de las fijas (el navegador las achica antes de subir) un GIF no se achica. Si se cambian, cambiar también los textos «1,5 MB», «400×400» y «200 cuadros»
// (avatar_file_hint_sub y err_avatar_gif_* en 02-i18n.js, GIF_MAX_BYTES en 12-settings.js y admin-ui/assets/js/08-moderation.js).
const ANIMATED_MAX_BYTES = 1.5 * 1024 * 1024;
const ANIMATED_MAX_SIDE = 400;
const ANIMATED_MAX_FRAMES = 200;
const BLOB_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

const imageField = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())),
}).single('image');

/* ---------- reconocer el formato y limpiar metadatos ---------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Un JPEG sin sus metadatos (EXIF, XMP, IPTC y comentarios). Lo único que se conserva del EXIF es la orientación de la foto (si no, una foto
// tomada de costado se vería girada): se reescribe un EXIF mínimo con solo ese dato.
function cleanJpeg(buf) {
  const out = [buf.subarray(0, 2)]; // FF D8
  let orientation = 1, pos = 2;
  while (pos + 4 <= buf.length && buf[pos] === 0xff) {
    const marker = buf[pos + 1];
    if (marker === 0xda) break; // SOS: de aquí en adelante son los datos de la imagen
    if (marker === 0xff) { pos++; continue; } // relleno
    const len = buf.readUInt16BE(pos + 2), end = pos + 2 + len;
    if (len < 2 || end > buf.length) return null; // archivo cortado o mal formado
    if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') orientation = exifOrientation(buf.subarray(pos + 10, end));
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(buf.subarray(pos, end)); // se descartan APP1 (EXIF/XMP), APP13 (IPTC) y comentarios
    pos = end;
  }
  if (orientation > 1) out.splice(1, 0, minimalExif(orientation));
  out.push(buf.subarray(pos));
  return Buffer.concat(out);
}
// La orientación (1 a 8) que dice el EXIF; 1 (normal) si no la trae o está mal formado.
function exifOrientation(tiff) {
  try {
    const le = tiff.toString('latin1', 0, 2) === 'II';
    const u16 = o => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o)), u32 = o => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    const ifd = u32(4), count = u16(ifd);
    for (let i = 0; i < count; i++) if (u16(ifd + 2 + i * 12) === 0x0112) { const v = u16(ifd + 2 + i * 12 + 8); return v >= 1 && v <= 8 ? v : 1; }
  } catch { /* sin EXIF legible */ }
  return 1;
}
function minimalExif(orientation) {
  return Buffer.from([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1 "Exif"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // cabecera TIFF (big-endian), la primera tabla empieza en el byte 8
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // 1 dato: orientación
    0x00, 0x00, 0x00, 0x00]);
}

// Un PNG sin sus trozos de texto y EXIF (tEXt, zTXt, iTXt, eXIf). animated: tiene trozo acTL (PNG animado). Devuelve null si está cortado.
function cleanPng(buf) {
  const out = [PNG_SIGNATURE];
  let pos = 8, animated = false, ended = false, frames = 0;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8), end = pos + 12 + len;
    if (end > buf.length) return null;
    if (type === 'acTL') { animated = true; frames = len >= 4 ? buf.readUInt32BE(pos + 8) : 0; }
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) out.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') { ended = true; break; }
  }
  return ended ? { buffer: Buffer.concat(out), animated, frames, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null; // lo que venga después de IEND se descarta
}

// Un WebP sin sus trozos EXIF y XMP. animated: es una animación. Devuelve null si está cortado.
function cleanWebp(buf) {
  if (buf.readUInt32LE(4) + 8 > buf.length) return null;
  const out = [];
  let pos = 12, animated = false, frames = 0, width = 0, height = 0;
  const stop = buf.readUInt32LE(4) + 8;
  while (pos + 8 <= stop) {
    const type = buf.toString('latin1', pos, pos + 4), size = buf.readUInt32LE(pos + 4), end = pos + 8 + size + (size & 1);
    if (end > stop + 1) return null;
    if (type === 'ANIM' || type === 'ANMF') animated = true;
    if (type === 'ANMF') frames++;
    if (type === 'VP8X') {
      animated ||= (buf[pos + 8] & 0x02) !== 0;
      if (size >= 10 && pos + 18 <= buf.length) { width = 1 + buf.readUIntLE(pos + 12, 3); height = 1 + buf.readUIntLE(pos + 15, 3); } // el lienzo del WebP animado
      const chunk = Buffer.from(buf.subarray(pos, end));
      chunk[8] &= ~0x0c; // se apagan las banderas "trae EXIF" y "trae XMP"
      out.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') out.push(buf.subarray(pos, Math.min(end, buf.length)));
    pos = end;
  }
  const body = Buffer.concat(out);
  const head = Buffer.from('RIFF\0\0\0\0WEBP', 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  return { buffer: Buffer.concat([head, body]), animated, frames, width, height };
}

// Medidas y cuadros de un GIF: el tamaño del lienzo está en la cabecera; los cuadros se cuentan recorriendo los bloques (sin decodificar nada). Lo cortado o mal formado se cuenta hasta donde se pueda.
function gifShape(buf) {
  const width = buf.readUInt16LE(6), height = buf.readUInt16LE(8);
  let pos = 13, frames = 0;
  if (buf[10] & 0x80) pos += 3 << ((buf[10] & 7) + 1); // paleta de colores global
  const skipBlocks = () => { while (pos < buf.length && buf[pos] !== 0) pos += buf[pos] + 1; pos++; }; // sub-bloques hasta el 0 que los cierra
  while (pos < buf.length && buf[pos] !== 0x3b) {
    if (buf[pos] === 0x2c) { // un cuadro
      frames++;
      const flags = buf[pos + 9];
      pos += 10;
      if (flags & 0x80) pos += 3 << ((flags & 7) + 1); // paleta local
      pos++; // tamaño mínimo del código LZW
      skipBlocks();
    } else if (buf[pos] === 0x21) { pos += 2; skipBlocks(); } // extensión (control del cuadro, comentario, aplicación)
    else break;
  }
  return { width, height, frames };
}

// null si la imagen animada cumple los límites; si no, el código del problema.
function animatedProblem(img, bytes = img.buffer.length) {
  if (bytes > ANIMATED_MAX_BYTES) return 'animated_too_heavy';
  if (img.width > ANIMATED_MAX_SIDE || img.height > ANIMATED_MAX_SIDE) return 'animated_too_big';
  if (img.frames > ANIMATED_MAX_FRAMES) return 'animated_too_many_frames';
  return null;
}

// Mira los primeros bytes y devuelve { ext, buffer (ya sin metadatos), animated } o null si no es una imagen válida de un formato permitido.
function inspectImage(buf) {
  try {
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) { const b = cleanJpeg(buf); return b && { ext: '.jpg', buffer: b, animated: false }; }
    if (buf.length > 20 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) { const r = cleanPng(buf); return r && { ext: '.png', ...r }; }
    if (buf.length > 20 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') { const r = cleanWebp(buf); return r && { ext: '.webp', ...r }; }
    if (buf.length > 10 && /^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return { ext: '.gif', buffer: buf, animated: true, ...gifShape(buf) }; // un GIF cuenta siempre como animado: es el formato de los suscriptores
  } catch { /* mal formado */ }
  return null;
}

// Lee el campo "image" de un multipart/form-data. Devuelve { buffer, ext, animated }, o null si no llegó un archivo válido (no es una imagen de verdad o el formato no está
// permitido). Lanza si multer falla (por ejemplo, archivo demasiado grande), con error.code === 'animated_not_allowed' si es animada y animated no es true, y, con limitAnimated, con
// 'animated_too_heavy' / 'animated_too_big' / 'animated_too_many_frames' si pasa los límites de arriba (las fotos de perfil; lo que sube un admin no se limita).
function receiveImage(req, res, { animated = true, limitAnimated = false } = {}) {
  return new Promise((resolve, reject) => {
    imageField(req, res, err => {
      if (err) return reject(err);
      if (!req.file) return resolve(null);
      const img = inspectImage(req.file.buffer);
      if (!img) return resolve(null);
      if (img.animated && !animated) return reject(Object.assign(new Error('Las imágenes animadas son solo para suscriptores'), { code: 'animated_not_allowed' }));
      const problem = img.animated && limitAnimated ? animatedProblem(img) : null;
      if (problem) return reject(Object.assign(new Error('La imagen animada pasa los límites'), { code: problem }));
      resolve({ buffer: img.buffer, ext: img.ext, animated: img.animated });
    });
  });
}

// Guarda la imagen con un nombre aleatorio (nunca el que mandó el usuario) y devuelve la URL para mostrarla.
async function saveImage({ buffer, ext }) {
  const name = crypto.randomBytes(16).toString('hex') + ext;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // El nombre es aleatorio y el contenido no cambia nunca: el navegador puede guardarlo un año (por defecto Vercel Blob lo deja un mes).
    const blob = await put('uploads/' + name, buffer, { access: 'public', addRandomSuffix: false, contentType: CONTENT_TYPES[ext], cacheControlMaxAge: 365 * 24 * 60 * 60 });
    return blob.url;
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  return '/uploads/' + name;
}

// Borra una imagen que subimos nosotros (por ejemplo, la foto de una cuenta que se elimina). Solo toca lo que saveImage() pudo haber devuelto: una URL de Vercel Blob
// o /uploads/<nombre>; cualquier otra URL se ignora. Es "al mejor esfuerzo": si falla, queda un archivo huérfano pero no se rompe lo que se estaba haciendo.
async function deleteImage(url) {
  if (!url) return;
  try {
    if (BLOB_URL.test(url)) {
      if (process.env.BLOB_READ_WRITE_TOKEN) await del(url);
    } else if (url.startsWith('/uploads/')) {
      fs.rmSync(path.join(uploadsDir, path.basename(url)), { force: true });
    }
  } catch (e) {
    console.error('No se pudo borrar la imagen', url, e.message);
  }
}

// Peso y medidas de una imagen que subimos nosotros (para que el panel de moderación muestre si un GIF pendiente es pesado). null si no se puede leer.
async function describeImage(url) {
  try {
    let buf;
    if (typeof url === 'string' && url.startsWith('/uploads/')) buf = fs.readFileSync(path.join(uploadsDir, path.basename(url)));
    else if (BLOB_URL.test(url || '')) { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (!r.ok) return null; buf = Buffer.from(await r.arrayBuffer()); }
    else return null;
    const img = inspectImage(buf);
    return { bytes: buf.length, width: (img && img.width) || null, height: (img && img.height) || null, frames: img && img.frames != null ? img.frames : null, problem: img && img.animated ? animatedProblem(img, buf.length) : null };
  } catch { return null; }
}

module.exports = { receiveImage, saveImage, deleteImage, describeImage, inspectImage, animatedProblem, uploadsDir, ALLOWED_EXT, MAX_IMAGE_BYTES, ANIMATED_MAX_BYTES, ANIMATED_MAX_SIDE, ANIMATED_MAX_FRAMES };
