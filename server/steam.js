// Cuenta de Steam vinculada: inicio de sesión con Steam (OpenID 2.0, no necesita clave) y sincronización de las horas jugadas
// y de los logros del juego favorito (Steam Web API, necesita STEAM_API_KEY). Montado en /api/steam; el dominio del panel no lo sirve (ver ADMIN_HOST_ALLOWED_PATH en index.js).
//
// Vincular: GET /link manda a Steam; Steam vuelve a GET /callback con una afirmación firmada que el servidor le devuelve a Steam para
// comprobarla (check_authentication). El SteamID64 que trae (claimed_id) es lo único que se guarda de la cuenta de Steam: nunca vemos su contraseña.
// Un nonce en una cookie ata el regreso al navegador que empezó el vínculo; sin eso, alguien podría mandarle a otra persona un enlace de
// regreso con SU cuenta de Steam y dejársela vinculada.
//
// Variables: STEAM_API_KEY (la clave de https://steamcommunity.com/dev/apikey; sin ella solo se puede vincular, no traer horas).
// STEAM_OPENID_URL y STEAM_API_URL solo existen para las pruebas (scripts/steam-mock.js apunta ahí en vez de a Steam).
const crypto = require('node:crypto');
const express = require('express');
const db = require('./db');
const { rateLimit } = require('./rateLimit');
const { publicUrl } = require('./mail');
const { requireAuth, currentUser, parseCookies } = require('./auth');

const OPENID_URL = () => process.env.STEAM_OPENID_URL || 'https://steamcommunity.com/openid/login';
const API_URL = () => process.env.STEAM_API_URL || 'https://api.steampowered.com';
const NS = 'http://specs.openid.net/auth/2.0';
const ID_SELECT = `${NS}/identifier_select`;
const NONCE_COOKIE = 'steam_link_nonce';
const CALLBACK = '/api/steam/callback';

const router = express.Router();
const limiter = rateLimit({ name: 'steam', windowMs: 10 * 60 * 1000, max: 10, keyFn: req => 'u:' + req.user.id });

const setSteamId = db.prepare('UPDATE users SET steam_id = ? WHERE id = ?');
const listSteamGames = db.prepare('SELECT id, steam_appid FROM games WHERE steam_appid IS NOT NULL AND hidden = 0');
const listHours = db.prepare('SELECT game_id, minutes FROM steam_playtime WHERE user_id = ?');
const getPlaytime = db.prepare('SELECT minutes, achievements_unlocked, achievements_total FROM steam_playtime WHERE user_id = ? AND game_id = ?');
const setAchievements = db.prepare('UPDATE steam_playtime SET achievements_unlocked = ?, achievements_total = ? WHERE user_id = ? AND game_id = ?');
const findAppId = db.prepare('SELECT steam_appid FROM games WHERE id = ?');

// Horas guardadas de una persona: { gameId: minutos }. Con onlyIds, solo las de esos juegos (el perfil público no debe mostrar las de juegos que no están en la biblioteca).
async function hoursFor(userId, onlyIds) {
  const out = {};
  for (const r of await listHours.all(userId)) if (!onlyIds || onlyIds.includes(r.game_id)) out[r.game_id] = r.minutes;
  return out;
}

