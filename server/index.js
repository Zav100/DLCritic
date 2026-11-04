const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { receiveImage, saveImage } = require('./upload');
const db = require('./db');
const { rateLimit } = require('./rateLimit');
const {
  hashPin, verifyPin, createSession, currentUser, requireAuth,
  setSessionCookie, clearSessionCookie, deleteSession, parseCookies, SESSION_COOKIE,
} = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.json());
// Express 5 deja req.body en undefined cuando no llegó JSON; las rutas esperan siempre un objeto.
app.use((req, res, next) => { req.body ??= {}; next(); });

/* ---------------- dos dominios, un mismo servidor ---------------- */

// Si ADMIN_HOST está definido (uno o varios dominios separados por coma), ese dominio sirve SOLO el panel de
// administración (/admin, /api/admin y el login) y cualquier otro dominio sirve SOLO el sitio público: en el dominio
// público /admin y /api/admin no existen. Sin ADMIN_HOST (desarrollo local) un único dominio sirve todo.
// No es la barrera de seguridad —la API de admin igual exige sesión y is_admin—, sino que cada dominio muestre lo suyo.
const ADMIN_HOSTS = new Set((process.env.ADMIN_HOST || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean));
const ADMIN_ONLY_PATH = /^\/(admin|api\/admin)(\/|$)/;
const ADMIN_HOST_ALLOWED_PATH = /^\/(admin|api\/admin)(\/|$)|^\/api\/auth\/(me|login|logout)$/;
app.use((req, res, next) => {
  if (!ADMIN_HOSTS.size) return next();
  if (ADMIN_HOSTS.has(req.hostname.toLowerCase())) {
    if (req.path === '/') return res.redirect('/admin');
    return ADMIN_HOST_ALLOWED_PATH.test(req.path) ? next() : res.status(404).json({ error: 'not_found' });
  }
  return ADMIN_ONLY_PATH.test(req.path) ? res.status(404).json({ error: 'not_found' }) : next();
});

const authLimiter = rateLimit({ name: 'auth', windowMs: 10 * 60 * 1000, max: 8 });
const writeLimiter = rateLimit({ name: 'write', windowMs: 10 * 60 * 1000, max: 40, keyFn: req => (req.user ? 'u:' + req.user.id : req.ip) });

function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    email: u.email || null,
    joined: u.joined_at,
    favoriteGameId: u.favorite_game_id || null,
    wishlist: JSON.parse(u.wishlist || '[]'),
    activityDates: JSON.parse(u.activity_dates || '[]'),
    isAdmin: !!u.is_admin,
    avatarUrl: u.avatar_url || null,
    bio: u.bio || null,
    socialLinks: JSON.parse(u.social_links || '{}'),
  };
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOCIAL_LINK_KEYS = ['instagram', 'facebook', 'x', 'youtube', 'steam', 'epic', 'playstation', 'xbox', 'nintendo'];
function isSafeHttpUrl(val) {
  try {
    const u = new URL(val);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
function isValidEmail(val) {
  return typeof val === 'string' && val.length <= 254 && EMAIL_RE.test(val);
}
// New accounts are held to this bar; users grandfathered in from the old
// 4-digit PIN system are never forced to meet it to keep logging in.
function isStrongPassword(val) {
  return typeof val === 'string' && val.length >= 8 && val.length <= 200 && /[a-zA-Z]/.test(val) && /[0-9]/.test(val);
}
function sanitizeSocialLinks(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of SOCIAL_LINK_KEYS) {
    const val = input[key];
    if (val && typeof val === 'string' && val.trim()) {
      const trimmed = val.trim().slice(0, 200);
      if (isSafeHttpUrl(trimmed)) out[key] = trimmed;
    }
  }
  return out;
}

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

/* ---------------- validación compartida de entradas ---------------- */

const MAX_REVIEW_TEXT = 600; // mismo tope que el maxlength del textarea del cliente
const KNOWN_PLATFORMS = new Set(['steam', 'epic', 'psn', 'xbox', 'switch']);
// Fecha YYYY-MM-DD válida y a ≤3 días de hoy (margen para husos horarios). Sin este tope, un usuario podía
// crear filas / entradas de historial ilimitadas mandando fechas inventadas.
function isPlausibleDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Math.abs(Date.parse(s + 'T00:00:00Z') - Date.now()) <= 3 * 86400000;
}
// Devuelve el código de error de una reseña inválida (juego o personaje), o null si está bien.
// platforms es undefined en las reseñas de personaje (no tienen plataformas).
function validateReview(rating, text, platforms) {
  if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) return 'invalid_rating';
  if (typeof text !== 'string' || text.length > MAX_REVIEW_TEXT) return 'invalid_text';
  if (platforms !== undefined && !(Array.isArray(platforms) && platforms.every(p => KNOWN_PLATFORMS.has(p)))) return 'invalid_platforms';
  return null;
}

/* ---------------- auth ---------------- */

