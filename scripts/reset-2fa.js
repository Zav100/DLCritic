// Desactiva la verificación en dos pasos de una cuenta y cierra todas sus sesiones. Sirve si el admin pierde el teléfono y también los
// códigos de recuperación: la próxima vez que entre al panel, tiene que activarla de nuevo (y recibe códigos de recuperación nuevos).
// Uso: npm run db:reset-2fa -- <usuario>      (usa DATABASE_URL de .env.local, o PGLITE_DIR en local)
//      Producción: node --env-file=.env.backup scripts/reset-2fa.js <usuario>   (.env.backup tiene la DATABASE_URL de producción)
const db = require('../server/db');

const username = process.argv[2];
if (!username) {
  console.error('Uso: npm run db:reset-2fa -- <usuario>');
  process.exit(1);
}

(async () => {
  const user = await db.prepare('SELECT id, username, totp_enabled FROM users WHERE lower(username) = lower(?)').get(username);
  if (!user) {
    console.error(`No existe ningún usuario "${username}".`);
    process.exitCode = 1;
    return;
  }
  await db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = 0, totp_recovery = '[]' WHERE id = ?").run(user.id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log(user.totp_enabled
    ? `Listo: "${user.username}" ya no tiene verificación en dos pasos y se cerraron sus sesiones. Al entrar al panel tendrá que activarla de nuevo.`
    : `"${user.username}" no tenía la verificación activada; se cerraron sus sesiones.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
