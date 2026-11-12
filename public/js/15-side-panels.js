/**
 * ARCHIVO 15 de 16 — Columnas laterales derechas ("rails") de las pantallas
 * anchas: la de Novedades (reto del día, racha, próximas fechas, actividad
 * reciente, últimas reseñas, top personajes) y la de las fichas de juego y de personaje (distribución de
 * notas, similares/relacionados, últimas reseñas).
 *
 * Es solo presentación: todo se arma con los datos que ya están en memoria
 * (state.reviews, state.characters, DATE_EVENTS…), sin endpoints nuevos. En
 * pantallas angostas la columna simplemente queda debajo del contenido (ver
 * .layout-rail / .rail en style.css). Las barras laterales de FILTROS de
 * Explorar y Personajes no están aquí: viven en 08-browse.js y 14-characters.js.
 */
/* ---------- utilidades compartidas ---------- */
// «Hace 1 hora», «Hace 2 horas»... durante las primeras 24 horas (menos de una hora: «Hace menos de 1 hora»); a las 24 horas, «Hace 1 día», «Hace 2 días»... (sin «ayer» ni «anteayer») hasta 31 días; pasado eso, «Hace 1 mes», «Hace 2 meses»... y desde los 365 días, «Hace 1 año», «Hace 2 años».
// Cuenta tiempo transcurrido real (24 horas exactas = 1 día), no días de calendario. Lo usan las calificaciones del perfil y las filas de actividad (Últimas reseñas, Actividad reciente).
function agoLabel(iso){
  const hours = Math.floor((Date.now() - new Date(iso)) / 3600000); // si el reloj del navegador va atrasado y sale negativo, cae en «menos de 1 hora»
  const days = Math.floor(hours / 24);
  const fmt = (one, many, n)=> n===1 ? t(one) : t(many).replace('{n}', n);
  if(hours<1) return t('ago_lt_hour');
  if(hours<24) return fmt('ago_hour', 'ago_hours', hours);
  if(days<=31) return fmt('ago_day', 'ago_days', days);
  if(days<365) return fmt('ago_month', 'ago_months', Math.min(11, Math.floor(days/30))); // meses de 30 días, sin llegar a «12 meses»: a los 365 días ya es un año
  return fmt('ago_year', 'ago_years', Math.floor(days/365));
}
function ratingsCountText(n){
  return state.lang==='en' ? `${n} rating${n===1?'':'s'}` : `${n} nota${n===1?'':'s'}`;
}
// Ir a la ficha de un juego/personaje desde una columna lateral, sin pisar el "volver" de la ficha de la que se viene.
function goToGame(id){
  state.currentGame = id;
  if(state.view!=='game') state.gameOrigin = state.view==='feed' ? 'feed' : 'browse';
  goView('game');
}
function goToCharacter(id){ state.currentCharacter = id; goView('character'); }
// Engancha los clicks de los elementos con data-go-game / data-go-char / data-go-view dentro de una columna.
function wireRail(root){
  // Cada fila y cada botón de la columna pasa a ser un enlace de verdad (clic derecho -> abrir en pestaña nueva); un clic normal navega sin recargar.
  root.querySelectorAll('[data-go-game]').forEach(b=>{ const a = asLink(b, gameHref(b.dataset.goGame)); a.onclick = spa(()=> goToGame(a.dataset.goGame)); });
  root.querySelectorAll('[data-go-char]').forEach(b=>{ const a = asLink(b, characterHref(b.dataset.goChar)); a.onclick = spa(()=> goToCharacter(a.dataset.goChar)); });
  root.querySelectorAll('[data-go-review]').forEach(b=>{ const a = asLink(b, reviewHref(b.dataset.goReview)); a.onclick = spa(()=> openReview(a.dataset.goReview)); });
  root.querySelectorAll('[data-go-view]').forEach(b=>{ const a = asLink(b, pathForView(b.dataset.goView)); a.onclick = spa(()=> goView(a.dataset.goView)); });
}
// Una fila clicable de una columna: lead (portada/avatar/fecha, ya en HTML), título y subtítulo (texto ya escapado), y un puntaje opcional.
// clickable=false la dibuja como <div> (no se enfoca ni se anuncia como botón); cls agrega clases al elemento.
function railItemHTML({ attrs='', lead='', title, sub='', score=null, clickable=true, cls='' }){
  const tag = clickable ? 'button type="button"' : 'div';
  const end = clickable ? 'button' : 'div';
  return `<${tag} class="rail-item ${cls}${clickable? '' : ' rail-static'}" ${attrs}>${lead}<span class="ri-main"><span class="ri-title">${title}</span>${sub? `<span class="ri-sub">${sub}</span>` : ''}</span>${score!=null? `<span class="ri-score">${score}</span>` : ''}</${end}>`;
}
function railCardHTML(title, bodyHTML, subHTML='', cls=''){
  return `<div class="card rail-card ${cls}"><h3 class="rail-title">${esc(title)}</h3>${subHTML? `<p class="rail-sub">${subHTML}</p>` : ''}${bodyHTML}</div>`;
}
// Filas clicables de un juego / un personaje (portada o foto, nombre, géneros o juegos, y nota opcional). rank: número de puesto para rankings.
function gameRailRow(g, score=null){
  return railItemHTML({
    attrs: `data-go-game="${esc(g.id)}"`,
    lead: `<span class="gc-cover ri-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</span>`,
    title: esc(g.title),
    sub: esc(genreLabelList(g)),
    score,
  });
}
function characterRailRow(c, score=null, rank=null){
  return railItemHTML({
    attrs: `data-go-char="${esc(c.id)}"`,
    lead: (rank? `<span class="ri-rank">${rank}</span>` : '') + charAvatarHTML(c, 'ri-char-avatar'),
    title: esc(c.name),
    sub: esc(characterGamesLabel(characterGames(c))),
    score,
  });
}
function userAvatarHTML(name){
  return `<span class="ri-avatar" style="background:${AVATAR_COLORS[Math.abs(hashStr(name))%AVATAR_COLORS.length]}">${esc((name[0]||'?').toUpperCase())}</span>`;
}

