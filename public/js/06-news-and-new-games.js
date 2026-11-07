/**
 * ARCHIVO 6 de 16 — Los tres widgets de la página de Novedades (feed):
 * noticias, juegos nuevos destacados, más valorados, y el calendario de
 * fechas importantes que aparece debajo de las noticias. Todo lo de aquí
 * se pinta desde applyView() (05-navigation.js) cuando target==='feed'.
 */
/* ---------- noticias del mundo gamer ---------- */
// Card de una noticia (se reutiliza tanto en el feed principal como en la vista "Ver más" de todas las noticias).
function newsCard(n){
  const card=document.createElement('div');
  card.className='card newsitem';
  card.innerHTML=`
    <div class="rc-game" style="font-size:15px;">${esc(n.title)}</div>
    <p class="rc-text">${esc(n.summary)}</p>
    <div class="news-source">
      <div class="source-badge" style="background:${n.color}">${esc(n.initials)}</div>
      <span class="source-name">${esc(n.source)}</span>
      <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" class="news-link">${esc(t('read_more'))}</a>
    </div>
  `;
  return card;
}
function removeNewsLoadMore(){
  const existing = document.getElementById('newsLoadMoreWrap');
  if(existing) existing.remove();
}
// Noticias en la página de Novedades: muestra como mucho NEWS_FEED_LIMIT (9) y, si hay más, agrega un botón "Ver más" que lleva a la vista dedicada (renderNewsView) con todas.
function renderNews(){
  const wrap=document.getElementById('newsFeedList');
  removeNewsLoadMore();
  wrap.innerHTML='';
  NEWS_ITEMS.slice(0, NEWS_FEED_LIMIT).forEach(n=> wrap.appendChild(newsCard(n)));
  if(NEWS_ITEMS.length > NEWS_FEED_LIMIT){
    const w = document.createElement('div');
    w.id = 'newsLoadMoreWrap';
    w.className = 'load-more-wrap';
    const btn = document.createElement('a');
    btn.href = '/noticias';
    btn.className = 'btn-ghost load-more-btn';
    btn.textContent = t('load_more_btn');
    btn.onclick = spa(()=> goView('news'));
    w.appendChild(btn);
    wrap.insertAdjacentElement('afterend', w);
  }
}
// Vista dedicada "/noticias": TODAS las noticias, sin límite.
function renderNewsView(){
  const wrap=document.getElementById('newsViewList');
  document.getElementById('newsViewCount').textContent = NEWS_ITEMS.length;
  wrap.innerHTML='';
  if(NEWS_ITEMS.length===0){
    wrap.innerHTML = emptyState(ICONS.fileText, t('empty_news_t'), t('empty_news_s'));
    return;
  }
  NEWS_ITEMS.forEach(n=> wrap.appendChild(newsCard(n)));
}

/* ---------- juegos nuevos: destacados a mano desde /admin (g.isNewRelease) ---------- */

// Grilla "Juegos nuevos" (va dentro del panel de Novedades, con la tarjeta de portada + título + nota): solo los juegos que un admin marcó como isNewRelease, ordenados del más reciente al más viejo (por newReleaseDate, o la fecha de creación si no la tiene).
function renderNewGames(){
  const wrap = document.getElementById('newGamesGrid');
  const items = allGames()
    .filter(g=> g.isNewRelease)
    .map(g=>({ game:g, date:g.newReleaseDate || g.createdAt || new Date().toISOString() }))
    .sort((a,b)=> new Date(b.date)-new Date(a.date));
  wrap.innerHTML='';
  items.forEach(({game:g})=>{
    const st = gameStats(g.id);
    const card=document.createElement('div');
    card.className='card newscard has-card-link';
    card.innerHTML = `
      ${cardLinkHTML(gameHref(g.id), g.title)}
      <div class="news-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
      <div class="news-title">${esc(g.title)}</div>
      ${st.count? `<div id="ngn-${g.id}"></div>` : `<div><span class="no-rating-tag">${esc(t('no_rating_yet'))}</span></div>`}
    `;
    card.onclick=spa(()=>{ state.currentGame=g.id; state.gameOrigin='feed'; goView('game'); });
    wrap.appendChild(card);
    if(st.count) renderGauge(document.getElementById(`ngn-${g.id}`), st.avg);
  });
}

