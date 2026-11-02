// Carga el catálogo base (juegos, fechas, noticias) si las tablas están vacías. Antes lo hacía el servidor al arrancar.
// Uso: npm run db:seed   (después de npm run db:migrate)
const db = require('../server/db');
const { seedIfEmpty } = require('../server/seed');

seedIfEmpty()
  .then(() => console.log('Seed terminado.'))
  .catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.close());
