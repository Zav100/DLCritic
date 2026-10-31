// Promotes an existing user to admin so they can use /admin.
// Usage: node server/make-admin.js <username>
const db = require('./db');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node server/make-admin.js <username>');
  process.exit(1);
}

const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (!user) {
  console.error(`No existe ningún usuario "${username}". Registrate primero en la app y despues corré este script.`);
  process.exit(1);
}

db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
console.log(`"${user.username}" ahora es administrador. Iniciá sesión con esa cuenta en /admin.`);