/* ---------- distribución de notas ---------- */
// Barras horizontales del 10 al 1 con cuántas notas hay de cada una (el color de cada barra es el mismo "mood" de los botones de calificar).
function histogramCardHTML(ratings){
  const total = ratings.length;
  if(!total) return railCardHTML(t('rail_hist_title'), `<p class="hint">${esc(t('rail_hist_empty'))}</p>`);
  const counts = Array(11).fill(0);
  ratings.forEach(r=>{ if(r>=0.5 && r<=10) counts[Math.ceil(r)]++; }); // la fila 8 junta los 8 y los 7.5
  const max = Math.max(...counts.slice(1));
  const avg = ratings.reduce((s,r)=>s+r,0) / total;
  const rows = [];
  for(let n=10; n>=1; n--){
    rows.push(`<div class="hist-row"><span class="hist-n">${n}</span><span class="hist-bar"><span style="width:${counts[n]/max*100}%; background:${MOOD_COLOR(n)};"></span></span><span class="hist-c">${counts[n]}</span></div>`);
  }
  return railCardHTML(t('rail_hist_title'), `<div class="hist">${rows.join('')}</div>`, `${esc(ratingsCountText(total))} · ${avg.toFixed(1)}/10`);
}

/* ---------- actividad reciente (reseñas de la comunidad) ---------- */
// Reseñas de juegos y/o personajes, de la más nueva a la más vieja. kind: 'game' | 'character' | null (ambas); exclude: {kind,id} para no repetir lo que ya se está viendo.
function recentActivity({ limit=5, kind=null, exclude=null }={}){
  const items = [];
  if(kind!=='character'){
    state.reviews.forEach(r=>{
      if(!hasReviewContent(r) || (exclude && exclude.kind==='game' && exclude.id===r.gameId)) return;
      const g = findGame(r.gameId);
      if(g) items.push({ kind:'game', id:g.id, reviewId:r.id, title:g.title, user:r.username, rating:r.rating, text:r.text, date:r.date });
    });
  }
  if(kind!=='game'){
    state.characterReviews.forEach(r=>{
      if(!hasReviewContent(r) || (exclude && exclude.kind==='character' && exclude.id===r.characterId)) return;
      const c = findCharacter(r.characterId);
      if(c) items.push({ kind:'character', id:c.id, reviewId:r.id, title:c.name, user:r.username, rating:r.rating, text:r.text, date:r.date });
    });
  }
  return items.sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0, limit);
}
// Fila de una reseña/nota de la comunidad: "usuario <verbo> título", hace cuánto y la nota. subExtra: HTML ya escapado que va después de la fecha.
function activityRowHTML(it, verbKey, subExtra=''){
  return railItemHTML({
    attrs: `data-go-review="${esc(it.reviewId)}"`, // la fila lleva a la reseña, en su propia página
    lead: userAvatarHTML(it.user),
    title: `${esc(it.user)} <span class="ri-verb">${esc(t(verbKey))}</span> ${esc(it.title)}`,
    sub: `${esc(agoLabel(it.date))}${subExtra}`,
    score: it.rating!=null ? it.rating : null,
  });
}
function activityCardHTML(title, opts){
  const items = recentActivity(opts);
  if(!items.length) return railCardHTML(title, `<p class="hint">${esc(t('rail_activity_empty'))}</p>`);
  const rows = items.map(it=>{
    const snippet = it.text && it.text.trim() ? ` · “${esc(it.text.trim().slice(0, 48))}${it.text.trim().length>48?'…':''}”` : '';
    return activityRowHTML(it, it.rating!=null ? 'act_rated' : 'act_reviewed', snippet);
  }).join('');
  return railCardHTML(title, `<div class="rail-list">${rows}</div>`);
}