const findUserByNameCI = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)');
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare('INSERT INTO users (username, email, pin_hash, joined_at, bio, social_links) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
const setPasswordHash = db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?');

app.get('/api/auth/me', async (req, res) => {
  res.json({ user: publicUser(await currentUser(req)) });
});

// Registration now happens in two client-side steps (email+password, then
// profile details), but lands here as a single call once both are complete.
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const username = String(b.username || '').trim();
  const bio = typeof b.bio === 'string' ? b.bio.trim().slice(0, 500) : null;

  // La casilla de los Términos y la Política de privacidad (y de tener 13 años o más) es obligatoria también para quien llame a la API directo.
  if (b.acceptTerms !== true) return res.status(400).json({ error: 'terms_required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'weak_password' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (await findUserByEmail.get(email)) return res.status(409).json({ error: 'email_taken' });
  if (await findUserByNameCI.get(username)) return res.status(409).json({ error: 'username_taken' });

  const socialLinks = sanitizeSocialLinks(b.socialLinks);
  const joinedAt = new Date().toISOString();
  let created;
  try {
    created = await insertUser.get(username, email, hashPin(password), joinedAt, bio, JSON.stringify(socialLinks));
  } catch (e) {
    // Dos registros simultáneos con el mismo email/usuario: el índice único de la base gana la carrera.
    if (e.code === '23505') return res.status(409).json({ error: /email/.test(e.constraint || '') ? 'email_taken' : 'username_taken' });
    throw e;
  }
  const { token, expires } = await createSession(created.id);
  setSessionCookie(res, token, expires);
  res.json({ user: publicUser(await findUserByNameCI.get(username)) });
});

// Accepts an email (new accounts) or a username (accounts grandfathered in
// from the old PIN system, who are never forced to add an email or change
// their PIN) as the identifier; the credential is checked the same way either way.
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  const user = identifier.includes('@')
    ? await findUserByEmail.get(identifier.toLowerCase())
    : await findUserByNameCI.get(identifier);
  if (!user || !verifyPin(password, user.pin_hash)) return res.status(401).json({ error: 'bad_login' });

  const { token, expires } = await createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json({ user: publicUser(user) });
});

app.post('/api/account/password', requireAuth, writeLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!verifyPin(currentPassword, req.user.pin_hash)) return res.status(401).json({ error: 'bad_current_password' });
  if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'weak_password' });
  await setPasswordHash.run(hashPin(newPassword), req.user.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) deleteSession.run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* ---------------- games (custom, user-submitted) ---------------- */

// id al final: los juegos del catálogo base comparten created_at, y sin desempate Postgres puede devolverlos en cualquier orden.
const listVisibleGames = db.prepare('SELECT * FROM games WHERE hidden = 0 ORDER BY builtin DESC, created_at ASC, id ASC');
const findGameById = db.prepare('SELECT * FROM games WHERE id = ?');

function shapeGame(g) {
  return {
    id: g.id, title: g.title, genre: g.genre, genres: JSON.parse(g.genres || '[]'), platforms: JSON.parse(g.platforms), addedBy: g.added_by,
    coverUrl: g.cover_url || null, cardCoverUrl: g.card_cover_url || null, description: g.description || null,
    developer: g.developer || null, publisher: g.publisher || null,
    releaseYear: g.release_year || null, gameMode: g.game_mode || null,
    storeLinks: JSON.parse(g.store_links || '{}'),
    isNewRelease: !!g.is_new_release, newReleaseDate: g.new_release_date || null,
  };
}

app.get('/api/games', async (req, res) => {
  res.json({ games: (await listVisibleGames.all()).map(shapeGame) });
});

/* ---------------- characters (iconic/protagonist ratings, custom) ---------------- */

const listVisibleCharacters = db.prepare('SELECT * FROM characters WHERE hidden = 0 ORDER BY created_at ASC, id ASC');
const findCharacterById = db.prepare('SELECT * FROM characters WHERE id = ?');

function shapeCharacter(c) {
  const gameIds = JSON.parse(c.game_ids || '[]');
  return {
    id: c.id, name: c.name, gameIds, gameId: gameIds[0] || null,
    bannerUrl: c.banner_url || null, bannerGameId: c.banner_game_id || null,
    photoUrl: c.photo_url || null, categories: JSON.parse(c.categories || '[]'),
    description: c.description || null, addedBy: c.added_by, createdAt: c.created_at,
  };
}

// Mismas claves que CHARACTER_CATEGORIES de admin.js (y que CHAR_CATEGORIES del frontend).
const CHARACTER_CATEGORIES = ['protagonist', 'coprotagonist', 'villain', 'ally', 'secondary'];
const normalizeCategories = input => (Array.isArray(input) ? [...new Set(input.filter(k => CHARACTER_CATEGORIES.includes(k)))] : []);

app.get('/api/characters', async (req, res) => {
  res.json({ characters: (await listVisibleCharacters.all()).map(shapeCharacter) });
});

/* ---------------- game suggestions (footer form -> admin inbox) ---------------- */

// La misma tabla guarda sugerencias de juegos (kind='game') y de personajes (kind='character'): en las de personaje,
// title es el nombre del personaje, related_game el juego (texto libre) y categories una lista de CHARACTER_CATEGORIES.
const insertSuggestion = db.prepare(`
  INSERT INTO game_suggestions (id, title, platforms, genre, release_year, note, submitted_by, status, created_at, kind, related_game, categories)
  VALUES (@id, @title, @platforms, @genre, @release_year, @note, @submitted_by, 'unread', @created_at, @kind, @related_game, @categories)
`);

app.post('/api/suggestions', writeLimiter, async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (title.length < 2) return res.status(400).json({ error: 'title_too_short' });
  const user = await currentUser(req);
  const id = 'sg-' + crypto.randomBytes(8).toString('hex');
  const isCharacter = b.kind === 'character';
  await insertSuggestion.run({
    id, title: title.slice(0, 80),
    platforms: JSON.stringify(Array.isArray(b.platforms) ? b.platforms : []),
    genre: b.genre ? String(b.genre) : null,
    release_year: b.releaseYear ? Number(b.releaseYear) : null,
    note: b.note ? String(b.note).slice(0, 500) : null,
    submitted_by: user ? user.username : null,
    created_at: new Date().toISOString(),
    kind: isCharacter ? 'character' : 'game',
    related_game: isCharacter && b.relatedGame ? String(b.relatedGame).slice(0, 80) : null,
    categories: JSON.stringify(isCharacter ? normalizeCategories(b.categories) : []),
  });
  res.json({ ok: true });
});

