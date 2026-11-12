// Subida de imágenes (portadas, fotos de personajes, avatares).
//
// Dónde quedan guardadas:
//   - Con BLOB_READ_WRITE_TOKEN: en Vercel Blob. En Vercel el disco de las funciones no se puede escribir ni persiste.
//   - Sin token (desarrollo local): en public/uploads/, que Express sirve como archivos estáticos.
// En los dos casos la URL que devuelve saveImage() es la que se guarda en la base y se usa en un <img>.
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { put, del } = require('@vercel/blob');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const ALLOWED_EXT = new Set(Object.keys(CONTENT_TYPES));
// Vercel rechaza los requests de más de 4,5 MB antes de llegar a la función: el tope tiene que quedar por debajo.
// Si se cambia, cambiar también los textos "GIF: máximo 4MB" (admin.html, index.html y avatar_file_hint en 02-i18n.js).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const imageField = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())),
}).single('image');

// Lee el campo "image" de un multipart/form-data. Devuelve { buffer, ext }, o null si no llegó un archivo
// válido (formato no permitido). Lanza si multer falla (por ejemplo, archivo demasiado grande).
function receiveImage(req, res) {
  return new Promise((resolve, reject) => {
    imageField(req, res, err => {
      if (err) return reject(err);
      resolve(req.file ? { buffer: req.file.buffer, ext: path.extname(req.file.originalname).toLowerCase() } : null);
    });
  });
}

// Guarda la imagen con un nombre aleatorio (nunca el que mandó el usuario) y devuelve la URL para mostrarla.
async function saveImage({ buffer, ext }) {
  const name = crypto.randomBytes(16).toString('hex') + ext;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put('uploads/' + name, buffer, { access: 'public', addRandomSuffix: false, contentType: CONTENT_TYPES[ext] });
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
    if (/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
      if (process.env.BLOB_READ_WRITE_TOKEN) await del(url);
    } else if (url.startsWith('/uploads/')) {
      fs.rmSync(path.join(uploadsDir, path.basename(url)), { force: true });
    }
  } catch (e) {
    console.error('No se pudo borrar la imagen', url, e.message);
  }
}

module.exports = { receiveImage, saveImage, deleteImage, uploadsDir, ALLOWED_EXT, MAX_IMAGE_BYTES };
