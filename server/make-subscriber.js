// Le da (o le quita) el rol de suscriptor a un usuario existente.
// Uso: npm run make-subscriber -- <usuario>        (lo da)
//      npm run make-subscriber -- <usuario> off    (lo quita)
// Usa DATABASE_URL de .env.local, o PGLITE_DIR en local. Producción: node --env-file=.env.backup server/make-subscriber.js <usuario> [off]
const db = require('./db');

const [username, action] = process.argv.slice(2);
if (!username) {
  console.error('Uso: npm run make-subscriber -- <usuario> [off]');
  process.exit(1);
}

(async () => {
  const user = await db.prepare('SELECT id, username, is_subscriber FROM users WHERE lower(username) = lower(?)').get(username);
  if (!user) {
    console.error(`No existe ningún usuario "${username}".`);
    process.exitCode = 1;
    return;
  }
  const on = action !== 'off';
  await db.prepare('UPDATE users SET is_subscriber = ? WHERE id = ?').run(on ? 1 : 0, user.id);
  console.log(on ? `"${user.username}" ahora es suscriptor.` : `"${user.username}" ya no es suscriptor (si tenía un GIF de foto, se queda hasta que la cambie).`);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