/* ---------------- reviews ---------------- */

const listReviewsWithVotes = db.prepare(`
  SELECT r.id, r.game_id AS "gameId", u.username, r.rating, r.text, r.platforms, r.updated_at AS date,
    COALESCE((SELECT json_agg(hv_user.username)::text FROM helpful_votes hv
       JOIN users hv_user ON hv_user.id = hv.user_id WHERE hv.review_id = r.id), '[]') AS "helpfulByJson"
  FROM reviews r JOIN users u ON u.id = r.user_id
  ORDER BY r.updated_at DESC, r.id ASC
`);
const findReviewByGameAndUser = db.prepare('SELECT * FROM reviews WHERE game_id = ? AND user_id = ?');
const findReviewById = db.prepare('SELECT * FROM reviews WHERE id = ?');
const insertReview = db.prepare('INSERT INTO reviews (id, game_id, user_id, rating, text, platforms, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const updateReview = db.prepare('UPDATE reviews SET rating = ?, text = ?, platforms = ?, updated_at = ? WHERE id = ?');
const deleteReviewById = db.prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?');
const toggleVoteInsert = db.prepare('INSERT INTO helpful_votes (review_id, user_id) VALUES (?, ?)');
const toggleVoteDelete = db.prepare('DELETE FROM helpful_votes WHERE review_id = ? AND user_id = ?');
const findVote = db.prepare('SELECT 1 FROM helpful_votes WHERE review_id = ? AND user_id = ?');

function shapeReviewRow(r) {
  return {
    id: r.id, gameId: r.gameId, username: r.username, rating: r.rating,
    text: r.text, platforms: JSON.parse(r.platforms), date: r.date,
    helpfulBy: JSON.parse(r.helpfulByJson || '[]').filter(Boolean),
  };
}

app.get('/api/reviews', async (req, res) => {
  res.json({ reviews: (await listReviewsWithVotes.all()).map(shapeReviewRow) });
});

app.put('/api/reviews/:gameId', requireAuth, writeLimiter, async (req, res) => {
  const { gameId } = req.params;
  if (!await findGameById.get(gameId)) return res.status(404).json({ error: 'game_not_found' });
  const existing = await findReviewByGameAndUser.get(gameId, req.user.id);
  const now = new Date().toISOString();

  const b = req.body || {};
  const rating = 'rating' in b ? b.rating : (existing ? existing.rating : null);
  const text = 'text' in b ? b.text : (existing ? existing.text : '');
  const platforms = 'platforms' in b ? b.platforms : (existing ? JSON.parse(existing.platforms) : []);
  const invalid = validateReview(rating, text, platforms);
  if (invalid) return res.status(400).json({ error: invalid });
  const isEmpty = rating == null && !text.trim() && platforms.length === 0;

  if (existing) {
    if (isEmpty) {
      await deleteReviewById.run(existing.id, req.user.id);
      return res.json({ id: existing.id, deleted: true });
    }
    await updateReview.run(rating, text, JSON.stringify(platforms), now, existing.id);
    return res.json({ id: existing.id });
  }
  if (isEmpty) return res.json({ id: null });
  const id = uid();
  await insertReview.run(id, gameId, req.user.id, rating, text, JSON.stringify(platforms), now);
  res.json({ id });
});

app.delete('/api/reviews/:gameId/text', requireAuth, async (req, res) => {
  const { gameId } = req.params;
  const existing = await findReviewByGameAndUser.get(gameId, req.user.id);
  if (!existing) return res.json({ deleted: true });

  const platforms = JSON.parse(existing.platforms);
  const isEmpty = existing.rating == null && platforms.length === 0;
  if (isEmpty) {
    await deleteReviewById.run(existing.id, req.user.id);
    return res.json({ deleted: true });
  }
  await updateReview.run(existing.rating, '', existing.platforms, new Date().toISOString(), existing.id);
  res.json({ deleted: false });
});

app.delete('/api/reviews/:gameId/rating', requireAuth, async (req, res) => {
  const { gameId } = req.params;
  const existing = await findReviewByGameAndUser.get(gameId, req.user.id);
  if (!existing) return res.json({ deleted: true });

  const platforms = JSON.parse(existing.platforms);
  const isEmpty = (!existing.text || !existing.text.trim()) && platforms.length === 0;
  if (isEmpty) {
    await deleteReviewById.run(existing.id, req.user.id);
    return res.json({ deleted: true });
  }
  await updateReview.run(null, existing.text, existing.platforms, new Date().toISOString(), existing.id);
  res.json({ deleted: false });
});

app.delete('/api/reviews/id/:id', requireAuth, async (req, res) => {
  await deleteReviewById.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/reviews/id/:id/helpful', requireAuth, async (req, res) => {
  const review = await findReviewById.get(req.params.id);
  if (!review) return res.status(404).json({ error: 'not_found' });
  if (review.user_id === req.user.id) return res.status(400).json({ error: 'own_review' });

  if (await findVote.get(review.id, req.user.id)) {
    await toggleVoteDelete.run(review.id, req.user.id);
  } else {
    await toggleVoteInsert.run(review.id, req.user.id);
    await insertNotification.run(uid(), review.user_id, 'helpful', req.user.id, review.game_id, new Date().toISOString());
  }

  const row = (await listReviewsWithVotes.all()).find(r => r.id === review.id);
  res.json({ helpfulBy: JSON.parse(row.helpfulByJson || '[]').filter(Boolean) });
});

/* ---------------- character reviews (separate from game reviews) ---------------- */

const listCharacterReviews = db.prepare(`
  SELECT cr.id, cr.character_id AS "characterId", u.username, cr.rating, cr.text, cr.updated_at AS date
  FROM character_reviews cr JOIN users u ON u.id = cr.user_id
  ORDER BY cr.updated_at DESC, cr.id ASC
`);
const findCharReviewByCharAndUser = db.prepare('SELECT * FROM character_reviews WHERE character_id = ? AND user_id = ?');
const insertCharReview = db.prepare('INSERT INTO character_reviews (id, character_id, user_id, rating, text, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const updateCharReview = db.prepare('UPDATE character_reviews SET rating = ?, text = ?, updated_at = ? WHERE id = ?');
const deleteCharReviewById = db.prepare('DELETE FROM character_reviews WHERE id = ? AND user_id = ?');

function shapeCharReviewRow(r) {
  return { id: r.id, characterId: r.characterId, username: r.username, rating: r.rating, text: r.text, date: r.date };
}

app.get('/api/character-reviews', async (req, res) => {
  res.json({ characterReviews: (await listCharacterReviews.all()).map(shapeCharReviewRow) });
});

app.put('/api/character-reviews/:characterId', requireAuth, writeLimiter, async (req, res) => {
  const { characterId } = req.params;
  const character = await findCharacterById.get(characterId);
  if (!character || character.hidden) return res.status(404).json({ error: 'character_not_found' });
  const existing = await findCharReviewByCharAndUser.get(characterId, req.user.id);
  const now = new Date().toISOString();

  const b = req.body || {};
  const rating = 'rating' in b ? b.rating : (existing ? existing.rating : null);
  const text = 'text' in b ? b.text : (existing ? existing.text : '');
  const invalid = validateReview(rating, text);
  if (invalid) return res.status(400).json({ error: invalid });
  const isEmpty = rating == null && !text.trim();

  if (existing) {
    if (isEmpty) {
      await deleteCharReviewById.run(existing.id, req.user.id);
      return res.json({ id: existing.id, deleted: true });
    }
    await updateCharReview.run(rating, text, now, existing.id);
    return res.json({ id: existing.id });
  }
  if (isEmpty) return res.json({ id: null });
  const id = uid();
  await insertCharReview.run(id, characterId, req.user.id, rating, text, now);
  res.json({ id });
});

app.delete('/api/character-reviews/:characterId/text', requireAuth, async (req, res) => {
  const { characterId } = req.params;
  const existing = await findCharReviewByCharAndUser.get(characterId, req.user.id);
  if (!existing) return res.json({ deleted: true });

  if (existing.rating == null) {
    await deleteCharReviewById.run(existing.id, req.user.id);
    return res.json({ deleted: true });
  }
  await updateCharReview.run(existing.rating, '', new Date().toISOString(), existing.id);
  res.json({ deleted: false });
});

app.delete('/api/character-reviews/:characterId/rating', requireAuth, async (req, res) => {
  const { characterId } = req.params;
  const existing = await findCharReviewByCharAndUser.get(characterId, req.user.id);
  if (!existing) return res.json({ deleted: true });

  if (!existing.text || !existing.text.trim()) {
    await deleteCharReviewById.run(existing.id, req.user.id);
    return res.json({ deleted: true });
  }
  await updateCharReview.run(null, existing.text, new Date().toISOString(), existing.id);
  res.json({ deleted: false });
});

app.delete('/api/character-reviews/id/:id', requireAuth, async (req, res) => {
  await deleteCharReviewById.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ---------------- daily challenge progress ---------------- */

const getDaily = db.prepare('SELECT * FROM daily_progress WHERE user_id = ? AND date = ?');
const upsertDaily = db.prepare(`
  INSERT INTO daily_progress (user_id, date, guesses, solved, failed, roulette_spins)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, date) DO UPDATE SET
    guesses = excluded.guesses, solved = excluded.solved,
    failed = excluded.failed, roulette_spins = excluded.roulette_spins
`);

function shapeDaily(row, date) {
  if (!row) return { date, guesses: [], solved: false, failed: false, rouletteSpins: 0 };
  return {
    date, guesses: JSON.parse(row.guesses), solved: !!row.solved,
    failed: !!row.failed, rouletteSpins: row.roulette_spins,
  };
}

app.get('/api/daily', requireAuth, async (req, res) => {
  const date = String(req.query.date || '');
  if (!date) return res.status(400).json({ error: 'missing_date' });
  if (!isPlausibleDate(date)) return res.status(400).json({ error: 'invalid_date' });
  res.json({ daily: shapeDaily(await getDaily.get(req.user.id, date), date) });
});

app.put('/api/daily', requireAuth, async (req, res) => {
  const { date, guesses, solved, failed, rouletteSpins } = req.body;
  if (!date) return res.status(400).json({ error: 'missing_date' });
  if (!isPlausibleDate(date)) return res.status(400).json({ error: 'invalid_date' });
  // 5 intentos como máximo por día y 3 tiradas de ruleta (MAX_SPINS en public/js/13-daily-challenge.js).
  const rawGuesses = guesses === undefined ? [] : guesses;
  if (!Array.isArray(rawGuesses) || rawGuesses.length > 5 || !rawGuesses.every(g => typeof g === 'string')) {
    return res.status(400).json({ error: 'invalid_guesses' });
  }
  const cleanGuesses = rawGuesses.map(g => g.slice(0, 100));
  const spins = rouletteSpins === undefined ? 0 : rouletteSpins;
  if (!Number.isInteger(spins) || spins < 0 || spins > 3) return res.status(400).json({ error: 'invalid_spins' });
  await upsertDaily.run(req.user.id, date, JSON.stringify(cleanGuesses), solved ? 1 : 0, failed ? 1 : 0, spins);
  res.json({ ok: true });
});

/* ---------------- profile (favorite game, wishlist, activity streak) ---------------- */

const setFavoriteGame = db.prepare('UPDATE users SET favorite_game_id = ? WHERE id = ?');
const setWishlist = db.prepare('UPDATE users SET wishlist = ? WHERE id = ?');
const setActivityDates = db.prepare('UPDATE users SET activity_dates = ? WHERE id = ?');

app.put('/api/profile/favorite', requireAuth, async (req, res) => {
  const gameId = req.body.gameId || null;
  if (gameId !== null && (typeof gameId !== 'string' || !await findGameById.get(gameId))) return res.status(400).json({ error: 'invalid_game' });
  await setFavoriteGame.run(gameId, req.user.id);
  res.json({ favoriteGameId: gameId });
});

app.post('/api/profile/wishlist/toggle', requireAuth, async (req, res) => {
  const gameId = req.body.gameId;
  if (typeof gameId !== 'string') return res.status(400).json({ error: 'invalid_game' });
  const wishlist = JSON.parse(req.user.wishlist || '[]');
  const idx = wishlist.indexOf(gameId);
  // Quitar siempre se permite (aunque el juego ya no exista); agregar solo juegos reales.
  if (idx >= 0) wishlist.splice(idx, 1);
  else if (await findGameById.get(gameId)) wishlist.push(gameId);
  else return res.status(400).json({ error: 'invalid_game' });
  await setWishlist.run(JSON.stringify(wishlist), req.user.id);
  res.json({ wishlist });
});

app.post('/api/profile/activity', requireAuth, async (req, res) => {
  const dateStr = req.body.date;
  if (!dateStr) return res.status(400).json({ error: 'missing_date' });
  if (!isPlausibleDate(dateStr)) return res.status(400).json({ error: 'invalid_date' });
  const dates = JSON.parse(req.user.activity_dates || '[]');
  if (!dates.includes(dateStr)) {
    dates.push(dateStr);
    await setActivityDates.run(JSON.stringify(dates), req.user.id);
  }
  res.json({ activityDates: dates });
});

/* ---------------- public profiles, editing, follows ---------------- */

const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const updateProfile = db.prepare('UPDATE users SET username = ?, email = ?, bio = ?, social_links = ? WHERE id = ?');
const setAvatarUrl = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');
const countReviewsForUser = db.prepare('SELECT COUNT(*) as n, AVG(rating) as avg FROM reviews WHERE user_id = ? AND rating IS NOT NULL');
const findFollow = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?');
const insertFollow = db.prepare('INSERT INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)');
const deleteFollow = db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?');
const countFollowers = db.prepare('SELECT COUNT(*) as n FROM follows WHERE followed_id = ?');
const countFollowing = db.prepare('SELECT COUNT(*) as n FROM follows WHERE follower_id = ?');

async function shapePublicProfile(u, viewer) {
  const { n: reviewCount, avg } = await countReviewsForUser.get(u.id);
  const isFollowing = !!(viewer && viewer.id !== u.id && await findFollow.get(viewer.id, u.id));
  const isFriend = !!(viewer && viewer.id !== u.id && await findFollow.get(viewer.id, u.id) && await findFollow.get(u.id, viewer.id));
  return {
    username: u.username, joined: u.joined_at, favoriteGameId: u.favorite_game_id || null,
    isAdmin: !!u.is_admin, bio: u.bio || null, avatarUrl: u.avatar_url || null,
    socialLinks: JSON.parse(u.social_links || '{}'),
    reviewCount, avgRating: avg || null,
    followerCount: (await countFollowers.get(u.id)).n, followingCount: (await countFollowing.get(u.id)).n,
    isFollowing, isFriend,
  };
}

app.get('/api/users/:username', async (req, res) => {
  const user = await findUserByNameCI.get(req.params.username);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user: await shapePublicProfile(user, await currentUser(req)) });
});

app.put('/api/profile', requireAuth, writeLimiter, async (req, res) => {
  const b = req.body || {};
  let username = req.user.username;
  if (typeof b.username === 'string') {
    const newName = b.username.trim();
    if (newName !== req.user.username) {
      if (!USERNAME_RE.test(newName)) return res.status(400).json({ error: 'invalid_username' });
      const existing = await findUserByNameCI.get(newName);
      if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'username_taken' });
      username = newName;
    }
  }
  let email = req.user.email || null;
  if (typeof b.email === 'string') {
    const newEmail = b.email.trim().toLowerCase();
    if (newEmail !== (req.user.email || '')) {
      if (!isValidEmail(newEmail)) return res.status(400).json({ error: 'invalid_email' });
      const existing = await findUserByEmail.get(newEmail);
      if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'email_taken' });
      email = newEmail;
    }
  }
  const bio = typeof b.bio === 'string' ? b.bio.trim().slice(0, 500) : (req.user.bio || null);
  const socialLinks = (b.socialLinks && typeof b.socialLinks === 'object')
    ? sanitizeSocialLinks(b.socialLinks)
    : JSON.parse(req.user.social_links || '{}');
  try {
    await updateProfile.run(username, email, bio, JSON.stringify(socialLinks), req.user.id);
  } catch (e) {
    return res.status(409).json({ error: 'username_taken' });
  }
  res.json({ user: publicUser(await findUserById.get(req.user.id)) });
});