/* ---------- ficha de un juego ---------- */
// Juegos que comparten género con g, primero los que comparten más géneros y, a igualdad, los mejor calificados.
function similarGames(g, limit=5){
  const mine = new Set((g.genres && g.genres.length ? g.genres : [g.genre]).filter(Boolean));
  return allGames().filter(x=>x.id!==g.id).map(x=>{
    const theirs = (x.genres && x.genres.length ? x.genres : [x.genre]);
    return { game:x, shared: theirs.filter(k=>mine.has(k)).length, avg: gameStats(x.id).avg };
  }).filter(x=>x.shared>0)
    .sort((a,b)=> b.shared-a.shared || b.avg-a.avg || a.game.title.localeCompare(b.game.title))
    .slice(0, limit);
}
function similarGamesCardHTML(g){
  const list = similarGames(g);
  if(!list.length) return '';
  const rows = list.map(({game:x, avg})=> gameRailRow(x, avg ? avg.toFixed(1) : null)).join('');
  return railCardHTML(t('rail_similar_title'), `<div class="rail-list">${rows}</div>`);
}
// Llena la columna derecha de la ficha de un juego (el contenedor #gameRail lo arma renderGameDetail en 08-browse.js).
function renderGameRail(g){
  const el = document.getElementById('gameRail');
  if(!el) return;
  const ratings = state.reviews.filter(r=>r.gameId===g.id && r.rating!=null).map(r=>r.rating);
  el.innerHTML = histogramCardHTML(ratings)
    + similarGamesCardHTML(g)
    + activityCardHTML(t('rail_latest_title'), { kind:'game', exclude:{ kind:'game', id:g.id } })
    + tipsCardHTML('game');
  wireRail(el);
}

