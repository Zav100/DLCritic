// Restaura una copia de backups/ (ver scripts/backup.js) en la base apuntada por DATABASE_URL (o PGLITE_DIR).
// Solo corre contra una base vacía: no mezcla ni pisa datos. Para recuperar producción, crear primero una rama o base
// nueva y vacía, restaurar ahí y recién después apuntar la app a ella.
// Uso: npm run db:restore -- backups/dlcritic-2026-11-03T21-00.json.gz
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const db = require('../server/db');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: npm run db:restore -- <ruta al .json.gz>');
  const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(file))));
  if (backup.version !== 1) throw new Error(`Versión de copia desconocida: ${backup.version}`);

  await db.migrate();
  for (const t of backup.order) {
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
    if (n > 0) throw new Error(`La base destino no está vacía (${t} tiene ${n} filas). No se restauró nada.`);
  }

  await db.transaction(async tx => {
    for (const t of backup.order) {
      const rows = backup.tables[t];
      if (!rows.length) continue;
      const pgCols = new Set((await tx.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?").all(t)).map(r => r.column_name));
      const cols = Object.keys(rows[0]).filter(c => pgCols.has(c));
      const dropped = Object.keys(rows[0]).filter(c => !pgCols.has(c));
      if (dropped.length) console.log(`  ${t}: columnas que ya no existen y se descartan: ${dropped.join(', ')}`);
      const insert = tx.prepare(`INSERT INTO "${t}" (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const row of rows) await insert.run(...cols.map(c => row[c]));
    }
    // Las columnas de identidad (users.id) siguen su propio contador: hay que moverlo tras insertar ids explícitos.
    const ids = await tx.prepare("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'").all();
    for (const { t, c } of ids) await tx.exec(`SELECT setval(pg_get_serial_sequence('"${t}"', '${c}'), COALESCE((SELECT MAX("${c}") FROM "${t}"), 1))`);
  });

  let ok = true;
  for (const t of backup.order) {
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
    const same = n === backup.tables[t].length;
    if (!same) ok = false;
    console.log(`${same ? 'OK ' : 'MAL'} ${t.padEnd(18)} copia ${String(backup.tables[t].length).padStart(5)}  →  base ${String(n).padStart(5)}`);
  }
  if (!ok) throw new Error('Los conteos no coinciden.');
  console.log(`Restauración completa (copia del ${backup.createdAt}).`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