const avatarUploadLimiter = rateLimit({ name: 'avatar', windowMs: 10 * 60 * 1000, max: 10, keyFn: req => 'u:' + req.user.id });

app.post('/api/profile/avatar', requireAuth, avatarUploadLimiter, async (req, res) => {
  let file;
  try { file = await receiveImage(req, res); }
  catch (e) { return res.status(400).json({ error: 'upload_failed' }); }
  if (!file) return res.status(400).json({ error: 'invalid_file' });
  await setAvatarUrl.run(await saveImage(file), req.user.id);
  res.json({ user: publicUser(await findUserById.get(req.user.id)) });
});

app.post('/api/users/:username/follow', requireAuth, writeLimiter, async (req, res) => {
  const target = await findUserByNameCI.get(req.params.username);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_follow_self' });
  if (await findFollow.get(req.user.id, target.id)) {
    await deleteFollow.run(req.user.id, target.id);
  } else {
    await insertFollow.run(req.user.id, target.id, new Date().toISOString());
    await insertNotification.run(uid(), target.id, 'follow', req.user.id, null, new Date().toISOString());
  }
  const isFollowing = !!await findFollow.get(req.user.id, target.id);
  const isFriend = isFollowing && !!await findFollow.get(target.id, req.user.id);
  res.json({ isFollowing, isFriend, followerCount: (await countFollowers.get(target.id)).n });
});

