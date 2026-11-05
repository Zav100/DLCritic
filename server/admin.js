const express = require('express');
const crypto = require('node:crypto');
const db = require('./db');
const { requireAuth, verifyPin, sessionToken, endOtherSessions } = require('./auth');
const totp = require('./totp');
const { rateLimit } = require('./rateLimit');
const { receiveImage, saveImage } = require('./upload');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'admin_required' });
  next();
}
router.use(requireAuth, requireAdmin);

/* ---------------- verificación en dos pasos ---------------- */

// Estos dos endpoints van antes de la exigencia de tener 2FA, porque son la forma de conseguirla. Tope compartido: 10 pedidos cada 15 minutos por usuario.
const twoFactorLimiter = rateLimit({ name: 'admin-2fa', windowMs: 15 * 60 * 1000, max: 10, keyFn: req => 'u:' + req.user.id });
const startTwoFactor = db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?');
const finishTwoFactor = db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ?, totp_recovery = ? WHERE id = ?');

// Paso 1: genera una clave nueva (la pisa si había una a medio configurar) y la devuelve para el QR. Pide la contraseña otra vez: sin eso,
// una sesión robada alcanzaría para atar la cuenta al teléfono de otra persona.
router.post('/2fa/setup', twoFactorLimiter, async (req, res) => {
  if (req.user.totp_enabled) return res.status(409).json({ error: 'already_enabled' });
  if (!verifyPin(String(req.body.currentPassword || ''), req.user.pin_hash)) return res.status(401).json({ error: 'bad_current_password' });
  const secret = totp.newSecret();
  await startTwoFactor.run(secret, req.user.id);
  res.json({ secret, otpauthUri: totp.otpauthUri(secret, req.user.username) });
});

// Paso 2: con un código de la app (prueba de que quedó bien configurada) se activa y se devuelven los códigos de recuperación, una única vez.
router.post('/2fa/enable', twoFactorLimiter, async (req, res) => {
  if (req.user.totp_enabled) return res.status(409).json({ error: 'already_enabled' });
  if (!req.user.totp_secret) return res.status(400).json({ error: 'not_started' });
  const step = totp.verifyCode(req.user.totp_secret, String(req.body.code || '').replace(/\s/g, ''));
  if (step === null) return res.status(401).json({ error: 'bad_code' });
  const recoveryCodes = totp.newRecoveryCodes();
  await finishTwoFactor.run(step, JSON.stringify(recoveryCodes.map(totp.hashRecoveryCode)), req.user.id);
  await endOtherSessions(req.user.id, sessionToken(req)); // si alguien tenía otra sesión abierta, se cierra
  res.json({ recoveryCodes });
});

// Desde acá, todo el panel exige tener la verificación en dos pasos activada.
router.use((req, res, next) => (req.user.totp_enabled ? next() : res.status(403).json({ error: 'two_factor_required' })));

const uploadLimiter = rateLimit({ name: 'admin-upload', windowMs: 10 * 60 * 1000, max: 30, keyFn: req => 'u:' + req.user.id });

router.post('/upload', uploadLimiter, async (req, res) => {
  let file;
  try { file = await receiveImage(req, res); }
  catch (e) { return res.status(400).json({ error: 'upload_failed' }); }
  if (!file) return res.status(400).json({ error: 'invalid_file' });
  res.json({ url: await saveImage(file) });
});

