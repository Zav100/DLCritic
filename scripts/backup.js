// Copia de seguridad: vuelca todas las tablas de la base a un archivo backups/dlcritic-<fecha>.json.gz.
// Lee la base en una sola transacción de solo lectura, así que el archivo es una foto coherente aunque haya gente usando el sitio.
// No incluye sessions ni rate_limits (efímeras: tras restaurar, la gente solo vuelve a iniciar sesión).
// También espeja en backups/images/ las imágenes que viven en Vercel Blob (ver mirrorImages).
// Contiene correos y hashes de PIN: backups/ está fuera de git y de Vercel, no lo compartas.
// Uso: npm run db:backup   (usa DATABASE_URL de .env.backup: la rama production de Neon)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const db = require('../server/db');

const DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const SKIP = new Set(['sessions', 'rate_limits']);
const KEEP = 30; // al ritmo de una por día, un mes de historia

const read = file => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));

async function dump() {
  return db.transaction(async tx => {
    await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const names = (await tx.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1").all())
      .map(r => r.name).filter(n => !SKIP.has(n));
    const fks = await tx.prepare("SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace").all();

    // Orden que respeta las claves foráneas (primero lo que otros referencian): el restore inserta en este orden.
    const order = [];
    const seen = new Set();
    const visit = t => {
      if (seen.has(t)) return;
      seen.add(t);
      for (const fk of fks) if (fk.child === t) visit(fk.parent);
      if (names.includes(t)) order.push(t);
    };
    names.forEach(visit);

    const tables = {};
    for (const t of order) tables[t] = await tx.prepare(`SELECT * FROM "${t}"`).all();
    return { version: 1, createdAt: new Date().toISOString(), order, tables };
  });
}

// Espejo de imágenes: baja a backups/images/ los archivos de Vercel Blob que la base referencia y que todavía no están.
// Son públicos (no hace falta el token) y su nombre es aleatorio y nunca cambia, así que lo ya bajado no se vuelve a bajar.
// Nunca borra: una imagen quitada de la base queda en el espejo. Las portadas de Steam son enlaces ajenos y no se copian.
// ponytail: descarga de a una; si algún día son miles de imágenes, de a varias.
const BLOB_URL = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>\\]+/g;

async function mirrorImages(tables) {
  const urls = [...new Set(JSON.stringify(tables).match(BLOB_URL) || [])];
  const imgDir = path.join(DIR, 'images');
  let fresh = 0, bytes = 0, failed = 0;
  for (const u of urls) {
    const dest = path.join(imgDir, decodeURIComponent(new URL(u).pathname));
    if (fs.existsSync(dest)) continue;
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length !== Number(res.headers.get('content-length') ?? buf.length)) throw new Error('descarga incompleta');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', buf); // sin .part, una descarga cortada pasaría por buena la próxima vez
      fs.renameSync(dest + '.part', dest);
      fresh++; bytes += buf.length;
    } catch (e) {
      failed++;
      console.error(`MAL imagen ${u}: ${e.message}`);
    }
  }
  console.log(`Imágenes de Blob: ${urls.length} en la base, ${urls.length - fresh - failed} ya copiadas, ${fresh} nuevas (${(bytes / 1024).toFixed(0)} KB)${failed ? `, ${failed} con error` : ''}`);
  if (failed) process.exitCode = 1;
}

async function main() {
  const backup = await dump();
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `dlcritic-${backup.createdAt.slice(0, 16).replace(':', '-')}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(backup)));

  // Verificación: se vuelve a leer lo escrito y se comparan las filas de cada tabla.
  const back = read(file);
  let ok = back.order.length === backup.order.length;
  for (const t of backup.order) {
    const same = back.tables[t]?.length === backup.tables[t].length;
    if (!same) ok = false;
    console.log(`${same ? 'OK ' : 'MAL'} ${t.padEnd(18)} ${String(backup.tables[t].length).padStart(5)} filas`);
  }
  if (!ok) { fs.unlinkSync(file); throw new Error('El archivo escrito no coincide con la base. Se descartó.'); }

  const old = fs.readdirSync(DIR).filter(f => /^dlcritic-.*\.json\.gz$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) fs.unlinkSync(path.join(DIR, f));
  console.log(`Copia lista: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)${old.length ? `, se borraron ${old.length} antiguas` : ''}`);
  await mirrorImages(backup.tables);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
