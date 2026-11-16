// Racha de días en el servidor. La cuenta (días de gracia, mejor racha, metas) es la de public/js/streak-core.js: el MISMO archivo que usa el navegador, para que lo que se ve
// en pantalla y lo que decide el servidor no puedan diferir. Aquí van: registrar la actividad (mejor racha, última vez, aviso de meta), la racha que ven los demás (la llama junto
// al nombre) y los recordatorios por correo.
//
// Qué cuenta como actividad: calificar o reseñar un juego (cada vez que se guarda) y jugar el reto del día. Los días se guardan en users.activity_dates (los últimos MAX_STORED_DAYS)
// y, de antes de que esto existiera, también cuentan las fechas de las reseñas. «Hoy» es el de la persona: se usa el huso horario (tz_offset) que dejó en su última actividad.
const StreakCore = require('../public/js/streak-core.js');
const db = require('./db');

const { MILESTONES, GRACE } = StreakCore;
const MAX_STORED_DAYS = 800;
const PUBLIC_MIN_STREAK = 7; // desde cuántos días de racha se muestra la llama a los demás
const REMINDER_MIN_STREAK = 3; // con menos días de racha no se manda recordatorio
const HOUR = 3600 * 1000;
const REMINDER_AFTER_MS = 24 * HOUR; // el recordatorio sale a la misma hora de la última actividad, un día después...
const REMINDER_WINDOW_MS = 2 * HOUR; // ...dentro de un rango de 2 horas (si pasó ese rango, ya no se manda)
const REMINDER_MIN_GAP_MS = 20 * HOUR; // y nunca más de uno por día

const graceFor = u => (u.is_subscriber ? GRACE.subscriber : GRACE.member);
// Huso horario como lo da el navegador (new Date().getTimezoneOffset(): minutos que faltan para llegar a UTC); null si no es un valor razonable.
const parseOffset = v => { const n = Number(v); return v !== undefined && v !== '' && Number.isInteger(n) && Math.abs(n) <= 840 ? n : null; };
// La fecha «AAAA-MM-DD» que es en ese huso horario.
const localKey = (when, offsetMin) => new Date(new Date(when).getTime() - offsetMin * 60000).toISOString().slice(0, 10);

const reviewDates = db.prepare('SELECT updated_at FROM reviews WHERE user_id = ?');
const setActivity = db.prepare('UPDATE users SET activity_dates = ?, last_activity_at = ?, tz_offset = ?, best_streak = ? WHERE id = ?');

// Todos los días con actividad de una persona: los guardados más las fechas de sus reseñas (así cuenta también lo anterior a este sistema).
async function daysOf(user, offset) {
  const stored = JSON.parse(user.activity_dates || '[]');
  const fromReviews = (await reviewDates.all(user.id)).map(r => localKey(r.updated_at, offset));
  return [...stored, ...fromReviews];
}

let cache = { at: 0, map: new Map() };
const CACHE_MS = 60 * 1000;
// userId -> racha de hoy de todas las personas con actividad, para ponerla en las reseñas sin calcularla en cada pedido (se renueva cada minuto, o al instante si alguien registra actividad).
async function streakMap() {
  if (Date.now() - cache.at < CACHE_MS) return cache.map;
  const users = await db.prepare('SELECT id, activity_dates, tz_offset, is_subscriber FROM users').all();
  const byUser = new Map();
  for (const r of await db.prepare('SELECT user_id, updated_at FROM reviews').all()) (byUser.get(r.user_id) || byUser.set(r.user_id, []).get(r.user_id)).push(r.updated_at);
  const now = Date.now(), map = new Map();
  for (const u of users) {
    const stored = JSON.parse(u.activity_dates || '[]'), dates = byUser.get(u.id) || [];
    if (!stored.length && !dates.length) continue;
    const days = [...stored, ...dates.map(d => localKey(d, u.tz_offset))];
    map.set(u.id, StreakCore.analyze(days, localKey(now, u.tz_offset), graceFor(u)).streak);
  }
  cache = { at: now, map };
  return map;
}
// { streak } si la racha de esa persona se muestra a los demás (7 días o más), si no {} (para sumarlo a lo que se manda).
async function publicStreak(userId) {
  const s = (await streakMap()).get(userId);
  return s >= PUBLIC_MIN_STREAK ? { streak: s } : {};
}
// Racha y mejor racha para su perfil.
async function profileStreak(user) {
  const a = StreakCore.analyze(await daysOf(user, user.tz_offset), localKey(Date.now(), user.tz_offset), graceFor(user));
  return { streak: a.streak, bestStreak: Math.max(user.best_streak || 0, a.best) };
}