// Logros de una cuenta en un juego: { unlocked, total } (total 0 si el juego no tiene logros) o null si Steam no los da (perfil o «Detalles del juego» privados, caída…).
async function fetchAchievements(steamId, appid) {
  try {
    const url = `${API_URL()}/ISteamUserStats/GetPlayerAchievements/v1/?${new URLSearchParams({ key: process.env.STEAM_API_KEY, steamid: steamId, appid: String(appid), format: 'json' })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const p = ((await r.json().catch(() => null)) || {}).playerstats || {}; // Steam manda el cuerpo JSON también en los errores (400, 403)
    if (p.success) { const list = p.achievements || []; return { unlocked: list.filter(a => a.achieved === 1).length, total: list.length }; }
    if (/no stats/i.test(p.error || '')) return { unlocked: 0, total: 0 }; // «Requested app has no stats»: el juego no tiene logros
    console.error('Steam (logros):', p.error || `Steam respondió ${r.status}`); // sin la URL en el mensaje: lleva la clave
  } catch (e) { console.error('Steam (logros):', e.message); }
  return null;
}

// Trae y guarda los logros de un juego, solo si está en la cuenta de Steam de la persona (hay fila de horas). Si Steam no los da, queda lo que había.
async function refreshAchievements(user, gameId) {
  if (!gameId || !user.steam_id || !process.env.STEAM_API_KEY || !await getPlaytime.get(user.id, gameId)) return;
  const g = await findAppId.get(gameId);
  const a = g && g.steam_appid ? await fetchAchievements(user.steam_id, g.steam_appid) : null;
  if (a) await setAchievements.run(a.unlocked, a.total, user.id, gameId);
}

// Lo que el perfil muestra del juego favorito cuando está en la cuenta de Steam de la persona: horas y logros, y el platino sale de ahí (todos los logros),
// no se marca a mano. favoriteSteam null = no aplica (sin Steam, o el favorito no está en su cuenta): ahí el platino sigue siendo manual.
// Las demás personas lo ven solo si no ocultó sus horas y logros en Ajustes (isSelf: la propia persona siempre lo ve).
async function favoriteView(u, isSelf) {
  const r = u.favorite_game_id && u.steam_id ? await getPlaytime.get(u.id, u.favorite_game_id) : null;
  if (!r) return { favoritePlatinum: !!u.favorite_platinum, favoriteSteam: null };
  const show = isSelf || !!u.steam_hours_public;
  const done = r.achievements_total > 0 && r.achievements_unlocked === r.achievements_total;
  return { favoritePlatinum: show && done, favoriteSteam: show ? { minutes: r.minutes, unlocked: r.achievements_unlocked, total: r.achievements_total } : null };
}

function nonceCookie(value, maxAge) {
  return `${NONCE_COOKIE}=${value}; Path=/api/steam; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

// Le devuelve a Steam la afirmación recibida para que confirme que la firmó él. Devuelve el SteamID64 o null.
async function verifyAssertion(q) {
  const signed = String(q['openid.signed'] || '').split(',');
  // Si estos campos no estuvieran firmados, quien tenga cualquier afirmación válida de Steam podría cambiarlos a mano.
  if (q['openid.mode'] !== 'id_res' || !['claimed_id', 'return_to', 'response_nonce'].every(f => signed.includes(f))) return null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (k.startsWith('openid.') && typeof v === 'string') params.set(k, v);
  params.set('openid.mode', 'check_authentication');
  const r = await fetch(OPENID_URL(), { method: 'POST', body: params, signal: AbortSignal.timeout(8000) });
  if (!/(^|\n)is_valid:true(\n|$)/.test(await r.text())) return null;
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(String(q['openid.claimed_id'] || ''));
  return m ? m[1] : null;
}

// 1) Empieza el vínculo: cookie con el nonce y redirección a Steam.
router.get('/link', requireAuth, (req, res) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  res.append('Set-Cookie', nonceCookie(nonce, 600));
  const q = new URLSearchParams({
    'openid.ns': NS, 'openid.mode': 'checkid_setup',
    'openid.return_to': `${publicUrl()}${CALLBACK}?n=${nonce}`, 'openid.realm': publicUrl(),
    'openid.identity': ID_SELECT, 'openid.claimed_id': ID_SELECT,
  });
  res.redirect(`${OPENID_URL()}?${q}`);
});

// 2) Steam vuelve aquí. Siempre termina en /ajustes?steam=linked | taken (ese Steam ya está en otra cuenta) | error.
// Con linked va además &sync=ok | private | none: cómo salió la primera sincronización de horas y logros (la página lo cuenta en el aviso).
router.get('/callback', async (req, res) => {
  const done = (r, sync) => res.redirect(`/ajustes?steam=${r}${sync ? '&sync=' + sync : ''}`);
  res.append('Set-Cookie', nonceCookie('', 0));
  try {
    const user = await currentUser(req);
    const nonce = parseCookies(req.headers.cookie)[NONCE_COOKIE];
    if (!user || !nonce || req.query.n !== nonce || req.query['openid.return_to'] !== `${publicUrl()}${CALLBACK}?n=${nonce}`) return done('error');
    const steamId = await verifyAssertion(req.query);
    if (!steamId) return done('error');
    try { await setSteamId.run(steamId, user.id); }
    catch (e) { if (e.code === '23505') return done('taken'); throw e; } // índice único: un Steam, una cuenta
    // Recién vinculado, trae ya las horas y los logros para que el perfil salga completo (si no se puede, la persona toca «Actualizar» en Ajustes).
    let sync = 'ok';
    try { await syncSteam({ ...user, steam_id: steamId }); }
    catch (e) { if (!e.steamCode) console.error('Steam (primera sincronización):', e.message); sync = e.steamCode === 'steam_private' ? 'private' : 'none'; }
    done('linked', sync);
  } catch (e) {
    console.error('Steam (vínculo):', e.message);
    done('error');
  }
});

// Quita el vínculo y borra lo que se guardó de Steam (el SteamID, las horas y los logros). Responde el platino manual, que vuelve a valer sin Steam.
router.post('/unlink', requireAuth, limiter, async (req, res) => {
  await db.transaction(async tx => {
    await tx.prepare('DELETE FROM steam_playtime WHERE user_id = ?').run(req.user.id);
    await tx.prepare('UPDATE users SET steam_id = NULL, steam_synced_at = NULL WHERE id = ?').run(req.user.id);
  });
  res.json({ ok: true, favoritePlatinum: !!req.user.favorite_platinum });
});

// Trae de Steam los juegos de la persona, guarda las horas de los que están en el catálogo (los que tienen steam_appid) y los logros del juego favorito.
// Devuelve las coincidencias (para que la persona elija cuáles sumar a su biblioteca) y lo del favorito. Si falla, lanza un error con steamCode.
async function syncSteam(user) {
  const key = process.env.STEAM_API_KEY;
  const fail = code => Object.assign(new Error(code), { steamCode: code });
  if (!key) throw fail('steam_not_configured');
  let owned;
  try {
    const url = `${API_URL()}/IPlayerService/GetOwnedGames/v1/?${new URLSearchParams({ key, steamid: user.steam_id, include_played_free_games: '1', format: 'json' })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Steam respondió ${r.status}`); // sin la URL en el mensaje: lleva la clave
    const j = await r.json();
    owned = j.response && Array.isArray(j.response.games) ? j.response.games : null;
  } catch (e) {
    console.error('Steam (juegos):', e.message);
    throw fail('steam_unavailable');
  }
  if (!owned) throw fail('steam_private'); // Steam no devuelve juegos si el perfil o los "detalles de juego" son privados
  const byApp = new Map();
  for (const g of await listSteamGames.all()) byApp.set(g.steam_appid, [...(byApp.get(g.steam_appid) || []), g.id]);
  const matches = [];
  for (const o of owned) for (const gameId of byApp.get(o.appid) || []) matches.push({ gameId, minutes: Math.max(0, Math.floor(o.playtime_forever || 0)) });
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    // Se actualiza fila por fila (en vez de borrar todo) para no perder los logros ya guardados; solo salen los juegos que la cuenta ya no tiene.
    const keep = new Set(matches.map(m => m.gameId));
    for (const r of await tx.prepare('SELECT game_id FROM steam_playtime WHERE user_id = ?').all(user.id)) {
      if (!keep.has(r.game_id)) await tx.prepare('DELETE FROM steam_playtime WHERE user_id = ? AND game_id = ?').run(user.id, r.game_id);
    }
    for (const m of matches) await tx.prepare('INSERT INTO steam_playtime (user_id, game_id, minutes) VALUES (?, ?, ?) ON CONFLICT (user_id, game_id) DO UPDATE SET minutes = EXCLUDED.minutes').run(user.id, m.gameId, m.minutes);
    await tx.prepare('UPDATE users SET steam_synced_at = ? WHERE id = ?').run(now, user.id);
  });
  await refreshAchievements(user, user.favorite_game_id);
  return { syncedAt: now, owned: owned.length, matches, ...(await favoriteView(user, true)) };
}

const SYNC_STATUS = { steam_not_configured: 503, steam_unavailable: 502, steam_private: 400 };
router.post('/sync', requireAuth, limiter, async (req, res) => {
  if (!req.user.steam_id) return res.status(400).json({ error: 'steam_not_linked' });
  try { res.json(await syncSteam(req.user)); }
  catch (e) { if (!e.steamCode) throw e; res.status(SYNC_STATUS[e.steamCode]).json({ error: e.steamCode }); }
});

// Las horas guardadas de la propia persona (las ajenas salen en su perfil público, si las dejó visibles).
router.get('/hours', requireAuth, async (req, res) => res.json({ hours: await hoursFor(req.user.id) }));

module.exports = router;
module.exports.hoursFor = hoursFor;
module.exports.favoriteView = favoriteView;
module.exports.refreshAchievements = refreshAchievements;