/* ---------- ficha de un personaje ---------- */
// Personajes de los mismos juegos (pesa más) o con categorías en común.
function relatedCharacters(c, limit=5){
  const games = new Set(characterGames(c).map(g=>g.id));
  const cats = new Set(c.categories || []);
  return allCharacters().filter(x=>x.id!==c.id).map(x=>{
    const sharedGames = characterGames(x).filter(g=>games.has(g.id)).length;
    const sharedCats = (x.categories || []).filter(k=>cats.has(k)).length;
    return { character:x, score: sharedGames*3 + sharedCats, avg: characterStats(x.id).avg };
  }).filter(x=>x.score>0)
    .sort((a,b)=> b.score-a.score || b.avg-a.avg || a.character.name.localeCompare(b.character.name))
    .slice(0, limit);
}
function relatedCharactersCardHTML(c){
  const list = relatedCharacters(c);
  if(!list.length) return '';
  const rows = list.map(({character:x, avg})=> characterRailRow(x, avg ? avg.toFixed(1) : null)).join('');
  return railCardHTML(t('rail_related_title'), `<div class="rail-list">${rows}</div>`);
}
function renderCharacterRail(c){
  const el = document.getElementById('charRail');
  if(!el) return;
  const ratings = state.characterReviews.filter(r=>r.characterId===c.id && r.rating!=null).map(r=>r.rating);
  el.innerHTML = histogramCardHTML(ratings)
    + relatedCharactersCardHTML(c)
    + activityCardHTML(t('rail_latest_title'), { kind:'character', exclude:{ kind:'character', id:c.id } })
    + tipsCardHTML('character');
  wireRail(el);
}