/* ---------------- notifications ---------------- */

const insertNotification = db.prepare('INSERT INTO notifications (id, user_id, type, actor_user_id, game_id, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)');
const listNotifications = db.prepare(`
  SELECT n.id, n.type, n.game_id, n.read, n.created_at, u.username AS actor_username
  FROM notifications n
  JOIN users u ON u.id = n.actor_user_id
  WHERE n.user_id = ?
  ORDER BY n.created_at DESC
  LIMIT 50
`);
const markAllNotificationsRead = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0');

app.get('/api/notifications', requireAuth, async (req, res) => {
  const rows = await listNotifications.all(req.user.id);
  res.json({
    notifications: rows.map(r => ({
      id: r.id,
      type: r.type,
      actorUsername: r.actor_username,
      gameId: r.game_id,
      read: !!r.read,
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/notifications/read', requireAuth, writeLimiter, async (req, res) => {
  await markAllNotificationsRead.run(req.user.id);
  res.json({ ok: true });
});

/* ---------------- game lists ---------------- */

const insertList = db.prepare('INSERT INTO game_lists (id, user_id, title, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const findListById = db.prepare('SELECT * FROM game_lists WHERE id = ?');
const listsForUser = db.prepare('SELECT * FROM game_lists WHERE user_id = ? ORDER BY created_at ASC');
const publicListsForUser = db.prepare('SELECT * FROM game_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at ASC');
const updateListMeta = db.prepare('UPDATE game_lists SET title = ?, is_public = ?, updated_at = ? WHERE id = ?');
const deleteListStmt = db.prepare('DELETE FROM game_lists WHERE id = ?');
const itemsForList = db.prepare('SELECT game_id, added_at FROM game_list_items WHERE list_id = ? ORDER BY added_at ASC');
const findListItem = db.prepare('SELECT 1 FROM game_list_items WHERE list_id = ? AND game_id = ?');
const insertListItem = db.prepare('INSERT INTO game_list_items (list_id, game_id, added_at) VALUES (?, ?, ?)');
const deleteListItem = db.prepare('DELETE FROM game_list_items WHERE list_id = ? AND game_id = ?');

async function shapeList(l) {
  const items = await itemsForList.all(l.id);
  return {
    id: l.id, title: l.title, isPublic: !!l.is_public,
    createdAt: l.created_at, updatedAt: l.updated_at,
    gameIds: items.map(i => i.game_id),
  };
}

app.get('/api/lists/mine', requireAuth, async (req, res) => {
  res.json({ lists: await Promise.all((await listsForUser.all(req.user.id)).map(shapeList)) });
});

app.get('/api/users/:username/lists', async (req, res) => {
  const user = await findUserByNameCI.get(req.params.username);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ lists: await Promise.all((await publicListsForUser.all(user.id)).map(shapeList)) });
});

app.post('/api/lists', requireAuth, writeLimiter, async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim().slice(0, 60);
  if (title.length < 1) return res.status(400).json({ error: 'title_required' });
  const isPublic = req.body && req.body.isPublic === false ? 0 : 1;
  const id = 'list-' + uid();
  const now = new Date().toISOString();
  await insertList.run(id, req.user.id, title, isPublic, now, now);
  res.json({ list: await shapeList(await findListById.get(id)) });
});

app.put('/api/lists/:id', requireAuth, writeLimiter, async (req, res) => {
  const list = await findListById.get(req.params.id);
  if (!list) return res.status(404).json({ error: 'not_found' });
  if (list.user_id !== req.user.id) return res.status(403).json({ error: 'not_owner' });
  const b = req.body || {};
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 60) || list.title : list.title;
  const isPublic = typeof b.isPublic === 'boolean' ? (b.isPublic ? 1 : 0) : list.is_public;
  await updateListMeta.run(title, isPublic, new Date().toISOString(), list.id);
  res.json({ list: await shapeList(await findListById.get(list.id)) });
});

app.delete('/api/lists/:id', requireAuth, writeLimiter, async (req, res) => {
  const list = await findListById.get(req.params.id);
  if (!list) return res.status(404).json({ error: 'not_found' });
  if (list.user_id !== req.user.id) return res.status(403).json({ error: 'not_owner' });
  await deleteListStmt.run(list.id);
  res.json({ ok: true });
});

app.post('/api/lists/:id/items/toggle', requireAuth, writeLimiter, async (req, res) => {
  const list = await findListById.get(req.params.id);
  if (!list) return res.status(404).json({ error: 'not_found' });
  if (list.user_id !== req.user.id) return res.status(403).json({ error: 'not_owner' });
  const gameId = req.body && req.body.gameId;
  if (!gameId || typeof gameId !== 'string') return res.status(400).json({ error: 'missing_game_id' });
  if (await findListItem.get(list.id, gameId)) await deleteListItem.run(list.id, gameId);
  else if (await findGameById.get(gameId)) await insertListItem.run(list.id, gameId, new Date().toISOString());
  else return res.status(400).json({ error: 'invalid_game' });
  await updateListMeta.run(list.title, list.is_public, new Date().toISOString(), list.id);
  res.json({ list: await shapeList(await findListById.get(list.id)) });
});

/* ---------------- cover art (best-effort, via Steam's public search, cached) ---------------- */

const COVER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const getCover = db.prepare('SELECT * FROM game_covers WHERE title_key = ?');
const upsertCover = db.prepare(`
  INSERT INTO game_covers (title_key, image_url, fetched_at) VALUES (?, ?, ?)
  ON CONFLICT(title_key) DO UPDATE SET image_url = excluded.image_url, fetched_at = excluded.fetched_at
`);

const OUTBOUND_TIMEOUT_MS = 5000;

// Lanza si Steam falla (o responde que no): así resolveCoverUrl puede distinguir "error, reintentar luego" de "no hay portada".
async function searchSteamApps(term) {
  const res = await fetch('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(term) + '&l=english&cc=us', { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (!res.ok) throw new Error('steam_' + res.status);
  const data = await res.json();
  return (data.items || []).filter(it => it.type === 'app');
}

// The store search often ranks a DLC, soundtrack, crossover item or sequel above
// the base game (e.g. "Death Stranding" -> "Death Stranding 2" first). Score each
// candidate instead of trusting result order: a real base game almost always
// carries a metascore (addons/unreleased titles usually don't yet), and its name
// tends to match the searched title exactly or as a prefix rather than being a
// much longer variant/spinoff name.
function pickBestSteamMatch(candidates, title) {
  if (!candidates.length) return null;
  const norm = s => s.toLowerCase().replace(/[™®]/g, '').replace(/\s+/g, ' ').trim();
  const t = norm(title);
  const score = it => {
    const name = norm(it.name);
    let s = it.metascore ? 0 : 4;
    s += name === t ? 0 : (name.startsWith(t) || t.startsWith(name)) ? 1 : 3;
    return s;
  };
  return candidates.reduce((best, it) => (score(it) < score(best) ? it : best));
}

async function resolveCoverUrl(title) {
  try {
    const candidates = await searchSteamApps(title);
    // A trailing "(Remake)", "(2023)", etc. can pull in an unrelated crossover
    // item as the only hit — always also try the plain title and merge results,
    // rather than only falling back when the first search comes up empty.
    const stripped = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (stripped && stripped !== title) candidates.push(...await searchSteamApps(stripped));
    const match = pickBestSteamMatch(candidates, title);
    if (!match) return null;
    // Prefer the store search's own image over guessing a legacy /header.jpg
    // path, which 404s for newly-listed or unreleased apps.
    return match.tiny_image || `https://cdn.akamai.steamstatic.com/steam/apps/${match.id}/header.jpg`;
  } catch (e) {
    return undefined; // error transitorio (Steam caído/lento): no es lo mismo que "no hay portada" (null) y no se cachea
  }
}

// Portada de un juego: de la caché si está fresca; si no, la busca en Steam y la guarda (los errores transitorios no se guardan).
async function getCoverUrl(title) {
  const key = title.toLowerCase();
  const cached = await getCover.get(key);
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < COVER_TTL_MS) return cached.image_url;
  const url = await resolveCoverUrl(title);
  if (url === undefined) return cached ? cached.image_url : null;
  await upsertCover.run(key, url, new Date().toISOString());
  return url;
}

const isKnownGameTitle = db.prepare('SELECT 1 FROM games WHERE lower(title) = lower(?) LIMIT 1');

app.get('/api/cover', async (req, res) => {
  const title = String(req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'missing_title' });
  // Solo títulos del catálogo: si no, cualquiera podía disparar búsquedas ilimitadas a Steam y llenar la caché de basura.
  if (title.length > 120 || !await isKnownGameTitle.get(title)) return res.json({ url: null });
  res.json({ url: await getCoverUrl(title) });
});

/* ---------------- cover image proxy (avoids canvas CORS-tainting) ---------------- */

const COVER_PROXY_ALLOWED_HOSTS = new Set([
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
]);
// Las portadas y fotos subidas viven en Vercel Blob (un subdominio por tienda): también pasan por el proxy para poder
// dibujarlas en el canvas de la tarjeta de compartir sin "tainted canvas".
const isProxyHostAllowed = host => COVER_PROXY_ALLOWED_HOSTS.has(host) || host.endsWith('.public.blob.vercel-storage.com');

app.get('/api/image-proxy', async (req, res) => {
  let target;
  try { target = new URL(String(req.query.url || '')); }
  catch (e) { return res.status(400).json({ error: 'invalid_url' }); }
  if (target.protocol !== 'https:' || !isProxyHostAllowed(target.hostname)) {
    return res.status(400).json({ error: 'host_not_allowed' });
  }
  try {
    const upstream = await fetch(target.href, { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
    if (!upstream.ok || !upstream.body) return res.status(404).json({ error: 'not_found' });
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'not_an_image' });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'proxy_fetch_failed' });
  }
});

