/**
 * ARCHIVO 13 de 16 — Vista "/reto-del-dia": adivinar el juego + ruleta.
 *
 * El juego del día se elige de forma DETERMINÍSTICA a partir de la fecha
 * (loadDailyState: un hash del string de la fecha % la cantidad de juegos
 * del catálogo), así que TODOS los usuarios tienen el mismo juego para
 * adivinar ese día, sin necesidad de coordinarlo desde el servidor — el
 * servidor solo guarda el PROGRESO de cada usuario (intentos, si lo
 * resolvió, tiradas de ruleta usadas), no el juego elegido.
 *
 * Las dos secciones (adivinar + ruleta) son independientes entre sí,
 * comparten solo el mismo objeto state.daily y el mismo helper visual
 * setDailyCounter/counterColor para sus contadores ("intento 2/5",
 * "2 tiradas restantes").
 */
/* ---------- reto del día: adivina el juego + ruleta ---------- */
const CLUE_LABELS = ['clue_genre','clue_mode','clue_platforms','clue_year','clue_dev']; // orden en que se van revelando las 5 pistas (una por intento)
// El valor real de la pista N (según el índice en CLUE_LABELS) para el juego del día.
function clueValue(g, d, idx){
  switch(idx){
    case 0: return genreLabelList(g);
    case 1: return d.mode;
    case 2: return (g.platforms||[]).map(p=>PLATFORM_NAMES[p]).join(', ') || '—';
    case 3: return String(d.year);
    case 4: return d.developer;
  }
}
// Guarda el progreso del reto de hoy en el servidor (solo si hay sesión — sin cuenta, el progreso vive solo en memoria y se pierde al recargar).
async function saveDailyState(){
  if(!state.user) return;
  try{ await apiPut('/daily', { date: state.daily.date, guesses: state.daily.guesses, solved: state.daily.solved, failed: state.daily.failed, rouletteSpins: state.daily.rouletteSpins }); }catch(e){}
}
// Arma state.daily para HOY: elige el juego del día (determinístico, ver
// comentario del archivo más arriba) y, si hay sesión, pisa
// guesses/solved/failed/rouletteSpins con lo que ya haya guardado el
// servidor para hoy (pero el gameId elegido localmente SIEMPRE gana, por
// las dudas de que el servidor tuviera algo desactualizado).
async function loadDailyState(){
  const today = localDateKey();
  const idx = Math.abs(hashStr(today)) % CATALOG.length;
  state.daily = { date:today, gameId: CATALOG[idx].id, guesses:[], solved:false, failed:false, rouletteSpins:0 };
  if(!state.user) return;
  try{
    const { daily } = await apiGet('/daily?date='+encodeURIComponent(today));
    Object.assign(state.daily, daily, { gameId: state.daily.gameId });
  }catch(e){}
}
function renderDaily(){
  renderGuessSection();
  renderRouletteSection();
}
// HTML compartido de los contadores chiquitos con puntito de color ("intento 2/5", "2 tiradas restantes hoy").
function setDailyCounter(id, text, color){
  document.getElementById(id).innerHTML = `<span class="cdot" style="background:${color}"></span>${esc(text)}`;
}
// Color del puntito según cuánto queda: verde/dorado/rojo a medida que se acaban los intentos o tiradas.
function counterColor(left, max){
  const ratio = left/max;
  return ratio<=0.34 ? 'var(--red)' : ratio<=0.67 ? 'var(--gold)' : 'var(--teal)';
}
/* ---------- adivinar el juego del día ---------- */
function renderGuessSection(){
  const wrap=document.getElementById('guessCard');
  const label=document.getElementById('dailyAttemptsLabel');
  if(!state.user){
    label.innerHTML='';
    wrap.innerHTML = emptyState(ICONS.lock, t('empty_daily_login_t'), t('empty_daily_login_s'));
    return;
  }
  renderGuessCard();
}
// Pinta la tarjeta de "adivinar el juego": las pistas (bloqueadas/reveladas
// según cuántos intentos ya se usaron), el historial de intentos previos
// (✓/✕), y el cuerpo de abajo según el estado — input+botón mientras se
// puede seguir intentando, o el resultado (ganaste / se acabaron los
// intentos) una vez que termina.
function renderGuessCard(){
  const wrap=document.getElementById('guessCard');
  const g = findGame(state.daily.gameId);
  const d = gameDetails(g) || { developer:'—', publisher:'—', year:'—', description:'', mode:'—' };
  const revealedCount = Math.min(state.daily.guesses.length+1, 5);
  const attemptsLeft = 5 - state.daily.guesses.length;
  if(state.daily.solved) setDailyCounter('dailyAttemptsLabel', t('solved_label'), 'var(--teal)');
  else if(state.daily.failed) setDailyCounter('dailyAttemptsLabel', t('exhausted_label'), 'var(--red)');
  else setDailyCounter('dailyAttemptsLabel', `${t('attempt_label')} ${state.daily.guesses.length+1}/5`, counterColor(attemptsLeft,5));

  const cluesHTML = CLUE_LABELS.map((lk,i)=>{
    const l = t(lk);
    if(i<revealedCount || state.daily.solved || state.daily.failed){
      const icon = i===0 ? (GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad)+' ' : '';
      return `<div class="clue-row"><span class="clue-label">${l}</span><span class="clue-value">${icon}${esc(clueValue(g,d,i))}</span></div>`;
    }
    return `<div class="clue-row locked"><span class="clue-label">${l}</span><span class="clue-value">${t('locked_clue')}</span></div>`;
  }).join('');

  const historyHTML = state.daily.guesses.length? `<div class="guess-history">${state.daily.guesses.map(gs=>{
    const isCorrect = slug(gs)===slug(g.title);
    return `<div class="guess-chip ${isCorrect?'correct':''}">${isCorrect?'✓':'✕'} ${esc(gs)}</div>`;
  }).join('')}</div>` : '';

  let bodyHTML;
  if(state.daily.solved){
    bodyHTML = `
      <div class="daily-result correct">
        <div class="gc-cover ${genreTint(primaryGenre(g))}" style="width:56px;height:56px;font-size:26px;" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
        <div><div class="rc-game">${esc(g.title)}</div><div class="rc-meta" style="color:var(--success-dim); font-weight:700;">${t('guess_win_line')} ${esc(d.developer)} · ${esc(String(d.year))}</div></div>
      </div>
      <button class="btn gold" id="dailyRateBtn" style="margin-top:14px;">${t('rate_this_game')}</button>`;
  } else if(state.daily.failed){
    bodyHTML = `
      <div class="daily-result">
        <div class="gc-cover ${genreTint(primaryGenre(g))}" style="width:56px;height:56px;font-size:26px;" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
        <div><div class="rc-game">${esc(g.title)}</div><div class="rc-meta">${t('guess_lose_line')}</div></div>
      </div>`;
  } else {
    bodyHTML = `
      <div class="field" style="margin-top:2px; margin-bottom:10px;">
        <input type="text" id="dailyGuessInput" list="dailyGuessList" placeholder="${esc(t('guess_input_ph'))}" autocomplete="off">
        <datalist id="dailyGuessList">${CATALOG.map(c=>`<option value="${esc(c.title)}">`).join('')}</datalist>
      </div>
      <button class="btn small" id="dailyGuessBtn">${t('guess_btn')}</button>`;
  }

  wrap.innerHTML = `<div class="clue-list">${cluesHTML}</div>${historyHTML}${bodyHTML}`;

  if(!state.daily.solved && !state.daily.failed){
    document.getElementById('dailyGuessBtn').onclick = submitDailyGuess;
    document.getElementById('dailyGuessInput').addEventListener('keydown', e=>{ if(e.key==='Enter') submitDailyGuess(); });
  }
  if(state.daily.solved){
    document.getElementById('dailyRateBtn').onclick = ()=> jumpToRate(g.id);
  }
}
// Procesa un intento: lo compara (por slug, para ignorar mayúsculas/tildes/símbolos) contra el título real, guarda el intento, marca resuelto/agotado si corresponde, persiste, y suma el día a la racha de actividad.
async function submitDailyGuess(){
  const input=document.getElementById('dailyGuessInput');
  if(!input) return;
  const raw=input.value.trim();
  if(!raw) return;
  const g=findGame(state.daily.gameId);
  const correct = slug(raw)===slug(g.title);
  state.daily.guesses.push(raw);
  if(correct) state.daily.solved=true;
  else if(state.daily.guesses.length>=5) state.daily.failed=true;
  await saveDailyState();
  await recordActivity(state.user.username, state.daily.date);
  renderGuessCard();
  if(correct){ celebrateFavorite(document.getElementById('guessCard')); toast(t('toast_guessed')); }
  else if(state.daily.failed){ toast(t('toast_out_of_guesses')); }
}
/* ---------- ruleta del día ---------- */
const MAX_SPINS = 3; // tiradas de ruleta por día por usuario
function spinsLeftText(left){
  return state.lang==='en' ? `${left} spin${left===1?'':'s'} left today` : `${left} tirada${left===1?'':'s'} restante${left===1?'':'s'} hoy`;
}
// Pinta los chips de alcance (catálogo/biblioteca/género, con el <select>
// de género que solo se muestra si "género" está elegido), los 3 rodillos,
// y el botón de girar (deshabilitado si ya no quedan tiradas hoy). Cambiar
// de chip vuelve a llamar a esta misma función para redibujar todo — no
// hace falta guardar el resultado anterior de la ruleta al cambiar de
// alcance, se pierde a propósito (tiene sentido: cambiaste de idea de qué
// quieres que te recomiende).
function renderRouletteSection(){
  const wrap=document.getElementById('rouletteCard');
  const left = Math.max(0, MAX_SPINS - state.daily.rouletteSpins);
  setDailyCounter('spinsLeftLabel', spinsLeftText(left), counterColor(left, MAX_SPINS));
  const scope = state.rouletteScope || 'catalog';
  if(!state.rouletteGenre) state.rouletteGenre = GENRE_ORDER[0];
  wrap.innerHTML = `
    <div class="roulette-scope">
      <button type="button" class="chip ${scope==='catalog'?'active':''}" data-scope="catalog">${esc(t('roulette_scope_catalog'))}</button>
      <button type="button" class="chip ${scope==='library'?'active':''}" data-scope="library">${esc(t('roulette_scope_library'))}</button>
      <button type="button" class="chip ${scope==='genre'?'active':''}" data-scope="genre">${esc(t('roulette_scope_genre'))}</button>
      <select id="rouletteGenreSelect" aria-label="${esc(t('roulette_scope_genre'))}" ${scope==='genre'?'':'hidden'}>
        ${GENRE_ORDER.map(g=>`<option value="${esc(g)}" ${g===state.rouletteGenre?'selected':''}>${esc(genreLabel(g))}</option>`).join('')}
      </select>
    </div>
    <div class="reel-row" id="reelRow"><div class="reel">${ICONS.gamepad}</div><div class="reel">${ICONS.gamepad}</div><div class="reel">${ICONS.gamepad}</div></div>
    <button class="btn gold small" id="spinBtn" style="margin:14px auto 0; display:flex;" ${left<=0?'disabled':''}>${left<=0? t('no_spins_today') : t('spin_btn')}</button>
    <div id="rouletteResult"></div>`;
  wrap.querySelectorAll('[data-scope]').forEach(btn=>{
    btn.onclick = ()=>{ state.rouletteScope = btn.dataset.scope; renderRouletteSection(); };
  });
  const genreSelect = document.getElementById('rouletteGenreSelect');
  if(genreSelect) genreSelect.onchange = (e)=>{ state.rouletteGenre = e.target.value; };
  if(left>0) document.getElementById('spinBtn').onclick = spinRoulette;
}
// De una lista de juegos, saca los que el usuario YA calificó (para que la
// ruleta priorice recomendar cosas nuevas) — pero si eso deja la lista
// vacía (ya calificaste todo lo que había en ese conjunto), devuelve la
// lista COMPLETA sin filtrar en vez de dejar la ruleta sin nada para tirar.
function unratedFrom(pool){
  if(!state.user) return pool;
  const ratedIds = new Set(state.reviews.filter(r=>r.username===state.user.username).map(r=>r.gameId));
  const filtered = pool.filter(g=>!ratedIds.has(g.id));
  return filtered.length? filtered : pool;
}
function unratedCatalogGames(){ return unratedFrom(CATALOG); }
// El conjunto de juegos del que puede salir el resultado de la ruleta,
// según el alcance elegido (state.rouletteScope): todo el catálogo, solo
// tu biblioteca, o solo un género — siempre pasado por unratedFrom(). Si
// el alcance elegido no tiene NINGÚN juego (biblioteca vacía, por
// ejemplo), devuelve null en vez de un array vacío, para que spinRoulette
// sepa que tiene que avisar en vez de girar.
function rouletteScopePool(){
  const scope = state.rouletteScope || 'catalog';
  if(scope==='library'){
    const ids = new Set((state.user && state.user.wishlist)||[]);
    const lib = CATALOG.filter(g=>ids.has(g.id));
    return lib.length? unratedFrom(lib) : null;
  }
  if(scope==='genre'){
    const genre = state.rouletteGenre;
    const byGenre = CATALOG.filter(g=> (g.genres&&g.genres.length? g.genres : [g.genre||'Otro']).includes(genre));
    return byGenre.length? unratedFrom(byGenre) : null;
  }
  return unratedCatalogGames();
}
// Anima los 3 rodillos (íconos de género al azar cambiando rápido durante
// ~1.1s) y al final elige un juego al azar del pool actual, lo muestra, y
// descuenta una tirada. Si el pool está vacío (rouletteScopePool devolvió
// null), avisa por toast y no gasta la tirada.
function spinRoulette(){
  if(state.daily.rouletteSpins>=MAX_SPINS){ toast(t('toast_out_of_spins')); return; }
  const pool = rouletteScopePool();
  if(!pool || !pool.length){ toast(t('toast_roulette_empty_pool')); return; }
  const reels = document.querySelectorAll('#reelRow .reel');
  const btn = document.getElementById('spinBtn');
  btn.disabled = true;
  reels.forEach(r=> r.classList.add('spinning'));
  const emojis = Object.values(GENRE_EMOJI);
  const ratedCount = state.user ? state.reviews.filter(r=>r.username===state.user.username).length : 0;
  const allRated = state.user && ratedCount>0 && pool.length===CATALOG.length;
  let ticks=0;
  const iv = setInterval(()=>{
    reels.forEach(r=> r.innerHTML = emojis[Math.floor(Math.random()*emojis.length)]);
    ticks++;
    if(ticks>14){
      clearInterval(iv);
      reels.forEach(r=> r.classList.remove('spinning'));
      const pick = pool[Math.floor(Math.random()*pool.length)];
      reels.forEach(r=> r.innerHTML = GENRE_EMOJI[primaryGenre(pick)]||ICONS.gamepad);
      showRouletteResult(pick);
      if(allRated) toast(t('toast_all_rated'));
      state.daily.rouletteSpins++;
      saveDailyState();
      const left = Math.max(0, MAX_SPINS - state.daily.rouletteSpins);
      setDailyCounter('spinsLeftLabel', spinsLeftText(left), counterColor(left, MAX_SPINS));
      if(left<=0){ btn.disabled=true; btn.textContent=t('no_spins_today'); }
      else{ btn.disabled=false; }
    }
  }, 80);
}
// Pinta el juego que salió de la ruleta (portada + título + botón calificar), clickeable para ir directo a su ficha.
function showRouletteResult(g){
  const d = gameDetails(g);
  document.getElementById('rouletteResult').innerHTML = `
    <div class="daily-result win clickable" id="rouletteResultBar" style="margin-top:16px;">
      <div class="gc-cover ${genreTint(primaryGenre(g))}" style="width:56px;height:56px;font-size:26px;" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
      <div><div class="rc-game">${esc(g.title)}</div><div class="rc-meta">${esc(genreLabelList(g))}${d? ' · '+esc(String(d.year)) : ''}</div></div>
    </div>
    <button class="btn small" id="rouletteRateBtn" style="margin-top:12px;">${t('rate_this_game')}</button>`;
  document.getElementById('rouletteResultBar').onclick = ()=>{ state.currentGame=g.id; state.gameOrigin='daily'; goView('game'); };
  document.getElementById('rouletteRateBtn').onclick = (e)=>{ e.stopPropagation(); jumpToRate(g.id); };
}

