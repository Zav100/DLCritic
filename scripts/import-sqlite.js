// Copia todos los datos de la base SQLite anterior (data.db) a la base Postgres actual, conservando los ids, las
// contraseñas (hashes) y todo lo demás. Solo corre contra una base vacía: no mezcla ni pisa datos.
// Uso: npm run db:import -- data.db
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = require('../server/db');

// Orden que respeta las claves foráneas (primero lo que otros referencian).
const TABLE_ORDER = [
  'users', 'follows', 'game_lists', 'game_list_items', 'notifications', 'sessions', 'games', 'date_events',
  'news_items', 'reviews', 'helpful_votes', 'daily_progress', 'game_covers', 'characters', 'character_reviews',
  'game_suggestions',
];

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: npm run db:import -- <ruta a data.db>');
  const sqlite = new DatabaseSync(path.resolve(file), { readOnly: true });

  const found = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  const unknown = found.filter(t => !TABLE_ORDER.includes(t));
  if (unknown.length) throw new Error(`La base SQLite tiene tablas que este script no conoce: ${unknown.join(', ')}. No se importó nada.`);

  await db.migrate();
  for (const t of TABLE_ORDER) {
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
    if (n > 0) throw new Error(`La base destino no está vacía (${t} tiene ${n} filas). Importar solo sobre una base recién migrada. No se importó nada.`);
  }

  const counts = {};
  await db.transaction(async tx => {
    for (const table of TABLE_ORDER) {
      if (!found.includes(table)) continue;
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      const pgCols = new Set((await tx.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?").all(table)).map(r => r.column_name));
      const cols = rows.length ? Object.keys(rows[0]).filter(c => pgCols.has(c)) : [];
      const skipped = rows.length ? Object.keys(rows[0]).filter(c => !pgCols.has(c)) : [];
      if (skipped.length) console.log(`  ${table}: columnas que ya no existen y se descartan: ${skipped.join(', ')}`);
      if (rows.length) {
        const insert = tx.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        for (const row of rows) await insert.run(...cols.map(c => row[c]));
      }
      counts[table] = rows.length;
    }
    // users.id es una columna de identidad: tras insertar ids explícitos hay que mover su contador.
    await tx.exec("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))");
  });

  // Verificación: mismas filas en cada tabla.
  let ok = true;
  for (const table of found) {
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    const same = n === counts[table];
    if (!same) ok = false;
    console.log(`${same ? 'OK ' : 'MAL'} ${table.padEnd(18)} SQLite ${String(counts[table]).padStart(4)}  →  Postgres ${String(n).padStart(4)}`);
  }
  if (!ok) throw new Error('Los conteos no coinciden.');
  console.log('Importación completa.');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
