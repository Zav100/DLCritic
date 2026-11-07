// Promotes an existing user to admin so they can use /admin.
// Usage: npm run make-admin -- <username>      (usa DATABASE_URL de .env.local, o PGLITE_DIR en local)
const db = require('./db');

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run make-admin -- <username>');
  process.exit(1);
}

(async () => {
  const user = await db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username);
  if (!user) {
    console.error(`No existe ningún usuario "${username}". Regístrate primero en la app y después ejecuta este script.`);
    process.exitCode = 1;
    return;
  }
  await db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
  console.log(`"${user.username}" ahora es administrador. Inicia sesión con esa cuenta en /admin.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