/* ---------------- date calendar + news (public reads) ---------------- */

const listDateEvents = db.prepare('SELECT * FROM date_events ORDER BY month ASC, day ASC, id ASC');
const listNewsItems = db.prepare('SELECT * FROM news_items ORDER BY created_at DESC, id ASC');

function shapeDateEvent(e) {
  return {
    id: e.id, month: e.month, day: e.day, gameId: e.game_id || null,
    es: { title: e.title_es, desc: e.desc_es }, en: { title: e.title_en, desc: e.desc_en },
  };
}
function shapeNewsItem(n) {
  return { id: n.id, title: n.title, summary: n.summary, source: n.source, url: n.url, color: n.color, initials: n.initials };
}

app.get('/api/date-events', async (req, res) => {
  res.json({ dateEvents: (await listDateEvents.all()).map(shapeDateEvent) });
});
app.get('/api/news', async (req, res) => {
  res.json({ news: (await listNewsItems.all()).map(shapeNewsItem) });
});

/* ---------------- pretty routes + per-game Open Graph tags ---------------- */

const publicDir = path.join(__dirname, '..', 'public');
// El HTML de la página vive en server/views/, fuera de public/: Vercel sirve public/ directo desde su CDN, sin pasar por el filtro de
// dominios, y todas las páginas (también la raíz) tienen que pasar por el servidor para que cada dominio muestre solo lo suyo.
const indexPath = path.join(__dirname, 'views', 'index.html');
function getIndexTemplate() { return fs.readFileSync(indexPath, 'utf8'); }
const avgRatingForGame = db.prepare('SELECT AVG(rating) as avg, COUNT(rating) as n FROM reviews WHERE game_id = ? AND rating IS NOT NULL');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function findAnyGame(id) {
  const row = await findGameById.get(id);
  return row ? shapeGame(row) : null;
}
const avgRatingForCharacter = db.prepare('SELECT AVG(rating) as avg, COUNT(rating) as n FROM character_reviews WHERE character_id = ? AND rating IS NOT NULL');
async function findAnyCharacter(id) {
  const row = await findCharacterById.get(id);
  return row ? shapeCharacter(row) : null;
}