function uid() { return Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

const listAdminGames = db.prepare('SELECT * FROM games ORDER BY title ASC');
const findAdminGame = db.prepare('SELECT * FROM games WHERE id = ?');
const insertAdminGame = db.prepare(`
  INSERT INTO games (id, title, genre, genres, platforms, added_by, created_at, cover_url, card_cover_url, description, developer, publisher,
    release_year, game_mode, store_links, hidden, is_new_release, new_release_date, builtin)
  VALUES (@id, @title, @genre, @genres, @platforms, @added_by, @created_at, @cover_url, @card_cover_url, @description, @developer, @publisher,
    @release_year, @game_mode, @store_links, @hidden, @is_new_release, @new_release_date, 0)
`);
const updateAdminGame = db.prepare(`
  UPDATE games SET title=@title, genre=@genre, genres=@genres, platforms=@platforms, cover_url=@cover_url, card_cover_url=@card_cover_url, description=@description,
    developer=@developer, publisher=@publisher, release_year=@release_year, game_mode=@game_mode, store_links=@store_links,
    hidden=@hidden, is_new_release=@is_new_release, new_release_date=@new_release_date
  WHERE id=@id
`);
const deleteAdminGame = db.prepare('DELETE FROM games WHERE id = ?');

function shapeAdminGame(g) {
  return {
    id: g.id, title: g.title, genre: g.genre, genres: JSON.parse(g.genres || '[]'), platforms: JSON.parse(g.platforms || '[]'),
    addedBy: g.added_by, createdAt: g.created_at, coverUrl: g.cover_url, cardCoverUrl: g.card_cover_url, description: g.description,
    developer: g.developer, publisher: g.publisher, releaseYear: g.release_year,
    gameMode: g.game_mode, storeLinks: JSON.parse(g.store_links || '{}'),
    hidden: !!g.hidden, isNewRelease: !!g.is_new_release, newReleaseDate: g.new_release_date, builtin: !!g.builtin,
  };
}

router.get('/games', async (req, res) => {
  res.json({ games: (await listAdminGames.all()).map(shapeAdminGame) });
});

router.post('/games', async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (title.length < 2) return res.status(400).json({ error: 'title_too_short' });
  const id = 'u-' + uid();
  const genresArr = Array.isArray(b.genres) && b.genres.length ? b.genres : (b.genre ? [b.genre] : ['Otro']);
  await insertAdminGame.run({
    id, title, genre: genresArr[0], genres: JSON.stringify(genresArr), platforms: JSON.stringify(b.platforms || []),
    added_by: req.user.username, created_at: new Date().toISOString(),
    cover_url: b.coverUrl || null, card_cover_url: b.cardCoverUrl || null, description: b.description || null,
    developer: b.developer || null, publisher: b.publisher || null,
    release_year: b.releaseYear ? Number(b.releaseYear) : null,
    game_mode: b.gameMode || null, store_links: JSON.stringify(b.storeLinks || {}),
    hidden: b.hidden ? 1 : 0, is_new_release: b.isNewRelease ? 1 : 0,
    new_release_date: b.newReleaseDate || null,
  });
  res.json({ game: shapeAdminGame(await findAdminGame.get(id)) });
});

router.put('/games/:id', async (req, res) => {
  const existing = await findAdminGame.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const title = String(b.title !== undefined ? b.title : existing.title).trim();
  if (title.length < 2) return res.status(400).json({ error: 'title_too_short' });
  const genresArr = Array.isArray(b.genres)
    ? (b.genres.length ? b.genres : ['Otro'])
    : JSON.parse(existing.genres || '[]').length ? JSON.parse(existing.genres || '[]') : [existing.genre];
  await updateAdminGame.run({
    id: req.params.id, title, genre: genresArr[0], genres: JSON.stringify(genresArr),
    platforms: JSON.stringify(b.platforms !== undefined ? b.platforms : JSON.parse(existing.platforms || '[]')),
    cover_url: b.coverUrl !== undefined ? b.coverUrl : existing.cover_url,
    card_cover_url: b.cardCoverUrl !== undefined ? b.cardCoverUrl : existing.card_cover_url,
    description: b.description !== undefined ? b.description : existing.description,
    developer: b.developer !== undefined ? b.developer : existing.developer,
    publisher: b.publisher !== undefined ? b.publisher : existing.publisher,
    release_year: b.releaseYear !== undefined ? (b.releaseYear ? Number(b.releaseYear) : null) : existing.release_year,
    game_mode: b.gameMode !== undefined ? b.gameMode : existing.game_mode,
    store_links: JSON.stringify(b.storeLinks !== undefined ? b.storeLinks : JSON.parse(existing.store_links || '{}')),
    hidden: b.hidden !== undefined ? (b.hidden ? 1 : 0) : existing.hidden,
    is_new_release: b.isNewRelease !== undefined ? (b.isNewRelease ? 1 : 0) : existing.is_new_release,
    new_release_date: b.newReleaseDate !== undefined ? b.newReleaseDate : existing.new_release_date,
  });
  res.json({ game: shapeAdminGame(await findAdminGame.get(req.params.id)) });
});