// Registra que la persona hizo algo hoy (calificó, reseñó o jugó el reto): guarda el día, la hora y su huso, sube la mejor racha y, si con esto llega a una meta, deja el aviso en sus
// notificaciones. { offset } es su huso (del encabezado X-TZ-Offset; si no vino, el que ya tenía); { date } la fecha de hoy que mandó el navegador (si no, se calcula).
// Devuelve { streak, bestStreak, milestone } (milestone: la meta que alcanzó hoy, o null).
async function recordActivity(user, { offset, date } = {}, insertNotification, uid) {
  const tz = parseOffset(offset) ?? user.tz_offset ?? 0;
  const now = new Date();
  const today = date || localKey(now, tz);
  const stored = JSON.parse(user.activity_dates || '[]');
  const isNewDay = !stored.includes(today);
  if (isNewDay) stored.push(today);
  const kept = stored.length > MAX_STORED_DAYS ? stored.sort().slice(-MAX_STORED_DAYS) : stored;
  const a = StreakCore.analyze([...kept, ...(await daysOf({ ...user, activity_dates: '[]' }, tz))], today, graceFor(user));
  const bestStreak = Math.max(user.best_streak || 0, a.best);
  await setActivity.run(JSON.stringify(kept), now.toISOString(), tz, bestStreak, user.id);
  cache.at = 0;
  const milestone = isNewDay && MILESTONES.includes(a.streak) ? a.streak : null;
  if (milestone) await insertNotification.run(uid(), user.id, 'streak', user.id, String(milestone), now.toISOString());
  return { streak: a.streak, bestStreak, milestone };
}

// El recordatorio por correo. Se manda UNA vez, a quien lo pidió, cuando: pasó un día desde su última actividad (dentro del rango de 2 horas que sigue a esa hora), hoy todavía no hizo
// nada y tiene una racha de al menos REMINDER_MIN_STREAK días. Por ejemplo: calificó el lunes a las 18:40 con 3 días de racha; el martes a las 18:40 empieza el rango y, si hasta las
// 20:40 no hizo nada, sale el correo en la primera pasada de este proceso dentro del rango. Hay que llamarlo seguido (cada hora o menos): ver /api/cron/streak-reminders.
// sendReminder(user, streak) manda el correo (y lanza si falla: ese correo se vuelve a intentar mientras siga el rango).
async function sendStreakReminders(sendReminder, { now = Date.now(), limit = 200 } = {}) {
  const lastFrom = new Date(now - REMINDER_AFTER_MS - REMINDER_WINDOW_MS).toISOString(), lastTo = new Date(now - REMINDER_AFTER_MS).toISOString();
  const notAfter = new Date(now - REMINDER_MIN_GAP_MS).toISOString();
  const rows = await db.prepare(`SELECT * FROM users WHERE streak_reminders = 1 AND email IS NOT NULL AND email_verified_at IS NOT NULL AND suspended_at IS NULL
    AND last_activity_at > ? AND last_activity_at <= ? AND (last_streak_reminder_at IS NULL OR last_streak_reminder_at < ?) ORDER BY last_activity_at LIMIT ${Number(limit) | 0}`).all(lastFrom, lastTo, notAfter);
  const out = { checked: rows.length, sent: 0, skipped: 0, failed: 0 };
  for (const u of rows) {
    const a = StreakCore.analyze(await daysOf(u, u.tz_offset), localKey(now, u.tz_offset), graceFor(u));
    if (a.todayDone || a.streak < REMINDER_MIN_STREAK) { out.skipped++; continue; }
    try {
      await sendReminder(u, a.streak);
      await db.prepare('UPDATE users SET last_streak_reminder_at = ? WHERE id = ?').run(new Date(now).toISOString(), u.id);
      out.sent++;
    } catch (e) { console.error('No se pudo mandar el recordatorio de racha:', e.message); out.failed++; }
  }
  return out;
}

module.exports = { recordActivity, streakMap, publicStreak, profileStreak, sendStreakReminders, parseOffset, localKey, graceFor, PUBLIC_MIN_STREAK, REMINDER_MIN_STREAK };