/* ---------- Novedades ---------- */
// Tarjeta del reto del día: cuántos intentos van, y si ya lo resolviste/fallaste hoy.
function dailyRailCardHTML(){
  const d = state.daily;
  const title = t('nav_daily');
  if(!state.user || !d){
    return railCardHTML(title, `<p class="rail-text">${esc(t('rail_daily_guest'))}</p><button type="button" class="btn gold small" data-go-view="daily">${esc(t('rail_daily_play'))}</button>`);
  }
  const used = d.guesses.length;
  const dots = Array.from({length:5}, (_,i)=> `<span class="rail-dot ${i<used? (d.solved && i===used-1 ? 'ok' : 'used') : ''}"></span>`).join('');
  const text = d.solved ? t('rail_daily_solved') : d.failed ? t('rail_daily_failed') : `${used}/5 ${t('rail_attempts')}`;
  const done = d.solved || d.failed;
  const btn = done ? '' : `<button type="button" class="btn gold small" data-go-view="daily">${esc(t(used? 'rail_daily_continue' : 'rail_daily_play'))}</button>`;
  return railCardHTML(title, `<div class="rail-dots">${dots}</div><p class="rail-text">${esc(text)}</p>${btn}`);
}
// Tarjeta de la racha: días seguidos con actividad y los últimos 7 días.
function streakRailCardHTML(){
  const title = t('rail_streak_title');
  if(!state.user){
    return railCardHTML(title, `<p class="rail-text">${esc(t('rail_streak_guest'))}</p><button type="button" class="btn small" data-go-view="auth">${esc(t('login_btn'))}</button>`);
  }
  const streak = computeStreak(state.user.username);
  const active = new Set(userActivityDays(state.user.username));
  const dots = [];
  for(let i=6; i>=0; i--){
    const day = new Date(); day.setDate(day.getDate()-i);
    dots.push(`<span class="rail-dot ${active.has(localDateKey(day))?'used':''}" title="${esc(fmtDate(day.toISOString()))}"></span>`);
  }
  const label = state.lang==='en' ? t('rail_streak_days') : t(streak===1 ? 'rail_streak_day' : 'rail_streak_days');
  return railCardHTML(title, `<div class="streak-row"><span class="streak-num">${streak}</span><span class="streak-label">${esc(label)}</span></div><div class="rail-dots">${dots.join('')}</div>${streak? '' : `<p class="rail-text">${esc(t('rail_streak_empty'))}</p>`}`);
}
// Próximos eventos del calendario de "fechas importantes" (se repiten cada año).
function upcomingDates(limit=4){
  const today = new Date(); today.setHours(0,0,0,0);
  return DATE_EVENTS.map(e=>{
    let d = new Date(today.getFullYear(), e.month-1, e.day);
    if(d < today) d = new Date(today.getFullYear()+1, e.month-1, e.day);
    return { e, d };
  }).sort((a,b)=> a.d-b.d).slice(0, limit);
}
function datesRailCardHTML(){
  const list = upcomingDates();
  if(!list.length) return '';
  const locale = state.lang==='en' ? 'en-US' : 'es-ES';
  const rtf = new Intl.RelativeTimeFormat(state.lang==='en' ? 'en' : 'es', { numeric:'auto' });
  const today = new Date(); today.setHours(0,0,0,0);
  const rows = list.map(({e, d})=>{
    const tx = e[state.lang] || e.es;
    const game = e.gameId ? findGame(e.gameId) : null;
    return railItemHTML({
      attrs: game ? `data-go-game="${esc(game.id)}"` : '',
      clickable: !!game,
      lead: `<span class="date-badge"><b>${d.getDate()}</b><i>${esc(d.toLocaleDateString(locale, { month:'short' }).replace('.',''))}</i></span>`,
      title: esc(tx.title),
      sub: esc(rtf.format(Math.round((d-today)/86400000), 'day')),
    });
  }).join('');
  return railCardHTML(t('rail_dates_title'), `<div class="rail-list">${rows}</div>`);
}
// Las últimas reseñas CON TEXTO (de juegos o personajes), cada una con su cita debajo de quién la escribió y sobre qué.
const LATEST_REVIEWS = 3;
function latestReviewsCardHTML(){
  const title = t('rail_review_title');
  const items = recentActivity({ limit:Infinity }).filter(x=> x.text && x.text.trim()).slice(0, LATEST_REVIEWS);
  if(!items.length) return railCardHTML(title, `<p class="hint">${esc(t('rail_review_empty'))}</p>`);
  const blocks = items.map(it=> `<div class="quote-block">${activityRowHTML(it, 'act_reviewed')}<blockquote class="quote-text">“${esc(it.text.trim())}”</blockquote></div>`).join('');
  return railCardHTML(title, `<div class="rail-list">${blocks}</div>`);
}
// El podio de 3 puestos de personajes (mismo criterio que "Mejor calificados" en Personajes); los puestos sin personaje calificado quedan como "puesto libre" que lleva a Personajes.
const TOP_CHARS_SLOTS = 3;
function topCharactersCardHTML(){
  const top = allCharacters().filter(c=> characterStats(c.id).ratedCount>0).sort(CHAR_SORTS.rating_desc).slice(0, TOP_CHARS_SLOTS);
  const rows = Array.from({length:TOP_CHARS_SLOTS}, (_,i)=> top[i]
    ? characterRailRow(top[i], characterStats(top[i].id).avg.toFixed(1), i+1)
    : railItemHTML({ attrs:'data-go-view="characters"', lead:`<span class="ri-rank">${i+1}</span><span class="char-avatar ri-slot">?</span>`, title:esc(t('rail_slot_free')), sub:esc(t('rail_slot_hint')) })
  ).join('');
  return railCardHTML(t('rail_top_chars_title'), `<div class="rail-list">${rows}</div><button type="button" class="btn small" data-go-view="characters">${esc(t('rail_see_all'))}</button>`);
}
// Llena la columna derecha de Novedades (#feedRail, ver index.html). Se llama desde applyView('feed').
function renderFeedRail(){
  const el = document.getElementById('feedRail');
  if(!el) return;
  el.innerHTML = dailyRailCardHTML() + streakRailCardHTML() + datesRailCardHTML() + activityCardHTML(t('rail_activity_title'), { limit:4 }) + tipsCardHTML('feed') + latestReviewsCardHTML() + topCharactersCardHTML();
  wireRail(el);
}