router.delete('/games/:id', async (req, res) => {
  await deleteAdminGame.run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- characters (name, photo, related game) ---------------- */

const listAdminCharacters = db.prepare('SELECT * FROM characters ORDER BY name ASC');
const findAdminCharacter = db.prepare('SELECT * FROM characters WHERE id = ?');
const insertAdminCharacter = db.prepare(`
  INSERT INTO characters (id, name, game_id, game_ids, banner_url, banner_game_id, photo_url, categories, description, added_by, created_at, hidden)
  VALUES (@id, @name, @game_id, @game_ids, @banner_url, @banner_game_id, @photo_url, @categories, @description, @added_by, @created_at, @hidden)
`);
const updateAdminCharacter = db.prepare(`
  UPDATE characters SET name=@name, game_id=@game_id, game_ids=@game_ids, banner_url=@banner_url, banner_game_id=@banner_game_id,
    photo_url=@photo_url, categories=@categories, description=@description, hidden=@hidden WHERE id=@id
`);
// Mismas claves que CHARACTER_CATEGORIES de index.js (y que CHAR_CATEGORIES del frontend).
const CHARACTER_CATEGORIES = ['protagonist', 'coprotagonist', 'villain', 'ally', 'secondary'];
const normalizeCategories = input => (Array.isArray(input) ? [...new Set(input.filter(k => CHARACTER_CATEGORIES.includes(k)))] : []);
const deleteAdminCharacter = db.prepare('DELETE FROM characters WHERE id = ?');

function shapeAdminCharacter(c) {
  const gameIds = JSON.parse(c.game_ids || '[]');
  return {
    id: c.id, name: c.name, gameIds, gameId: gameIds[0] || null,
    bannerUrl: c.banner_url, bannerGameId: c.banner_game_id,
    photoUrl: c.photo_url, categories: JSON.parse(c.categories || '[]'), description: c.description,
    addedBy: c.added_by, createdAt: c.created_at, hidden: !!c.hidden,
  };
}
// Un personaje puede pertenecer a varios juegos (game_ids); game_id (uno solo) se mantiene en paralelo, como el
// primero de la lista, únicamente por si algo viejo todavía lo lee — la fuente real de verdad es siempre game_ids.
function normalizeGameIds(input) {
  return Array.isArray(input) ? input.filter(id => typeof id === 'string' && id) : [];
}

router.get('/characters', async (req, res) => {
  res.json({ characters: (await listAdminCharacters.all()).map(shapeAdminCharacter) });
});

router.post('/characters', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'name_too_short' });
  const id = 'ch-' + uid();
  const gameIds = normalizeGameIds(b.gameIds);
  await insertAdminCharacter.run({
    id, name, game_id: gameIds[0] || null, game_ids: JSON.stringify(gameIds),
    banner_url: b.bannerUrl || null, banner_game_id: b.bannerGameId || null,
    photo_url: b.photoUrl || null, categories: JSON.stringify(normalizeCategories(b.categories)), description: b.description || null,
    added_by: req.user.username, created_at: new Date().toISOString(), hidden: b.hidden ? 1 : 0,
  });
  res.json({ character: shapeAdminCharacter(await findAdminCharacter.get(id)) });
});

router.put('/characters/:id', async (req, res) => {
  const existing = await findAdminCharacter.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const name = String(b.name !== undefined ? b.name : existing.name).trim();
  if (name.length < 2) return res.status(400).json({ error: 'name_too_short' });
  const gameIds = b.gameIds !== undefined ? normalizeGameIds(b.gameIds) : JSON.parse(existing.game_ids || '[]');
  await updateAdminCharacter.run({
    id: req.params.id, name, game_id: gameIds[0] || null, game_ids: JSON.stringify(gameIds),
    banner_url: b.bannerUrl !== undefined ? (b.bannerUrl || null) : existing.banner_url,
    banner_game_id: b.bannerGameId !== undefined ? (b.bannerGameId || null) : existing.banner_game_id,
    photo_url: b.photoUrl !== undefined ? b.photoUrl : existing.photo_url,
    categories: b.categories !== undefined ? JSON.stringify(normalizeCategories(b.categories)) : existing.categories,
    description: b.description !== undefined ? b.description : existing.description,
    hidden: b.hidden !== undefined ? (b.hidden ? 1 : 0) : existing.hidden,
  });
  res.json({ character: shapeAdminCharacter(await findAdminCharacter.get(req.params.id)) });
});