/* ---------- feed: grilla de juegos más valorados ---------- */
// Todos los juegos que tienen AL MENOS una reseña de cualquier usuario (sin repetir), como lista de {game}.
function gamesByPopularity(){
  const map = {};
  state.reviews.forEach(r=>{ map[r.gameId] = true; });
  return Object.keys(map).map(gameId=>({ game: findGame(gameId) })).filter(x=>x.game);
}
// Grilla "Más valorados" (va suelta entre las tarjetas de "cómo calificar" y las noticias, con la tarjeta grande de portada + título + datos + botón de calificar): los 6 juegos con más reseñas (y, en caso de empate, mejor nota promedio). Los que superan 50 reseñas y 8.5 de promedio se marcan como "featured" con una estrellita.
function renderFeed(){
  const wrap=document.getElementById('feedList');
  const popular = gamesByPopularity()
    .map(x=>({ game:x.game, stats: gameStats(x.game.id) }))
    .sort((a,b)=> b.stats.count - a.stats.count || b.stats.avg - a.stats.avg);
  if(popular.length===0){ wrap.innerHTML = emptyState(ICONS.archive, t('empty_feed_t'), t('empty_feed_s')); return; }
  wrap.innerHTML='';
  popular.slice(0, 6).forEach(({game, stats:st})=>{
    const featured = st.count>50 && st.avg>8.5;
    const card=document.createElement('div');
    card.className='card newscard newgamecard has-card-link'+(featured?' featured':'');
    card.innerHTML = `
      ${cardLinkHTML(gameHref(game.id), game.title)}
      ${featured? `<div class="star-badge" title="Aclamado por la comunidad">${ICONS.star}</div>` : ''}
      <div class="news-cover ${genreTint(primaryGenre(game))}" data-cover-title="${esc(game.title)}" data-cover-url="${esc(game.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(game)]||ICONS.gamepad}</div>
      <div class="news-title">${esc(game.title)}</div>
      <div class="ngc-year">${esc(genreLabelList(game))} · ${reviewsCountText(st.count)} · ${st.avg}/10</div>
      <button class="btn small ngc-rate">${esc(t('rate_this_game'))}</button>
    `;
    card.onclick=spa(()=>{ state.currentGame=game.id; state.gameOrigin='feed'; goView('game'); });
    card.querySelector('.ngc-rate').onclick=(e)=>{ e.stopPropagation(); jumpToRate(game.id); };
    wrap.appendChild(card);
  });
}

/* ---------- calendario de "fechas importantes" (cumpleaños/salidas de juegos), debajo de las noticias en Novedades ---------- */
let calendarViewDate = null; // { year, month(1-12) } del mes que se está mostrando; null hasta el primer render (ahí arranca en el mes actual)
// Botones ◀/▶ del calendario: mueve calendarViewDate un mes para adelante o atrás (delta = 1 o -1) y vuelve a pintar. Cruza de diciembre a enero (y viceversa) sumando/restando el año.
function shiftCalendarMonth(delta){
  let { year, month } = calendarViewDate;
  month += delta;
  if(month<1){ month=12; year--; }
  if(month>12){ month=1; year++; }
  calendarViewDate = { year, month };
  renderDateWidget();
}
// Dibuja el calendario completo del mes en calendarViewDate: cabecera con
// navegación, nombres de los días de la semana, y una grilla de casilleros
// (arranca en lunes). Cada casillero muestra el número de día y, si hay un
// DATE_EVENTS para ese día, su título + descripción + un botón "Calificar
// este juego" (solo si el evento tiene gameId). El día de hoy se resalta
// con la clase "today" (solo si se está mostrando el mes actual).
function renderDateWidget(){
  const el = document.getElementById('dateWidget');
  if(!el) return;
  const today = new Date();
  if(!calendarViewDate) calendarViewDate = { year: today.getFullYear(), month: today.getMonth()+1 };
  const { year, month } = calendarViewDate;
  const firstOfMonth = new Date(year, month-1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const rawMonthLabel = firstOfMonth.toLocaleDateString(state.lang==='en'?'en-US':'es-ES', { month:'long', year:'numeric' });
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);
  const isCurrentMonth = year===today.getFullYear() && month===today.getMonth()+1;
  const eventsByDay = {};
  DATE_EVENTS.forEach(e=>{ if(e.month===month){ (eventsByDay[e.day] = eventsByDay[e.day]||[]).push(e); } });
  const weekdayNames = state.lang==='en'
    ? ['Mo','Tu','We','Th','Fr','Sa','Su']
    : ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

  let cells = '';
  for(let i=0;i<startWeekday;i++) cells += `<div class="evcal-cell pad"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const ev = (eventsByDay[d]||[])[0];
    const isToday = isCurrentMonth && d===today.getDate();
    const tx = ev ? (ev[state.lang] || ev.es) : null;
    const game = ev && ev.gameId ? findGame(ev.gameId) : null;
    cells += `<div class="evcal-cell ${isToday?'today':''} ${ev?'has-event':''}">
      <div class="cal-daynum">${d}</div>
      ${ev? `<div class="cal-event-title">${esc(tx.title)}</div>` : ''}
      ${ev && tx.desc? `<div class="cal-event-desc">${esc(tx.desc)}</div>` : ''}
      ${game? `<button class="btn cal-cta" data-game="${esc(game.id)}">${esc(t('rate_this_game'))}</button>` : ''}
    </div>`;
  }
  el.innerHTML = `
    <div class="datewidget-title"><h3>${t('dates_title')}</h3></div>
    <div class="datewidget-head">
      <button type="button" class="cal-nav prev" id="calPrevBtn" aria-label="${esc(t('cal_prev_month'))}">${ICONS.arrowLeft}</button>
      <div class="cal-month-label">${esc(monthLabel)}</div>
      <button type="button" class="cal-nav next" id="calNextBtn" aria-label="${esc(t('cal_next_month'))}">${ICONS.arrowLeft}</button>
    </div>
    <div class="cal-weekdays">${weekdayNames.map(w=>`<div>${w}</div>`).join('')}</div>
    <div class="evcal-grid">${cells}</div>
    ${Object.keys(eventsByDay).length ? '' : `<p class="hint cal-empty">${esc(t('cal_no_events'))}</p>`}
  `;
  document.getElementById('calPrevBtn').onclick = ()=> shiftCalendarMonth(-1);
  document.getElementById('calNextBtn').onclick = ()=> shiftCalendarMonth(1);
  el.querySelectorAll('.cal-cta').forEach(b=> b.onclick = (e)=>{ e.stopPropagation(); jumpToRate(b.dataset.game); });
}