function renderIndexWithMeta({ title, description, image, url }) {
  let html = getIndexTemplate();
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  let extra = `<meta property="og:url" content="${escapeHtml(url)}">`;
  if (image) extra += `\n<meta property="og:image" content="${escapeHtml(image)}">\n<meta name="twitter:card" content="summary_large_image">`;
  html = html.replace('<meta property="og:type" content="website">', `<meta property="og:type" content="website">\n${extra}`);
  return html;
}

app.get('/juego/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const game = await findAnyGame(req.params.id);
  if (!game) return res.type('html').send(getIndexTemplate());

  const { avg, n } = await avgRatingForGame.get(game.id);
  const genreLabel = (game.genres && game.genres[0]) || game.genre;
  const description = n > 0
    ? `${genreLabel} — calificado ${avg.toFixed(1)}/10 por ${n} reseña${n === 1 ? '' : 's'} en DLCritic.`
    : `${genreLabel} — sé el primero en calificar ${game.title} en DLCritic.`;
  const image = await getCoverUrl(game.title).catch(() => null);
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  res.type('html').send(renderIndexWithMeta({ title: `${game.title} — DLCritic`, description, image, url }));
});

app.get('/personaje/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const character = await findAnyCharacter(req.params.id);
  if (!character) return res.type('html').send(getIndexTemplate());

  const { avg, n } = await avgRatingForCharacter.get(character.id);
  const games = (await Promise.all(character.gameIds.map(id => findGameById.get(id)))).filter(Boolean);
  const gamePrefix = games.length ? `${games.map(g => g.title).join(', ')} — ` : '';
  const description = n > 0
    ? `${gamePrefix}calificado ${avg.toFixed(1)}/10 por ${n} reseña${n === 1 ? '' : 's'} en DLCritic.`
    : `${gamePrefix}sé el primero en calificar a ${character.name} en DLCritic.`;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  res.type('html').send(renderIndexWithMeta({ title: `${character.name} — DLCritic`, description, image: character.bannerUrl || character.photoUrl, url }));
});