router.delete('/characters/:id', async (req, res) => {
  await deleteAdminCharacter.run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- date calendar ---------------- */

const listAdminDateEvents = db.prepare('SELECT * FROM date_events ORDER BY month ASC, day ASC, id ASC');
const findAdminDateEvent = db.prepare('SELECT * FROM date_events WHERE id = ?');
const insertDateEvent = db.prepare(`
  INSERT INTO date_events (id, month, day, game_id, title_es, desc_es, title_en, desc_en, created_at)
  VALUES (@id, @month, @day, @game_id, @title_es, @desc_es, @title_en, @desc_en, @created_at)
`);
const updateDateEvent = db.prepare(`
  UPDATE date_events SET month=@month, day=@day, game_id=@game_id, title_es=@title_es, desc_es=@desc_es,
    title_en=@title_en, desc_en=@desc_en WHERE id=@id
`);
const deleteDateEvent = db.prepare('DELETE FROM date_events WHERE id = ?');

function shapeAdminDateEvent(e) {
  return { id: e.id, month: e.month, day: e.day, gameId: e.game_id, titleEs: e.title_es, descEs: e.desc_es, titleEn: e.title_en, descEn: e.desc_en };
}

router.get('/date-events', async (req, res) => {
  res.json({ dateEvents: (await listAdminDateEvents.all()).map(shapeAdminDateEvent) });
});

router.post('/date-events', async (req, res) => {
  const b = req.body || {};
  const month = Number(b.month), day = Number(b.day);
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return res.status(400).json({ error: 'invalid_date' });
  if (!b.titleEs || !b.titleEn) return res.status(400).json({ error: 'title_required' });
  const id = 'de-' + uid();
  await insertDateEvent.run({
    id, month, day, game_id: b.gameId || null,
    title_es: b.titleEs, desc_es: b.descEs || '', title_en: b.titleEn, desc_en: b.descEn || '',
    created_at: new Date().toISOString(),
  });
  res.json({ dateEvent: shapeAdminDateEvent(await findAdminDateEvent.get(id)) });
});

router.put('/date-events/:id', async (req, res) => {
  const existing = await findAdminDateEvent.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  await updateDateEvent.run({
    id: req.params.id,
    month: b.month !== undefined ? Number(b.month) : existing.month,
    day: b.day !== undefined ? Number(b.day) : existing.day,
    game_id: b.gameId !== undefined ? (b.gameId || null) : existing.game_id,
    title_es: b.titleEs !== undefined ? b.titleEs : existing.title_es,
    desc_es: b.descEs !== undefined ? b.descEs : existing.desc_es,
    title_en: b.titleEn !== undefined ? b.titleEn : existing.title_en,
    desc_en: b.descEn !== undefined ? b.descEn : existing.desc_en,
  });
  res.json({ dateEvent: shapeAdminDateEvent(await findAdminDateEvent.get(req.params.id)) });
});

router.delete('/date-events/:id', async (req, res) => {
  await deleteDateEvent.run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- news ---------------- */

const listAdminNews = db.prepare('SELECT * FROM news_items ORDER BY created_at DESC, id ASC');
const findAdminNews = db.prepare('SELECT * FROM news_items WHERE id = ?');
const insertNews = db.prepare(`
  INSERT INTO news_items (id, title, summary, source, url, color, initials, created_at)
  VALUES (@id, @title, @summary, @source, @url, @color, @initials, @created_at)
`);
const updateNews = db.prepare(`
  UPDATE news_items SET title=@title, summary=@summary, source=@source, url=@url, color=@color, initials=@initials WHERE id=@id
`);
const deleteNews = db.prepare('DELETE FROM news_items WHERE id = ?');
const trimNews = db.prepare('DELETE FROM news_items WHERE id NOT IN (SELECT id FROM news_items ORDER BY created_at DESC LIMIT 30)');

function shapeAdminNews(n) {
  return { id: n.id, title: n.title, summary: n.summary, source: n.source, url: n.url, color: n.color, initials: n.initials };
}

router.get('/news', async (req, res) => {
  res.json({ news: (await listAdminNews.all()).map(shapeAdminNews) });
});

// Solo http(s): la URL de una noticia termina en un <a href>, y un "javascript:..." ahí se ejecutaría al hacer clic.
function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

// Largo máximo del resumen de una noticia (tiene que entrar en la tarjeta de Novedades). Si cambia, cambiar también el maxlength de #n-summary en admin.html.
const NEWS_SUMMARY_MAX = 180;

router.post('/news', async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const source = String(b.source || '').trim();
  const url = String(b.url || '').trim();
  const summary = typeof b.summary === 'string' ? b.summary.trim() : '';
  if (title.length < 2 || !source || !url) return res.status(400).json({ error: 'missing_fields' });
  if (!isHttpUrl(url)) return res.status(400).json({ error: 'invalid_url' });
  if (summary.length > NEWS_SUMMARY_MAX) return res.status(400).json({ error: 'summary_too_long' });
  const id = 'news-' + uid();
  await insertNews.run({
    id, title, summary, source, url,
    color: b.color || '#5B8DEF', initials: (b.initials || source.slice(0, 2)).toUpperCase(),
    created_at: new Date().toISOString(),
  });
  await trimNews.run();
  res.json({ newsItem: shapeAdminNews(await findAdminNews.get(id)) });
});

router.put('/news/:id', async (req, res) => {
  const existing = await findAdminNews.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const str = (v, fallback) => (typeof v === 'string' ? v : fallback);
  const url = str(b.url, existing.url);
  if (!isHttpUrl(url)) return res.status(400).json({ error: 'invalid_url' });
  const summary = str(b.summary, existing.summary).trim();
  if (summary.length > NEWS_SUMMARY_MAX) return res.status(400).json({ error: 'summary_too_long' });
  await updateNews.run({
    id: req.params.id,
    title: str(b.title, existing.title),
    summary,
    source: str(b.source, existing.source),
    url,
    color: str(b.color, existing.color),
    initials: str(b.initials, existing.initials).toUpperCase(),
  });
  res.json({ newsItem: shapeAdminNews(await findAdminNews.get(req.params.id)) });
});

router.delete('/news/:id', async (req, res) => {
  await deleteNews.run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- game suggestions inbox ---------------- */

const listSuggestions = db.prepare('SELECT * FROM game_suggestions ORDER BY created_at DESC');
const findSuggestion = db.prepare('SELECT * FROM game_suggestions WHERE id = ?');
const updateSuggestionStatus = db.prepare('UPDATE game_suggestions SET status = ? WHERE id = ?');
const deleteSuggestion = db.prepare('DELETE FROM game_suggestions WHERE id = ?');

function shapeSuggestion(s) {
  return {
    id: s.id, title: s.title, platforms: JSON.parse(s.platforms || '[]'), genre: s.genre,
    releaseYear: s.release_year, note: s.note, submittedBy: s.submitted_by,
    status: s.status, createdAt: s.created_at,
    kind: s.kind || 'game', relatedGame: s.related_game || null, categories: JSON.parse(s.categories || '[]'),
  };
}

router.get('/suggestions', async (req, res) => {
  res.json({ suggestions: (await listSuggestions.all()).map(shapeSuggestion) });
});

router.put('/suggestions/:id', async (req, res) => {
  const existing = await findSuggestion.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const status = String((req.body || {}).status || '');
  if (!['unread', 'read', 'archived'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  await updateSuggestionStatus.run(status, req.params.id);
  res.json({ suggestion: shapeSuggestion(await findSuggestion.get(req.params.id)) });
});

router.delete('/suggestions/:id', async (req, res) => {
  await deleteSuggestion.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
