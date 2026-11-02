// Crea las tablas que falten en la base (server/schema.sql). Es seguro correrlo varias veces.
// Uso: npm run db:migrate
const db = require('../server/db');

db.migrate()
  .then(() => console.log('Esquema listo.'))
  .catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.close());