app.get('/usuario/:username', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const user = await findUserByNameCI.get(req.params.username);
  if (!user) return res.type('html').send(getIndexTemplate());

  const { n: reviewCount } = await countReviewsForUser.get(user.id);
  const description = reviewCount > 0
    ? `${reviewCount} reseña${reviewCount === 1 ? '' : 's'} en DLCritic.`
    : `Perfil de ${user.username} en DLCritic.`;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  res.type('html').send(renderIndexWithMeta({ title: `${user.username} — DLCritic`, description, image: user.avatar_url || null, url }));
});

['/', '/explorar', '/mi-estanteria', '/mis-listas', '/notificaciones', '/noticias', '/reto-del-dia', '/acerca-de', '/personajes', '/cuenta', '/ajustes'].forEach(route => {
  app.get(route, (req, res) => res.set('Cache-Control', 'no-store').type('html').send(getIndexTemplate()));
});

// Términos y política de privacidad: un HTML por página, con español e inglés adentro (se elige en el navegador).
// Viven en server/views/ por el mismo motivo que index.html.
[['/terminos', 'terminos.html'], ['/privacidad', 'privacidad.html']].forEach(([route, file]) => {
  app.get(route, (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(__dirname, 'views', file)));
});

/* ---------------- admin dashboard ---------------- */

// El panel vive en admin-ui/, fuera de public/: Vercel sirve public/ directo desde su CDN, sin pasar por el filtro de
// dominios de arriba, y acá queremos que solo salga en el dominio del dashboard.
const adminUiDir = path.join(__dirname, '..', 'admin-ui');
app.use('/api/admin', require('./admin'));
app.get('/admin', (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(adminUiDir, 'admin.html')));
app.use('/admin/assets', express.static(path.join(adminUiDir, 'assets')));

/* ---------------- static frontend ---------------- */

app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store');
  },
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Último manejador: sin esto Express devolvía una página HTML con el stack trace (rutas internas incluidas) ante
// un JSON mal formado o cualquier excepción.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// En Vercel la app se exporta y la plataforma se encarga de escuchar; en local (node server/index.js) escucha acá.
module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 8793;
  app.listen(PORT, () => console.log(`DLCritic server listening on http://localhost:${PORT}`));
}
