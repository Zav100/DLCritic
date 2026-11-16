/**
 * Cuenta de la racha de días — UN solo código para el navegador y el servidor (en el navegador queda como StreakCore; en Node se hace require de este mismo archivo:
 * server/streaks.js). Así lo que ves en pantalla y lo que cuenta el servidor (el recordatorio por correo, la llama que ven los demás, la mejor racha) no pueden diferir.
 *
 * Reglas:
 *  · Un día cuenta si hubo actividad (calificar un juego o jugar el reto del día). La racha son los días con actividad seguidos, contando hacia atrás desde hoy (o desde ayer si hoy
 *    todavía no hubo: la racha no se corta a la medianoche).
 *  · Día de gracia: faltar un día NO rompe la racha (no suma, pero tampoco corta). Cada persona tiene GRACE.member días de gracia por semana y los suscriptores uno más (GRACE.subscriber):
 *    como máximo ese número de días perdonados dentro de cualquier tramo de 7 días seguidos. Faltar más que eso la pone en 0.
 *  · La mejor racha es la más larga que hubo, con las mismas reglas.
 * Las fechas son "AAAA-MM-DD" del huso horario de quien las generó (en el navegador, el suyo; en el servidor, el que dejó guardado al registrar actividad).
 */
(function (root) {
  const DAY = 86400000;
  const MILESTONES = [3, 7, 14, 30, 45, 60, 80, 100, 125, 150, 175, 200, 225, 250, 275, 300, 330, 365]; // metas de racha: cada una tiene su logro (con nombre único en 02-i18n.js)
  // La llama junto al nombre cambia de color en 30, 100, 200 y 365 días (.streak-flame.t30 / t100 / t200 / t365 en style.css); antes de los 30, el color de siempre (t7).
  const COLOR_STEPS = [[365, 't365'], [200, 't200'], [100, 't100'], [30, 't30']];
  const flameTier = days => (COLOR_STEPS.find(([min]) => days >= min) || [0, 't7'])[1];
  const GRACE = { member: 1, subscriber: 2 }; // días de gracia por semana
  const GRACE_WINDOW = 7;
  const MAX_LOOKBACK = 1500; // días: más atrás no cambia nada de lo que se muestra

  const dayNumber = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const dayKey = n => new Date(n * DAY).toISOString().slice(0, 10);

  // dayKeys: las fechas con actividad (con repetidas y de más atrás no pasa nada); todayKey: la fecha de hoy de quien se calcula; grace: días de gracia por semana.
  // Devuelve { streak, best, todayDone, atRisk, graceLeft, graceUsed, lastActive }:
  //   streak: la racha de ahora; best: la mejor de todas; todayDone: hoy ya hubo actividad; atRisk: hay racha y hoy todavía no hubo actividad;
  //   graceUsed / graceLeft: días de gracia ya usados y que quedan en los últimos 7 días (hoy incluido); lastActive: la última fecha con actividad.
  function analyze(dayKeys, todayKey, grace = GRACE.member) {
    const active = new Set();
    for (const k of dayKeys || []) if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) active.add(dayNumber(k));
    const empty = { streak: 0, best: 0, todayDone: false, atRisk: false, graceLeft: grace, graceUsed: 0, lastActive: null };
    if (active.size === 0) return empty;
    let first = Infinity, last = -Infinity;
    for (const d of active) { if (d < first) first = d; if (d > last) last = d; }
    const today = Math.max(dayNumber(todayKey), last); // un huso horario adelantado puede traer ya la fecha de mañana
    let streak = 0, best = 0, forgiven = [];
    for (let d = Math.max(first, today - MAX_LOOKBACK); d <= today; d++) {
      if (active.has(d)) { streak++; if (streak > best) best = streak; continue; }
      if (d === today) break; // hoy todavía no terminó: aún no cuenta como día perdido
      if (streak === 0) continue;
      forgiven = forgiven.filter(x => d - x < GRACE_WINDOW);
      if (forgiven.length < grace) forgiven.push(d); // día de gracia: la racha sigue, sin sumar
      else { streak = 0; forgiven = []; }
    }
    const graceUsed = forgiven.filter(x => today - x < GRACE_WINDOW).length;
    const todayDone = active.has(today);
    return { streak, best, todayDone, atRisk: streak > 0 && !todayDone, graceLeft: Math.max(0, grace - graceUsed), graceUsed, lastActive: dayKey(last) };
  }

  // La primera meta que todavía no se alcanzó (null si ya pasó la última).
  const nextMilestone = streak => MILESTONES.find(m => m > streak) || null;

  const api = { analyze, nextMilestone, flameTier, dayKey, MILESTONES, GRACE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StreakCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