/* ---------- tips y recordatorios (columna derecha de TODAS las páginas) ---------- */
// Recordatorios según lo que el usuario todavía no hizo; cada uno apunta (go) a la vista donde se resuelve. Sin sesión, solo invitan a crear cuenta / probar el reto.
function userReminders(){
  const u = state.user;
  if(!u) return [
    { icon:ICONS.user, key:'tip_signup', go:'auth' },
    { icon:ICONS.dice, key:'tip_daily_guest', go:'daily' },
  ];
  const out = [];
  const d = state.daily;
  if(d && !d.solved && !d.failed) out.push({ icon:ICONS.dice, key:'tip_daily', go:'daily' });
  const streak = computeStreak(u.username);
  if(streak>0 && !userActivityDays(u.username).includes(localDateKey())) out.push({ icon:ICONS.flame, key:'tip_streak', n:streak, go:'browse' });
  if(!u.email) out.push({ icon:ICONS.lock, key:'tip_email', go:'settings', more:true });
  if(!u.favoriteGameId) out.push({ icon:ICONS.heart, key:'tip_favorite', go:'shelf' });
  if(!state.reviews.some(r=>r.username===u.username)) out.push({ icon:ICONS.star, key:'tip_first_rating', go:'browse' });
  if(!(u.wishlist||[]).length) out.push({ icon:ICONS.bookmark, key:'tip_wishlist', go:'browse' });
  if(!state.characterReviews.some(r=>r.username===u.username)) out.push({ icon:ICONS.user, key:'tip_char_rating', go:'characters' });
  if(!u.avatarUrl || !u.bio) out.push({ icon:ICONS.edit, key:'tip_profile', go:'settings' });
  if(!Object.values(u.socialLinks||{}).some(Boolean)) out.push({ icon:ICONS.link, key:'tip_social', go:'settings', more:true });
  const mine = state.reviews.filter(r=>r.username===u.username);
  if(mine.some(r=>r.rating!=null) && !mine.some(r=>r.text)) out.push({ icon:ICONS.messageCircle, key:'tip_write_review', go:'browse', more:true });
  return out;
}
// Consejos de uso. views: en qué páginas se muestran primero; sin views son generales y rotan según el día.
// more: los que se sumaron para llegar a 8 tips; el inicio (Novedades) no los usa y se queda con los de siempre.
const STATIC_TIPS = [
  { icon:ICONS.search, key:'tip_filters', go:'browse', views:['browse'] },
  { icon:ICONS.sword, key:'tip_versus', go:'characters', views:['characters','character'] },
  { icon:ICONS.plus, key:'tip_suggest', views:['browse','characters'] },
  { icon:ICONS.shuffle, key:'tip_roulette', views:['daily'] },
  { icon:ICONS.share, key:'tip_share', views:['game','character'] },
  { icon:ICONS.thumbsUp, key:'tip_helpful', views:['game'] },
  { icon:ICONS.layers, key:'tip_lists', go:'lists', views:['lists','shelf','profile'] },
  { icon:ICONS.calendar, key:'tip_dates', views:['feed'] },
  { icon:ICONS.trophy, key:'tip_ranking', go:'characters' },
  { icon:ICONS.globe, key:'tip_lang', needsLangSwitch:true },
  { icon:ICONS.moon, key:'tip_theme' },
  { icon:ICONS.search, key:'tip_search_accents', views:['browse','characters'], more:true },
  { icon:ICONS.map, key:'tip_stores', views:['game'], more:true },
  { icon:ICONS.globe, key:'tip_news', go:'news', more:true },
  { icon:ICONS.flame, key:'tip_streak_info', more:true },
  { icon:ICONS.heart, key:'tip_follow', more:true },
  { icon:ICONS.bell, key:'tip_notifications', more:true },
  { icon:ICONS.book, key:'tip_about', go:'about', more:true },
  { icon:ICONS.gamepad, key:'tip_logo', go:'feed', more:true },
];
const TIPS_MAX = 4;        // inicio (Novedades)
const TIPS_MAX_OTHER = 8;  // el resto de las páginas
// view: la vista actual ('feed', 'browse', 'shelf'…). Un recordatorio no se muestra en la propia vista a la que apunta.
function tipsFor(view){
  const here = view==='profile' ? 'shelf' : view;
  const home = view==='feed';
  const max = home ? TIPS_MAX : TIPS_MAX_OTHER;
  const pool = STATIC_TIPS.filter(x=> (LANG_SWITCH || !x.needsLangSwitch) && !(home && x.more));
  // los recordatorios van primero, pero dejan lugar a los tips propios de la página
  const reminders = userReminders().filter(r=> r.go!==here && !(home && r.more)).slice(0, home ? TIPS_MAX-1 : 5);
  const own = pool.filter(x=> x.views && x.views.includes(view));
  const general = pool.filter(x=> !x.views);
  const shift = Math.floor(Date.now()/86400000) % general.length;
  const rotated = general.slice(shift).concat(general.slice(0, shift));
  return reminders.concat(own, rotated).slice(0, max);
}
function tipsCardHTML(view){
  const rows = tipsFor(view).map(tip=> railItemHTML({
    attrs: tip.go ? `data-go-view="${tip.go}"` : '',
    clickable: !!tip.go,
    cls: 'tip-row',
    lead: `<span class="ri-icon">${tip.icon}</span>`,
    title: esc(t(tip.key).replace('{n}', tip.n)),
  })).join('');
  return railCardHTML(t('rail_tips_title'), `<div class="rail-list">${rows}</div>`, '', 'tips-card');
}
// Las vistas que no arman su propia columna (todas menos Novedades y las fichas) y los layouts con barra lateral reciben una <aside data-tips-rail> solo con tips. Se llama una vez al arrancar: mueve el contenido de cada vista a .rail-main (los nodos conservan ids y listeners), salvo lo marcado con data-rail-top.
function setupTipsRails(){
  const newRail = ()=>{ const a = document.createElement('aside'); a.className = 'rail'; a.setAttribute('data-tips-rail', ''); return a; };
  document.querySelectorAll('.layout-side').forEach(l=> l.appendChild(newRail()));
  const ownRail = ['view-feed','view-game','view-character'];
  document.querySelectorAll('.viewsec').forEach(sec=>{
    if(ownRail.includes(sec.id) || sec.querySelector('.layout-side')) return;
    const layout = document.createElement('div'); layout.className = 'layout-rail';
    const main = document.createElement('div'); main.className = 'rail-main';
    // un elemento con data-rail-top (ej. el título del Reto del día) se queda arriba, centrado sobre la columna y los tips
    [...sec.childNodes].filter(n=> !(n.nodeType===1 && n.hasAttribute('data-rail-top'))).forEach(n=> main.appendChild(n));
    layout.append(main, newRail());
    sec.appendChild(layout);
  });
  // además de al mostrar la vista (fillTipsRail), se recalcula cuando cambia el tamaño de la columna: idioma, ancho de la ventana…
  document.querySelectorAll('.layout-rail>[data-tips-rail]').forEach(rail=>{
    const main = rail.parentElement.querySelector('.rail-main');
    if(main) new ResizeObserver(()=> alignTipsRail(rail)).observe(main);
  });
}
// La tarjeta de tips arranca a la altura del primer bloque de la vista (el que lleva data-rail-start), no del título ni del "Volver" que van encima: baja --rail-offset (ver style.css, desde 1400px).
function alignTipsRail(rail){
  const main = rail.parentElement.querySelector('.rail-main'), start = main && main.querySelector('[data-rail-start]');
  if(!start) return;
  rail.style.setProperty('--rail-offset', (main.offsetParent ? start.getBoundingClientRect().top - main.getBoundingClientRect().top : 0) + 'px');
}
// Llena la columna de tips de la vista que se acaba de mostrar (applyView, 05-navigation.js).
// Vistas que no llevan la columna de tips (Acerca de, Mi estantería y el inicio de sesión / registro). 'shelf' y 'profile' comparten #view-profile, por eso se decide en cada visita: la clase no-rail le saca a la vista el hueco de la derecha (ver style.css).
const NO_TIPS_VIEWS = ['about', 'shelf', 'auth', 'review'];
function fillTipsRail(view){
  const sec = document.getElementById(view==='shelf' ? 'view-profile' : 'view-'+view);
  const el = sec && sec.querySelector('[data-tips-rail]');
  if(!el) return;
  const noTips = NO_TIPS_VIEWS.includes(view);
  const layout = el.closest('.layout-rail');
  if(layout) layout.classList.toggle('no-rail', noTips);
  el.innerHTML = noTips ? '' : tipsCardHTML(view);
  wireRail(el);
  alignTipsRail(el);
}
