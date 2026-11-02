// Acceso a la base de datos: PostgreSQL (Neon en producción).
//
// Conserva la forma que tenía node:sqlite — db.prepare(sql).get / all / run(...) — pero asíncrona, para que el resto
// del servidor cambie lo mínimo (solo agregar await). Los parámetros se escriben como antes: ? (por posición) o
// @nombre (pasando un objeto). Acá se convierten a $1, $2... que es lo que entiende Postgres.
//
// Conexión:
//   DATABASE_URL  URL de Neon (usar la "pooled", la de host con -pooler).
//   PGLITE_DIR    solo para desarrollo local sin Neon: carpeta donde un Postgres embebido (PGlite) guarda sus datos.
const fs = require('node:fs');
const path = require('node:path');

const OID_NUMERIC = 1700;
const parseNumeric = v => (v === null ? null : parseFloat(v)); // AVG() llega como texto; la app espera número

let client = null;

function createClient() {
  if (process.env.PGLITE_DIR) {
    // El nombre en una variable evita que Vercel empaquete PGlite (es solo de desarrollo y pesa varios MB).
    const mod = '@electric-sql/pglite';
    const { PGlite } = require(mod);
    return new PGlite(path.resolve(process.env.PGLITE_DIR), { parsers: { [OID_NUMERIC]: parseNumeric } });
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL (la URL de conexión de Neon). Para probar en local sin Neon: PGLITE_DIR=.pgdata');
  }
  const { Pool, types } = require('pg');
  types.setTypeParser(20, Number); // int8: COUNT(*) llega como texto por defecto
  types.setTypeParser(OID_NUMERIC, parseNumeric);
  // max bajo: en Vercel cada instancia abre su propio pool y Neon limita las conexiones.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000 });
  // Neon cierra las conexiones inactivas (y suspende el servidor tras unos minutos sin uso). Sin este manejador, ese
  // cierre llega como un 'error' sin escuchar y tumba el proceso; con él, el pool simplemente abre otra conexión.
  pool.on('error', e => console.error('Conexión inactiva cerrada por la base:', e.message));
  return pool;
}

function getClient() {
  if (!client) client = createClient();
  return client;
}

// Convierte ? o @nombre en $1, $2... sin tocar lo que esté dentro de literales entre comillas simples.
// Con un único argumento objeto usa parámetros con nombre; si no, por posición.
function toPg(sql, args) {
  const named = args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]);
  const values = [];
  const slots = new Map();
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j;
    } else if (ch === '?' && !named) {
      values.push(args[values.length]);
      out += '$' + values.length;
    } else if (ch === '@' && named) {
      const name = /^[A-Za-z_]\w*/.exec(sql.slice(i + 1));
      if (!name) { out += ch; continue; }
      if (!(name[0] in args[0])) throw new Error(`Falta el parámetro @${name[0]}`);
      if (!slots.has(name[0])) { values.push(args[0][name[0]]); slots.set(name[0], values.length); }
      out += '$' + slots.get(name[0]);
      i += name[0].length;
    } else {
      out += ch;
    }
  }
  if (!named && values.length !== args.length) throw new Error(`La consulta espera ${values.length} parámetros y recibió ${args.length}`);
  return [out, values];
}

// API sobre cualquier objeto con .query(texto, valores): el pool, una conexión de transacción, o PGlite.
function makeApi(q) {
  const run = async (sql, args) => {
    const [text, values] = toPg(sql, args);
    const r = await q.query(text, values);
    return { rows: r.rows, changes: r.rowCount ?? r.affectedRows ?? 0 };
  };
  return {
    // Equivalente a db.prepare de SQLite: get() devuelve la primera fila (o undefined), all() todas, run() { changes, rows }.
    prepare: sql => ({
      get: async (...args) => (await run(sql, args)).rows[0],
      all: async (...args) => (await run(sql, args)).rows,
      run: async (...args) => run(sql, args),
    }),
    // Varias sentencias juntas, sin parámetros (esquema, setval...).
    exec: async sql => (q.exec ? q.exec(sql) : q.query(sql)),
  };
}

const api = makeApi({ query: (text, values) => getClient().query(text, values), exec: sql => (getClient().exec ? getClient().exec(sql) : getClient().query(sql)) });

// Ejecuta fn(tx) en una transacción: tx tiene el mismo prepare/exec. Si fn lanza, se deshace todo.
async function transaction(fn) {
  const c = getClient();
  if (c.transaction) return c.transaction(t => fn(makeApi(t))); // PGlite
  const conn = await c.connect();
  try {
    await conn.query('BEGIN');
    const result = await fn(makeApi(conn));
    await conn.query('COMMIT');
    return result;
  } catch (e) {
    await conn.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// Crea las tablas que falten (server/schema.sql). No borra ni modifica datos.
async function migrate() {
  await api.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

async function close() {
  if (!client) return;
  const c = client;
  client = null;
  await (c.end ? c.end() : c.close());
}

module.exports = { prepare: api.prepare, exec: api.exec, transaction, migrate, close, toPg };
