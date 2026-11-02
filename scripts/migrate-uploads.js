// Sube a Vercel Blob las imágenes que todavía están en public/uploads/ y reescribe en la base las URLs que las usan
// (cover_url, card_cover_url, photo_url, banner_url, avatar_url: de "/uploads/xxx.jpg" a la URL de Blob).
// Es seguro repetirlo: solo toca las URLs que siguen empezando con /uploads/.
// Uso: npm run db:migrate-uploads            (necesita DATABASE_URL y BLOB_READ_WRITE_TOKEN en .env.local)
//      npm run db:migrate-uploads -- --dry-run   (solo muestra qué haría)
const fs = require('node:fs');
const path = require('node:path');
const { put } = require('@vercel/blob');
const db = require('../server/db');
const { uploadsDir } = require('../server/upload');

const COLUMNS = [['games', 'cover_url'], ['games', 'card_cover_url'], ['characters', 'banner_url'], ['characters', 'photo_url'], ['users', 'avatar_url']];
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Falta BLOB_READ_WRITE_TOKEN (el token de tu Blob store de Vercel) en .env.local.');

  // 1) Qué archivos locales usa la base.
  const used = new Map(); // "/uploads/x.jpg" -> [[tabla, columna, filas]]
  for (const [table, col] of COLUMNS) {
    const rows = await db.prepare(`SELECT ${col} AS url, COUNT(*) AS n FROM ${table} WHERE ${col} LIKE '/uploads/%' GROUP BY ${col}`).all();
    for (const r of rows) used.set(r.url, [...(used.get(r.url) || []), [table, col, r.n]]);
  }
  if (!used.size) { console.log('No hay URLs /uploads/ en la base: nada que migrar.'); return; }

  // 2) Subir cada una y reescribir las filas.
  let uploaded = 0, missing = 0;
  for (const [url, refs] of used) {
    const file = path.join(uploadsDir, path.basename(url));
    const where = refs.map(([t, c, n]) => `${t}.${c} (${n})`).join(', ');
    if (!fs.existsSync(file)) { console.log(`FALTA el archivo ${url}  ← lo usa ${where}`); missing++; continue; }
    if (dryRun) { console.log(`subiría ${url}  → ${where}`); continue; }
    const ext = path.extname(file).toLowerCase();
    const blob = await put('uploads/' + path.basename(file), fs.readFileSync(file), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: CONTENT_TYPES[ext],
    });
    for (const [table, col] of refs.map(([t, c]) => [t, c])) {
      await db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(blob.url, url);
    }
    console.log(`OK  ${url}  →  ${blob.url}`);
    uploaded++;
  }
  console.log(dryRun ? '\n(dry-run: no se cambió nada)' : `\n${uploaded} imágenes migradas, ${missing} archivos faltantes.`);
  if (missing) process.exitCode = 1;
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
