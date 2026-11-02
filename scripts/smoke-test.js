// Prueba de humo de punta a punta: levanta la app en un puerto libre, crea usuarios de prueba (smoketest_*) y recorre
// las rutas con escritura — registro, sesión, reseñas, listas, seguimiento, notificaciones, reto diario, sugerencias
// y el panel de admin — comprobando respuestas y errores. Al terminar borra todo lo que creó.
// Uso: node -r ./scripts/local-env.js scripts/smoke-test.js      (Postgres local)
//      npm run test:smoke                                          (usa DATABASE_URL de .env.local)
// Ojo: no correrlo contra la base de producción sin querer; deja la base como estaba, pero escribe mientras corre.
const assert = require('node:assert/strict');
const app = require('../server/index.js');
const db = require('../server/db');

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
let ipCounter = 10; // el límite de intentos es por IP: cada cliente simula la suya (la app confía en X-Forwarded-For)

function client() {
  const ip = `10.9.0.${ipCounter++}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, body: json, text };
  };
  return call;
}

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 6).join('\n      ')); }
}
const ok = (r, status = 200) => assert.equal(r.status, status, `esperaba ${status}, llegó ${r.status}: ${r.text.slice(0, 200)}`);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const a = client(), b = client(), anon = client(), admin = client();
  const pass = 'Smoketest123';
  let gameId, otherGameId, charId, reviewId, listId;

  console.log('Catálogo');
  await step('hay juegos y personajes', async () => {
    const g = await anon('GET', '/api/games'); ok(g);
    gameId = g.body.games[0].id; otherGameId = g.body.games[1].id;
    const c = await anon('GET', '/api/characters'); ok(c);
    charId = c.body.characters[0].id;
    assert.ok(g.body.games.length > 1 && charId);
  });

  console.log('Cuentas');
  await step('registro válido crea sesión', async () => {
    const r = await a('POST', '/api/auth/register', { email: 'smoketest_a@example.com', password: pass, username: 'smoketest_a', bio: 'hola' }); ok(r);
    assert.equal(r.body.user.username, 'smoketest_a');
    const me = await a('GET', '/api/auth/me'); assert.equal(me.body.user.username, 'smoketest_a');
  });
  await step('registro rechaza duplicados (email y usuario sin importar mayúsculas), clave débil y nombre inválido', async () => {
    const x = client();
    ok(await x('POST', '/api/auth/register', { email: 'smoketest_a@example.com', password: pass, username: 'otro_nombre' }), 409);
    const dup = await x('POST', '/api/auth/register', { email: 'x1@example.com', password: pass, username: 'SMOKETEST_A' }); ok(dup, 409);
    assert.equal(dup.body.error, 'username_taken');
    assert.equal((await x('POST', '/api/auth/register', { email: 'x2@example.com', password: '123', username: 'smoketest_x' })).body.error, 'weak_password');
    assert.equal((await x('POST', '/api/auth/register', { email: 'x3@example.com', password: pass, username: 'a' })).body.error, 'invalid_username');
    assert.equal((await x('POST', '/api/auth/register', { email: 'malo', password: pass, username: 'smoketest_x' })).body.error, 'invalid_email');
  });
  await step('login por email y por usuario; contraseña mala = 401; logout cierra sesión', async () => {
    const x = client();
    ok(await x('POST', '/api/auth/login', { identifier: 'smoketest_a@example.com', password: pass }));
    assert.equal((await x('GET', '/api/auth/me')).body.user.username, 'smoketest_a');
    ok(await x('POST', '/api/auth/logout'));
    assert.equal((await x('GET', '/api/auth/me')).body.user, null);
    ok(await x('POST', '/api/auth/login', { identifier: 'SmokeTest_A', password: pass }));
    ok(await x('POST', '/api/auth/login', { identifier: 'smoketest_a', password: 'mala1234' }), 401);
  });
  await step('segundo usuario y cambio de contraseña', async () => {
    ok(await b('POST', '/api/auth/register', { email: 'smoketest_b@example.com', password: pass, username: 'smoketest_b' }));
    ok(await b('POST', '/api/account/password', { currentPassword: 'incorrecta1', newPassword: 'Nueva12345' }), 401);
    ok(await b('POST', '/api/account/password', { currentPassword: pass, newPassword: 'Nueva12345' }));
    ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_b', password: 'Nueva12345' }));
  });
  await step('rutas protegidas devuelven 401 sin sesión', async () => {
    for (const [m, u] of [['PUT', `/api/reviews/${gameId}`], ['GET', '/api/notifications'], ['GET', '/api/lists/mine'], ['GET', '/api/daily?date=' + today], ['GET', '/api/admin/games']]) {
      ok(await anon(m, u, m === 'PUT' ? {} : undefined), 401);
    }
  });

  console.log('Reseñas de juegos');
  await step('crear, leer, editar reseña; validaciones', async () => {
    const r = await a('PUT', `/api/reviews/${gameId}`, { rating: 8, text: 'Muy bueno', platforms: ['steam'] }); ok(r);
    reviewId = r.body.id; assert.ok(reviewId);
    const list = (await anon('GET', '/api/reviews')).body.reviews;
    const mine = list.find(x => x.id === reviewId);
    assert.deepEqual([mine.username, mine.rating, mine.text, mine.platforms, mine.helpfulBy], ['smoketest_a', 8, 'Muy bueno', ['steam'], []]);
    ok(await a('PUT', `/api/reviews/${gameId}`, { rating: 9 })); // editar solo la nota conserva el texto
    assert.equal((await anon('GET', '/api/reviews')).body.reviews.find(x => x.id === reviewId).text, 'Muy bueno');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { rating: 11 })).body.error, 'invalid_rating');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { text: 'x'.repeat(601) })).body.error, 'invalid_text');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { platforms: ['atari'] })).body.error, 'invalid_platforms');
    ok(await a('PUT', '/api/reviews/no-existe', { rating: 5 }), 404);
  });
  await step('"útil": no en la propia, sí en la ajena, notifica y se puede quitar', async () => {
    ok(await a('POST', `/api/reviews/id/${reviewId}/helpful`), 400);
    const on = await b('POST', `/api/reviews/id/${reviewId}/helpful`); ok(on);
    assert.deepEqual(on.body.helpfulBy, ['smoketest_b']);
    const notes = (await a('GET', '/api/notifications')).body.notifications;
    assert.ok(notes.some(n => n.type === 'helpful' && n.actorUsername === 'smoketest_b' && n.read === false));
    assert.deepEqual((await b('POST', `/api/reviews/id/${reviewId}/helpful`)).body.helpfulBy, []);
    ok(await a('POST', '/api/notifications/read'));
    assert.ok((await a('GET', '/api/notifications')).body.notifications.every(n => n.read === true));
  });
  await step('borrar texto, borrar nota y borrar reseña vacía', async () => {
    const d1 = await a('DELETE', `/api/reviews/${gameId}/text`); assert.equal(d1.body.deleted, false); // queda la nota
    const d2 = await a('DELETE', `/api/reviews/${gameId}/rating`); assert.equal(d2.body.deleted, false); // queda la plataforma
    ok(await a('PUT', `/api/reviews/${gameId}`, { platforms: [] }));
    assert.ok(!(await anon('GET', '/api/reviews')).body.reviews.some(x => x.id === reviewId)); // vacía = se borra
    const r = await a('PUT', `/api/reviews/${otherGameId}`, { rating: 4 }); ok(r);
    ok(await a('DELETE', `/api/reviews/id/${r.body.id}`));
  });

  console.log('Reseñas de personajes');
  await step('crear, editar y borrar; personaje inexistente = 404', async () => {
    const r = await a('PUT', `/api/character-reviews/${charId}`, { rating: 10, text: 'Genial' }); ok(r);
    const mine = (await anon('GET', '/api/character-reviews')).body.characterReviews.find(x => x.id === r.body.id);
    assert.deepEqual([mine.username, mine.rating, mine.text], ['smoketest_a', 10, 'Genial']);
    assert.equal((await a('DELETE', `/api/character-reviews/${charId}/text`)).body.deleted, false);
    assert.equal((await a('DELETE', `/api/character-reviews/${charId}/rating`)).body.deleted, true);
    ok(await a('PUT', '/api/character-reviews/no-existe', { rating: 5 }), 404);
  });

  console.log('Perfil');
  await step('favorito, wishlist, actividad y reto diario', async () => {
    assert.equal((await a('PUT', '/api/profile/favorite', { gameId })).body.favoriteGameId, gameId);
    assert.equal((await a('PUT', '/api/profile/favorite', { gameId: 'no-existe' })).body.error, 'invalid_game');
    assert.deepEqual((await a('POST', '/api/profile/wishlist/toggle', { gameId })).body.wishlist, [gameId]);
    assert.deepEqual((await a('POST', '/api/profile/wishlist/toggle', { gameId })).body.wishlist, []);
    assert.deepEqual((await a('POST', '/api/profile/activity', { date: today })).body.activityDates, [today]);
    assert.equal((await a('POST', '/api/profile/activity', { date: '2001-01-01' })).body.error, 'invalid_date');
    ok(await a('PUT', '/api/daily', { date: today, guesses: ['A', 'B'], solved: false, failed: false, rouletteSpins: 2 }));
    ok(await a('PUT', '/api/daily', { date: today, guesses: ['A', 'B', 'C'], solved: true, failed: false, rouletteSpins: 2 })); // upsert
    const d = (await a('GET', '/api/daily?date=' + today)).body.daily;
    assert.deepEqual([d.guesses, d.solved, d.rouletteSpins], [['A', 'B', 'C'], true, 2]);
    assert.equal((await a('PUT', '/api/daily', { date: today, guesses: ['1', '2', '3', '4', '5', '6'] })).body.error, 'invalid_guesses');
  });
  await step('editar perfil: usuario/email repetidos = 409, cambio válido se refleja', async () => {
    assert.equal((await a('PUT', '/api/profile', { username: 'smoketest_b' })).status, 409);
    assert.equal((await a('PUT', '/api/profile', { email: 'smoketest_b@example.com' })).status, 409);
    const r = await a('PUT', '/api/profile', { bio: 'Nueva bio', socialLinks: { steam: 'https://steamcommunity.com/id/x', x: 'javascript:alert(1)' } }); ok(r);
    assert.equal(r.body.user.bio, 'Nueva bio');
    assert.deepEqual(r.body.user.socialLinks, { steam: 'https://steamcommunity.com/id/x' });
    const pub = (await anon('GET', '/api/users/SMOKETEST_A')).body.user;
    assert.deepEqual([pub.username, pub.bio, pub.reviewCount], ['smoketest_a', 'Nueva bio', 0]);
  });
  await step('seguir, amistad mutua, notificación y dejar de seguir', async () => {
    const f1 = (await a('POST', '/api/users/smoketest_b/follow')).body; assert.deepEqual([f1.isFollowing, f1.isFriend, f1.followerCount], [true, false, 1]);
    const f2 = (await b('POST', '/api/users/smoketest_a/follow')).body; assert.deepEqual([f2.isFollowing, f2.isFriend], [true, true]);
    assert.ok((await b('GET', '/api/notifications')).body.notifications.some(n => n.type === 'follow' && n.actorUsername === 'smoketest_a'));
    ok(await a('POST', '/api/users/smoketest_a/follow'), 400);
    ok(await a('POST', '/api/users/no_existe_nadie/follow'), 404);
    assert.equal((await a('POST', '/api/users/smoketest_b/follow')).body.isFollowing, false);
    assert.equal((await b('POST', '/api/users/smoketest_a/follow')).body.isFollowing, false);
  });

  console.log('Listas');
  await step('crear, agregar/quitar juegos, editar, listar públicas y borrar', async () => {
    const c = await a('POST', '/api/lists', { title: 'Mis favoritos', isPublic: true }); ok(c);
    listId = c.body.list.id; assert.deepEqual(c.body.list.gameIds, []);
    assert.deepEqual((await a('POST', `/api/lists/${listId}/items/toggle`, { gameId })).body.list.gameIds, [gameId]);
    ok(await a('POST', `/api/lists/${listId}/items/toggle`, { gameId: 'no-existe' }), 400);
    ok(await b('POST', `/api/lists/${listId}/items/toggle`, { gameId }), 403); // no es suya
    const e = await a('PUT', `/api/lists/${listId}`, { title: 'Renombrada', isPublic: false }); assert.deepEqual([e.body.list.title, e.body.list.isPublic], ['Renombrada', false]);
    assert.equal((await anon('GET', '/api/users/smoketest_a/lists')).body.lists.length, 0); // privada: no se ve
    assert.equal((await a('GET', '/api/lists/mine')).body.lists.length, 1);
    await a('PUT', `/api/lists/${listId}`, { isPublic: true });
    assert.deepEqual((await anon('GET', '/api/users/smoketest_a/lists')).body.lists[0].gameIds, [gameId]);
    assert.deepEqual((await a('POST', `/api/lists/${listId}/items/toggle`, { gameId })).body.list.gameIds, []);
    ok(await a('DELETE', `/api/lists/${listId}`));
    assert.equal((await a('GET', '/api/lists/mine')).body.lists.length, 0);
  });

  console.log('Sugerencias, páginas y portadas');
  await step('sugerencias de juego y de personaje', async () => {
    ok(await anon('POST', '/api/suggestions', { title: 'smoketest juego nuevo', platforms: ['steam'], genre: 'Acción', releaseYear: 2024, note: 'prueba' }));
    ok(await a('POST', '/api/suggestions', { kind: 'character', title: 'smoketest personaje', relatedGame: 'Hades', categories: ['villain', 'inventada'] }));
    assert.equal((await anon('POST', '/api/suggestions', { title: 'x' })).body.error, 'title_too_short');
  });
  await step('páginas con meta Open Graph (juego, personaje, usuario) y rutas del SPA', async () => {
    const title = (await anon('GET', '/api/games')).body.games.find(g => g.id === gameId).title;
    const g = await anon('GET', `/juego/${gameId}`); ok(g);
    assert.ok(g.text.includes(`<title>${title} — DLCritic</title>`) || g.text.includes('&amp;'), 'título del juego en <title>');
    const c = await anon('GET', `/personaje/${charId}`); ok(c); assert.ok(/<title>.+ — DLCritic<\/title>/.test(c.text));
    const u = await anon('GET', '/usuario/smoketest_a'); ok(u); assert.ok(u.text.includes('smoketest_a — DLCritic'));
    for (const route of ['/explorar', '/personajes', '/reto-del-dia', '/juego/no-existe']) ok(await anon('GET', route));
    ok(await anon('GET', '/api/no-existe'), 404);
    assert.deepEqual((await anon('GET', '/api/cover?title=titulo%20que%20no%20existe')).body, { url: null });
  });

  console.log('Panel de administración');
  await step('un usuario normal no entra (403); el admin sí', async () => {
    ok(await a('GET', '/api/admin/games'), 403);
    ok(await admin('POST', '/api/auth/register', { email: 'smoketest_admin@example.com', password: pass, username: 'smoketest_admin' }));
    await db.prepare("UPDATE users SET is_admin = 1 WHERE lower(username) = 'smoketest_admin'").run();
    ok(await admin('GET', '/api/admin/games'));
  });
  await step('juegos: crear, editar, ocultar y borrar', async () => {
    const c = await admin('POST', '/api/admin/games', { title: 'Smoketest Game', genres: ['Acción', 'Indie'], platforms: ['steam'], releaseYear: '2025', description: 'd', isNewRelease: true, newReleaseDate: '2025-05-05' }); ok(c);
    const id = c.body.game.id; assert.deepEqual([c.body.game.genre, c.body.game.releaseYear, c.body.game.isNewRelease, c.body.game.builtin], ['Acción', 2025, true, false]);
    assert.ok((await anon('GET', '/api/games')).body.games.some(g => g.id === id));
    const u = await admin('PUT', `/api/admin/games/${id}`, { title: 'Smoketest Game 2', hidden: true }); ok(u); assert.deepEqual([u.body.game.title, u.body.game.hidden], ['Smoketest Game 2', true]);
    assert.ok(!(await anon('GET', '/api/games')).body.games.some(g => g.id === id)); // oculto: no aparece en el sitio público
    assert.equal((await admin('POST', '/api/admin/games', { title: 'a' })).body.error, 'title_too_short');
    ok(await admin('PUT', '/api/admin/games/no-existe', { title: 'Hola' }), 404);
    ok(await admin('DELETE', `/api/admin/games/${id}`));
  });
  await step('personajes: crear con categorías y juegos, editar y borrar', async () => {
    const c = await admin('POST', '/api/admin/characters', { name: 'Smoketest Hero', gameIds: [gameId, otherGameId], categories: ['protagonist', 'villain', 'inventada'], description: 'desc' }); ok(c);
    const ch = c.body.character; assert.deepEqual([ch.gameIds, ch.categories, ch.gameId], [[gameId, otherGameId], ['protagonist', 'villain'], gameId]);
    const u = await admin('PUT', `/api/admin/characters/${ch.id}`, { categories: ['coprotagonist'], hidden: true }); assert.deepEqual([u.body.character.categories, u.body.character.hidden], [['coprotagonist'], true]);
    assert.ok(!(await anon('GET', '/api/characters')).body.characters.some(x => x.id === ch.id));
    ok(await admin('DELETE', `/api/admin/characters/${ch.id}`));
  });
  await step('fechas y noticias (límite de 180 caracteres, solo http/https)', async () => {
    const d = await admin('POST', '/api/admin/date-events', { month: 5, day: 5, titleEs: 'Prueba', titleEn: 'Test', descEs: 'd', descEn: 'd' }); ok(d);
    assert.deepEqual((await admin('PUT', `/api/admin/date-events/${d.body.dateEvent.id}`, { day: 6 })).body.dateEvent.day, 6);
    assert.equal((await admin('POST', '/api/admin/date-events', { month: 13, day: 1, titleEs: 'x', titleEn: 'y' })).body.error, 'invalid_date');
    ok(await admin('DELETE', `/api/admin/date-events/${d.body.dateEvent.id}`));
    const base = { title: 'Smoketest noticia', source: 'Test', url: 'https://example.com/x' };
    assert.equal((await admin('POST', '/api/admin/news', { ...base, summary: 'a'.repeat(181) })).body.error, 'summary_too_long');
    assert.equal((await admin('POST', '/api/admin/news', { ...base, url: 'javascript:alert(1)' })).body.error, 'invalid_url');
    const n = await admin('POST', '/api/admin/news', { ...base, summary: 'b'.repeat(180) }); ok(n);
    assert.equal((await admin('PUT', `/api/admin/news/${n.body.newsItem.id}`, { summary: 'c'.repeat(181) })).body.error, 'summary_too_long');
    assert.ok((await anon('GET', '/api/news')).body.news.some(x => x.id === n.body.newsItem.id));
    ok(await admin('DELETE', `/api/admin/news/${n.body.newsItem.id}`));
  });
  await step('buzón de sugerencias: listar, marcar como leída y borrar', async () => {
    const all = (await admin('GET', '/api/admin/suggestions')).body.suggestions.filter(s => s.title.startsWith('smoketest'));
    assert.equal(all.length, 2);
    const ch = all.find(s => s.kind === 'character'); assert.deepEqual([ch.relatedGame, ch.categories, ch.submittedBy], ['Hades', ['villain'], 'smoketest_a']);
    assert.equal((await admin('PUT', `/api/admin/suggestions/${ch.id}`, { status: 'read' })).body.suggestion.status, 'read');
    assert.equal((await admin('PUT', `/api/admin/suggestions/${ch.id}`, { status: 'x' })).body.error, 'invalid_status');
    for (const s of all) ok(await admin('DELETE', `/api/admin/suggestions/${s.id}`));
  });

  // limpieza
  await db.prepare("DELETE FROM users WHERE username LIKE 'smoketest\\_%' ESCAPE '\\'").run();
  await db.prepare("DELETE FROM game_suggestions WHERE title LIKE 'smoketest%'").run();
  const left = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'smoketest%'").get();
  assert.equal(left.n, 0);

  console.log(`\n${passed} pasos bien, ${failed} con fallas`);
  server.close();
  await db.close();
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error('Error inesperado:', e); server.close(); await db.close().catch(() => {}); process.exit(1); });
