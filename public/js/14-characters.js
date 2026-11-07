/**
 * ARCHIVO 14 de 16 — Calificación de personajes: la lista de "Personajes"
 * (icónicos/protagonistas, separados de los juegos) y la ficha de detalle
 * de cada uno.
 *
 * Es un espejo bastante más chico de lo que 08-browse.js hace para un
 * juego (grilla filtrable + ficha con calificación rápida y reseñas), pero
 * OJO: no comparte código con esas funciones a propósito. Las reseñas de
 * personaje son un tipo de reseña totalmente aparte de las de juego — viven
 * en su propia tabla del lado del servidor (character_reviews, no
 * reviews), su propio state (state.characterReviews, no state.reviews), y
 * no tienen plataformas ni votos de "te sirvió" (los juegos sí). Por eso
 * cada pieza (calificación rápida, bloque de reseña, card de reseña) tiene
 * acá su propia versión más simple en vez de generalizar la de juegos.
 */
/* ---------- avatar circular de un personaje (foto real, o iniciales de color si no tiene) ---------- */
// Mismo patrón que el avatar por-defecto del usuario en el header (ver renderUserBadge en 05-navigation.js): un círculo de color estable según el nombre, con la primera letra. Achica la clase extra (p.ej. "char-avatar-lg") para el tamaño grande de la ficha.
function charAvatarHTML(c, extraClass){
  const cls = 'char-avatar' + (extraClass ? ' '+extraClass : '');
  if(c.photoUrl) return `<div class="${cls} has-photo"><img src="${esc(c.photoUrl)}" alt=""></div>`;
  const color = AVATAR_COLORS[Math.abs(hashStr(c.name))%AVATAR_COLORS.length];
  return `<div class="${cls}" style="background:${color}">${esc((c.name[0]||'?').toUpperCase())}</div>`;
}
// Cantidad de reseñas y nota promedio (redondeada a 1 decimal) de un personaje.
function characterStats(characterId){
  const rvs = state.characterReviews.filter(r=>r.characterId===characterId);
  const rated = rvs.filter(r=>r.rating!=null);
  const avg = rated.length? (rated.reduce((s,r)=>s+r.rating,0)/rated.length) : 0;
  return { count: rvs.length, avg: Math.round(avg*10)/10, ratedCount: rated.length };
}
// Todos los juegos a los que pertenece un personaje (game_ids), como objetos de juego reales (se filtran los que ya no existen).
function characterGames(c){
  const ids = (c.gameIds && c.gameIds.length) ? c.gameIds : (c.gameId ? [c.gameId] : []);
  return ids.map(findGame).filter(Boolean);
}
// El juego cuya portada hay que usar de banner en la ficha: el elegido a mano en el admin (bannerGameId) o, si el
// personaje pertenece a un solo juego, ese — con varios juegos y sin elección explícita, no hay banner de juego.
function characterBannerGame(c){
  if(c.bannerGameId){ const g = findGame(c.bannerGameId); if(g) return g; }
  const games = characterGames(c);
  return games.length===1 ? games[0] : null;
}
// Ícono de medalla para el podio de más valorados (1º/2º/3º) en la grilla de Personajes.
const CHAR_RANK_ICON = { 1: ICONS.crown, 2: ICONS.medal, 3: ICONS.medal };

// Claves de categoría: las mismas que CHARACTER_CATEGORIES de server/index.js y admin.js.
const CHAR_CATEGORIES = ['protagonist','coprotagonist','villain','ally','secondary'];
const CHAR_SORT_KEYS = ['rating_desc','reviews','recent','az'];
// Fecha de salida de un juego (ms): la fecha exacta si es un lanzamiento nuevo con fecha cargada, si no el 1° de enero de su año; 0 si no hay dato.
function gameReleaseTime(g){
  const exact = g.newReleaseDate ? Date.parse(g.newReleaseDate) : NaN;
  if(!isNaN(exact)) return exact;
  return g.releaseYear ? Date.UTC(g.releaseYear, 0, 1) : 0;
}
// "Más recientes" en Personajes mide la salida del juego más nuevo al que pertenece el personaje (no cuándo se cargó en el admin); los que no tienen juegos o datos quedan al final.
function characterReleaseTime(c){ return Math.max(0, ...characterGames(c).map(gameReleaseTime)); }
const CHAR_SORTS = {
  rating_desc: (a,b)=> characterStats(b.id).avg - characterStats(a.id).avg || a.name.localeCompare(b.name),
  reviews: (a,b)=> characterStats(b.id).count - characterStats(a.id).count || a.name.localeCompare(b.name),
  recent: (a,b)=> characterReleaseTime(b) - characterReleaseTime(a) || a.name.localeCompare(b.name),
  az: (a,b)=> a.name.localeCompare(b.name),
};
// Filtros/orden vigentes de la grilla de Personajes (el orden se recuerda entre visitas, igual que en Explorar).
const charView = { category:'', game:'', sort: (function(){ try{ const v=localStorage.getItem('charSortMode'); return CHAR_SORT_KEYS.includes(v) ? v : 'rating_desc'; }catch(e){ return 'rating_desc'; } })() };
// Etiquetas de categoría ("Villano", "Aliado"…) de un personaje, o '' si no tiene ninguna.
function charCategoryTagHTML(c){
  const tags = (c.categories||[]).filter(k=>CHAR_CATEGORIES.includes(k)).map(k=>`<span class="char-cat-tag cat-${k}">${esc(t('char_cat_'+k))}</span>`);
  return tags.length ? `<div class="char-cat-tags">${tags.join('')}</div>` : '';
}
// Esqueleto de una card de personaje (retrato circular + dos líneas) para mientras cargan los datos.
function charSkeletonHTML(){
  return `<div class="card gamecard character-card skeleton-card"><div class="char-card-avatar-wrap"><div class="skel skel-avatar"></div></div><div class="skel skel-title" style="margin:0 auto 10px;"></div><div class="skel skel-line" style="margin:0 auto;"></div></div>`;
}
// Posición (1º, 2º, 3º…) de cada personaje con al menos una calificación, calculada sobre TODOS los personajes — así el podio no cambia al filtrar u ordenar la grilla de otra forma.
function characterRanks(){
  const ranks = new Map();
  allCharacters().filter(c=>characterStats(c.id).ratedCount>0).sort(CHAR_SORTS.rating_desc).forEach((c,i)=> ranks.set(c.id, i+1));
  return ranks;
}

/* ---------- vista "Personajes" (grilla) ---------- */
// Arma los CONTROLES de la vista (chips de categoría, filtro de juego, orden, botones de Versus/Sugerir) y los engancha; la grilla en sí la pinta paintCharactersGrid(), que se vuelve a llamar cada vez que cambia algo.
function renderCharactersBrowse(){
  document.getElementById('charactersSearch').oninput = ()=> paintCharactersGrid();
  wireSearchClear('charactersSearch');
  const chipWrap = document.getElementById('charactersCategoryChips');
  chipWrap.innerHTML = ['', ...CHAR_CATEGORIES].map(k=>`<button type="button" class="chip ${charView.category===k?'active':''}" data-cat="${k}">${esc(k? t('char_cat_'+k) : t('chars_cat_all'))}</button>`).join('');
  chipWrap.querySelectorAll('.chip').forEach(b=> b.onclick = ()=>{
    charView.category = b.dataset.cat;
    chipWrap.querySelectorAll('.chip').forEach(x=> x.classList.toggle('active', x===b));
    paintCharactersGrid(true);
  });
  const gameIds = new Set(allCharacters().flatMap(c=>characterGames(c).map(g=>g.id)));
  const gameSel = document.getElementById('charactersGameSelect');
  if(!gameIds.has(charView.game)) charView.game = '';
  gameSel.innerHTML = `<option value="">${esc(t('chars_all_games'))}</option>` + allGames().filter(g=>gameIds.has(g.id)).sort((a,b)=>a.title.localeCompare(b.title)).map(g=>`<option value="${esc(g.id)}" ${g.id===charView.game?'selected':''}>${esc(g.title)}</option>`).join('');
  gameSel.onchange = ()=>{ charView.game = gameSel.value; paintCharactersGrid(true); };
  const sortSel = document.getElementById('charactersSortSelect');
  sortSel.innerHTML = CHAR_SORT_KEYS.map(k=>`<option value="${k}" ${k===charView.sort?'selected':''}>${esc(t('char_sort_'+k))}</option>`).join('');
  sortSel.onchange = ()=>{
    charView.sort = sortSel.value;
    try{ localStorage.setItem('charSortMode', charView.sort); }catch(e){}
    paintCharactersGrid(true);
  };
  document.getElementById('charactersVersusBtn').onclick = ()=> openVersusModal();
  document.getElementById('charactersSuggestBtn').onclick = ()=> openSuggestCharacterModal();
  paintCharactersGrid(true);
}
// animate=true: las cards entran escalonadas (carga de la vista o cambio de filtro/orden). Se pasa false al tipear en el buscador, para que no "parpadee" con cada letra.
function paintCharactersGrid(animate){
  const grid = document.getElementById('charactersGrid');
  const q = foldText(document.getElementById('charactersSearch').value).trim();
  const all = allCharacters();
  let list = all.filter(c=>
    foldText(c.name).includes(q)
    && (!charView.category || (c.categories||[]).includes(charView.category))
    && (!charView.game || characterGames(c).some(g=>g.id===charView.game)));
  document.getElementById('charactersCount').textContent = list.length;
  if(list.length===0){
    grid.innerHTML = all.length===0
      ? emptyState(ICONS.user, t('empty_characters_t'), t('empty_characters_s'))
      : emptyState(ICONS.search, t('empty_browse_t'), t('empty_browse_s'));
    return;
  }
  list = list.sort(CHAR_SORTS[charView.sort] || CHAR_SORTS.rating_desc);
  grid.innerHTML='';
  // El podio (1º/2º/3º con medalla, y el 1º además con el borde animado de "destacado") solo cuenta personajes que
  // ya tienen alguna calificación — así nadie gana una medalla por estar primero en orden alfabético sin nota.
  const ranks = characterRanks();
  list.forEach((c,i)=>{
    const st = characterStats(c.id);
    const rank = ranks.get(c.id) || 0;
    const games = characterGames(c);
    const gameNames = games.map(g=>g.title).join(', ');
    const card = document.createElement('div');
    card.className = 'card gamecard character-card' + (rank===1? ' featured' : '') + (animate? ' enter' : '');
    if(animate){
      card.style.setProperty('--i', Math.min(i, 12));
      // animationcancel también: en la card destacada, el hover cambia de animación a mitad de la entrada, y sin quitar .enter acá la entrada se reiniciaría al sacar el mouse.
      const done = e=>{ if(e.target===card) card.classList.remove('enter'); };
      card.addEventListener('animationend', done);
      card.addEventListener('animationcancel', done);
    }
    card.innerHTML = `
      <div class="char-card-avatar-wrap">
        ${charAvatarHTML(c)}
        ${rank>=1 && rank<=3? `<span class="char-rank-badge rank-${rank}">${CHAR_RANK_ICON[rank]}</span>` : ''}
      </div>
      <div class="gc-title">${esc(c.name)}</div>
      ${charCategoryTagHTML(c)}
      <div class="gc-sub">${gameNames? esc(gameNames)+' · ' : ''}${reviewsCountText(st.count)} · ${st.count? st.avg+'/10':(state.lang==='en'?'no rating':'sin nota')}</div>
    `;
    card.onclick = ()=>{ state.currentCharacter=c.id; goView('character'); };
    grid.appendChild(card);
  });
}

/* ---------- ficha de detalle de un personaje ---------- */
function renderCharacterDetail(){
  const c = findCharacter(state.currentCharacter);
  const el = document.getElementById('characterDetail');
  if(!c){ el.innerHTML = emptyState(ICONS.helpCircle, t('empty_character_notfound_t'), t('empty_character_notfound_s')); return; }
  if(state.charReviewEditingCharacterId !== c.id){ state.charReviewEditing = false; }
  const st = characterStats(c.id);
  const games = characterGames(c);
  const bannerGame = !c.bannerUrl ? characterBannerGame(c) : null;
  const rvs = state.characterReviews.filter(r=>r.characterId===c.id && hasReviewContent(r)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const myReview = state.user ? state.characterReviews.find(r=>r.characterId===c.id && r.username===state.user.username) : null;
  // Banner de la ficha: la portada especial subida a mano, si hay una; si no, la del juego elegido (o el único
  // juego, si solo pertenece a uno) — que se pinta con loadHeroCover (más abajo); si nada de eso
  // aplica, la propia foto del personaje como para no dejar la ficha sin ningún fondo.
  const heroBgHTML = c.bannerUrl
    ? `<div class="game-hero-bg has-cover" style="background-image:url('${esc(c.bannerUrl)}')"></div>`
    : bannerGame
      ? `<div class="game-hero-bg" id="charHeroBg"></div>`
      : c.photoUrl
        ? `<div class="game-hero-bg has-cover" style="background-image:url('${esc(c.photoUrl)}')"></div>`
        : '';
  const gamesMetaHTML = games.length
    ? `${t('character_of_label')} ${games.map(g=>`<span class="rc-author" role="link" tabindex="0" data-game-id="${esc(g.id)}">${esc(g.title)}</span>`).join(', ')} · `
    : '';
  el.innerHTML = `
    <div class="layout-rail"><div class="rail-main">
    <div class="game-hero">
      ${heroBgHTML}
      <div class="card game-hero-card">
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
          ${charAvatarHTML(c, 'char-avatar-lg')}
          <div style="flex:1; min-width:180px;">
            <div class="rc-game" style="font-size:22px;">${esc(c.name)}</div>
            <div class="rc-meta">${gamesMetaHTML}${reviewsCountText(st.count)}</div>
            ${charCategoryTagHTML(c)}
          </div>
          <button class="wishlist-btn" id="charVersusBtn">${t('versus_btn')}</button>
        </div>
        ${c.description? `<p class="game-desc">${esc(c.description)}</p>` : `<p class="nodetails">${t('character_no_description_note')}</p>`}
        <div style="margin-top:16px;" id="charDetailGauge"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:22px;" id="charRateReviewCard">
      <div class="field">
        <label>${t('add_rating_label')}</label>
        ${!state.user ? `<p class="hint">${t('login_to_rate_character_hint')}</p>` : `
        <div class="ratebox">
          <div class="rate-readout">
            <span class="rate-num" id="cqrNum">—</span><span class="rate-outof">/10</span><span class="sparkle" id="cqrSparkle">${ICONS.sparkles}</span>
            <div class="rate-mood" id="cqrMood"></div>
          </div>
          <div class="rate-buttons" id="cqrButtons"></div>
          <button type="button" class="clear-rating-btn" id="cqrClearBtn" hidden>${esc(t('clear_rating_btn'))}</button>
        </div>`}
      </div>
      <div class="field" style="margin-top:6px; padding-top:16px; border-top:1px dashed var(--line-dark);">
        <label>${t('add_review_label')}</label>
        ${!state.user ? `<p class="hint">${t('login_to_review_hint')}</p>` : `<div id="charReviewBlock"></div>`}
      </div>
    </div>

    <div class="sectionhead"><h2>${t('reviews_section_title')}</h2><span class="count">${rvs.length}</span></div>
    <div id="charDetailList"></div>
    </div><aside class="rail" id="charRail"></aside></div>
  `;
  renderCharacterRail(c);
  renderGauge(document.getElementById('charDetailGauge'), st.avg||0);
  if(bannerGame){
    loadHeroCover(document.getElementById('charHeroBg'), bannerGame.coverUrl);
  }
  el.querySelectorAll('[data-game-id]').forEach(elGame=>{
    elGame.onclick = ()=>{ state.currentGame=elGame.dataset.gameId; state.gameOrigin='browse'; goView('game'); };
  });
  if(state.user){
    renderQuickRateChar('cqr', c.id, myReview? myReview.rating : null);
    renderCharReviewBlock(c.id, myReview);
  }
  document.getElementById('characterBackBtn').onclick = ()=> goView('characters');
  document.getElementById('charVersusBtn').onclick = ()=> openVersusModal(c.id);
  const list = document.getElementById('charDetailList');
  if(rvs.length===0){
    list.innerHTML = emptyState(ICONS.fileText, t('empty_reviews_t'), t('empty_reviews_s'));
  } else {
    rvs.forEach(rv=> list.appendChild(characterReviewCard(rv)));
  }
}

/* ---------- personajes dentro de la ficha de un juego ---------- */
// "Personajes de este juego": fila de chips (retrato + nombre + nota) que llevan a la ficha de cada uno. Devuelve '' si el juego no tiene ninguno. Lo llama renderGameDetail (08-browse.js), que después engancha los clicks con wireGameCharacters.
function gameCharactersHTML(g){
  const chars = allCharacters().filter(c=>characterGames(c).some(x=>x.id===g.id)).sort(CHAR_SORTS.rating_desc);
  if(!chars.length) return '';
  return `
    <div class="sectionhead"><h2>${t('chars_of_game_title')}</h2><span class="count">${chars.length}</span></div>
    <div class="game-chars">${chars.map(c=>{
      const st = characterStats(c.id);
      return `<button type="button" class="game-char-chip" data-char-id="${esc(c.id)}">${charAvatarHTML(c)}<span class="gcc-name">${esc(c.name)}</span><span class="gcc-score">${st.ratedCount? st.avg+'/10' : '—'}</span></button>`;
    }).join('')}</div>`;
}
function wireGameCharacters(root){
  root.querySelectorAll('[data-char-id]').forEach(b=> b.onclick = ()=>{ state.currentCharacter=b.dataset.charId; goView('character'); });
}

/* ---------- Versus: comparar dos personajes lado a lado ---------- */
function characterWrittenCount(characterId){
  return state.characterReviews.filter(r=>r.characterId===characterId && hasReviewContent(r)).length;
}
function versusSideHTML(c, win){
  const games = characterGames(c).map(g=>g.title).join(', ');
  return `<div class="versus-side ${win?'winner':''}">
    ${win? `<span class="versus-crown">${ICONS.crown}</span>` : ''}
    ${charAvatarHTML(c, 'char-avatar-lg')}
    <div class="versus-name">${esc(c.name)}</div>
    ${charCategoryTagHTML(c)}
    <div class="versus-games">${esc(games || '—')}</div>
  </div>`;
}
// Pinta el resultado de comparar a y b: ganador por nota promedio (empate si es igual) y una fila por métrica con el valor más alto resaltado.
function versusResultHTML(a, b){
  if(!a || !b || a.id===b.id) return `<p class="hint versus-hint">${esc(t('versus_need_two'))}</p>`;
  const sa = characterStats(a.id), sb = characterStats(b.id);
  const winner = sa.avg===sb.avg ? null : (sa.avg>sb.avg ? a : b);
  const rows = [
    [t('versus_metric_avg'), sa.avg, sb.avg, v=> v? v+'/10' : '—'],
    [t('versus_metric_rated'), sa.ratedCount, sb.ratedCount, v=>v],
    [t('versus_metric_reviews'), characterWrittenCount(a.id), characterWrittenCount(b.id), v=>v],
  ];
  return `
    <div class="versus-verdict">${winner? esc(t('versus_winner')+': '+winner.name) : esc(t('versus_tie'))}</div>
    <div class="versus-sides">${versusSideHTML(a, winner===a)}${versusSideHTML(b, winner===b)}</div>
    <div class="versus-rows">${rows.map(([label, va, vb, fmt])=>`
      <div class="versus-row">
        <span class="${va>vb?'win':''}">${esc(String(fmt(va)))}</span>
        <span class="versus-label">${esc(label)}</span>
        <span class="${vb>va?'win':''}">${esc(String(fmt(vb)))}</span>
      </div>`).join('')}</div>`;
}
// Modal de Versus. presetId (opcional) deja el primer personaje ya elegido — se usa desde la ficha de un personaje.
function openVersusModal(presetId){
  const chars = allCharacters().slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(chars.length<2){ toast(t('versus_need_two')); return; }
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  const options = selected => `<option value="">${esc(t('versus_pick_ph'))}</option>` + chars.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal versus-modal">
      <h3>${esc(t('versus_title'))}</h3>
      <div class="versus-pickers">
        <select id="vsA">${options(presetId)}</select>
        <span class="versus-vs">VS</span>
        <select id="vsB">${options('')}</select>
      </div>
      <div id="vsResult"></div>
      <div class="confirm-actions"><button class="btn-ghost" data-act="close">${esc(t('versus_close_btn'))}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const selA = overlay.querySelector('#vsA'), selB = overlay.querySelector('#vsB'), out = overlay.querySelector('#vsResult');
  const paint = ()=>{ out.innerHTML = versusResultHTML(findCharacter(selA.value), findCharacter(selB.value)); };
  selA.onchange = selB.onchange = paint;
  paint();
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="close"]').onclick = cleanup;
}

/* ---------- sugerir un personaje ---------- */
// Mismo formulario simple que "Sugerir un juego" (openSuggestModal, 07-stats-share-modals.js) y misma bandeja del admin: manda a /api/suggestions con kind:'character'.
function openSuggestCharacterModal(){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal">
      <h3>${esc(t('suggest_character_modal_title'))}</h3>
      <div class="field">
        <label for="sc-name">${esc(t('suggest_character_name_label'))}</label>
        <input type="text" id="sc-name" maxlength="80" placeholder="${esc(t('suggest_character_name_ph'))}">
      </div>
      <div class="field">
        <label for="sc-game">${esc(t('suggest_character_game_label'))}</label>
        <input type="text" id="sc-game" maxlength="80" list="scGameList" placeholder="${esc(t('suggest_character_game_ph'))}">
        <datalist id="scGameList">${allGames().map(g=>`<option value="${esc(g.title)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label>${esc(t('suggest_character_category_label'))}</label>
        <div class="filterbar" id="scCategories" style="margin:0;">${CHAR_CATEGORIES.map(k=>`<button type="button" class="chip" data-cat="${k}">${esc(t('char_cat_'+k))}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="sc-note">${esc(t('suggest_note_label'))}</label>
        <textarea id="sc-note" maxlength="300" placeholder="${esc(t('suggest_character_note_ph'))}" style="min-height:60px;"></textarea>
      </div>
      <div class="error" id="scError" hidden></div>
      <div class="confirm-actions">
        <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
        <button class="btn gold" data-act="send">${esc(t('suggest_submit_btn'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('#scCategories .chip').forEach(b=> b.onclick = ()=> b.classList.toggle('active'));
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="cancel"]').onclick = cleanup;
  overlay.querySelector('[data-act="send"]').onclick = async ()=>{
    const errEl = overlay.querySelector('#scError');
    errEl.hidden = true;
    const title = overlay.querySelector('#sc-name').value.trim();
    if(title.length<2){ errEl.textContent = t('suggest_character_err_name'); errEl.hidden = false; return; }
    try{
      await apiPost('/suggestions', {
        kind: 'character', title,
        relatedGame: overlay.querySelector('#sc-game').value.trim() || undefined,
        categories: [...overlay.querySelectorAll('#scCategories .chip.active')].map(b=>b.dataset.cat),
        note: overlay.querySelector('#sc-note').value.trim() || undefined,
      });
      toast(t('toast_suggestion_sent'));
      cleanup();
    }catch(e){ errEl.textContent = t('err_send_suggestion'); errEl.hidden = false; }
  };
  overlay.querySelector('#sc-name').focus();
}

/* ---------- calificación rápida de un personaje (espejo simplificado de renderQuickRate, sin plataformas) ---------- */
function renderQuickRateChar(scope, characterId, currentValue){
  const wrap = document.getElementById(scope+'Buttons');
  if(!wrap) return;
  let current = currentValue;
  wrap.innerHTML='';
  for(let i=1;i<=10;i++){
    const b=document.createElement('button');
    b.type='button'; b.className='rate-btn'; b.textContent=i; b.setAttribute('aria-label', i+' '+t('rate_out_of_ten'));
    b.addEventListener('mouseenter', ()=> paintQuickRate(wrap, i));
    b.addEventListener('mouseleave', ()=> paintQuickRate(wrap, current));
    b.addEventListener('click', async ()=>{
      current=i;
      paintQuickRate(wrap, i);
      updateQuickReadout(scope, i, true, MOOD_CHARACTER);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if(await saveCharRating(characterId, i)){
        if(i>=9) celebrateFavorite(wrap);
        toast(t('toast_rating_saved'));
      }
      renderCharacterDetail();
    });
    wrap.appendChild(b);
  }
  paintQuickRate(wrap, current);
  updateQuickReadout(scope, current, false, MOOD_CHARACTER);
  const clearBtn = document.getElementById(scope+'ClearBtn');
  if(clearBtn) clearBtn.onclick = ()=> deleteCharRating(characterId);
}
async function saveCharRating(characterId, rating){
  if(!state.user) return false;
  let rv = state.characterReviews.find(r=>r.characterId===characterId && r.username===state.user.username);
  if(rv){ rv.rating=rating; rv.date=new Date().toISOString(); }
  else { rv = { id:uid(), characterId, username:state.user.username, rating, text:'', date:new Date().toISOString() }; state.characterReviews.push(rv); }
  return persistOrResync(()=> apiPut('/character-reviews/'+encodeURIComponent(characterId), { rating }));
}
async function saveCharReviewText(characterId, text){
  if(!state.user) return false;
  let rv = state.characterReviews.find(r=>r.characterId===characterId && r.username===state.user.username);
  if(rv){ rv.text=text; rv.date=new Date().toISOString(); }
  else { rv = { id:uid(), characterId, username:state.user.username, rating:null, text, date:new Date().toISOString() }; state.characterReviews.push(rv); }
  return persistOrResync(()=> apiPut('/character-reviews/'+encodeURIComponent(characterId), { text }));
}
async function deleteCharReviewText(characterId){
  if(!await confirmDialog(t('confirm_delete_review_only'))) return;
  const rv = state.characterReviews.find(r=>r.characterId===characterId && r.username===state.user.username);
  if(!rv) return;
  rv.text = '';
  if(rv.rating==null) state.characterReviews = state.characterReviews.filter(r=>r.id!==rv.id);
  if(await persistOrResync(()=> apiDelete('/character-reviews/'+encodeURIComponent(characterId)+'/text'))) toast(t('toast_review_deleted'));
  renderCharacterDetail();
}
async function deleteCharRating(characterId){
  if(!await confirmDialog(t('confirm_clear_rating'))) return;
  const rv = state.characterReviews.find(r=>r.characterId===characterId && r.username===state.user.username);
  if(!rv) return;
  rv.rating = null;
  if(!rv.text || !rv.text.trim()) state.characterReviews = state.characterReviews.filter(r=>r.id!==rv.id);
  if(await persistOrResync(()=> apiDelete('/character-reviews/'+encodeURIComponent(characterId)+'/rating'))) toast(t('toast_rating_removed'));
  renderCharacterDetail();
}
async function deleteCharacterReview(id){
  if(!await confirmDialog(t('confirm_delete'))) return;
  state.characterReviews = state.characterReviews.filter(r=>r.id!==id);
  if(await persistOrResync(()=> apiDelete('/character-reviews/id/'+encodeURIComponent(id)))) toast(t('toast_review_deleted'));
  renderCharacterDetail();
}
// Bloque de texto de la reseña en la ficha de un personaje — mismos 3 estados que renderReviewBlock (escribir/ver/editar), pero leyendo y escribiendo en state.charReviewEditing en vez de state.reviewEditing.
function renderCharReviewBlock(characterId, myReview){
  const wrap = document.getElementById('charReviewBlock');
  if(!wrap) return;
  const hasText = myReview && myReview.text && myReview.text.trim().length>0;
  if(!state.charReviewEditing){
    if(hasText){
      wrap.innerHTML = `
        <p class="rc-text" style="margin-top:8px;">${esc(myReview.text)}</p>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;">
          <button class="btn small" id="editCharReviewBtn">${t('edit_your_review')}</button>
          <button class="icon-btn" id="deleteCharReviewTextBtn">${t('delete_review_only_btn')}</button>
        </div>`;
      document.getElementById('editCharReviewBtn').onclick = ()=>{ state.charReviewEditing=true; state.charReviewEditingCharacterId=characterId; renderCharReviewBlock(characterId, myReview); };
      document.getElementById('deleteCharReviewTextBtn').onclick = ()=> deleteCharReviewText(characterId);
    } else {
      wrap.innerHTML = `<button class="btn small" id="writeCharReviewBtn" style="margin-top:8px;">${t('write_review_btn')}</button>`;
      document.getElementById('writeCharReviewBtn').onclick = ()=>{ state.charReviewEditing=true; state.charReviewEditingCharacterId=characterId; renderCharReviewBlock(characterId, myReview); };
    }
  } else {
    wrap.innerHTML = `
      <textarea id="charReviewTextInput" maxlength="600" placeholder="${esc(t('add_review_ph'))}" style="margin-top:8px;">${esc(hasText?myReview.text:'')}</textarea>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn gold small" id="saveCharReviewBtn">${t('save_review_btn')}</button>
        <button class="linklike" id="cancelCharReviewBtn">${t('cancel_btn')}</button>
      </div>
      <div class="error" id="charReviewError" hidden></div>`;
    document.getElementById('saveCharReviewBtn').onclick = async ()=>{
      const input=document.getElementById('charReviewTextInput');
      const errEl=document.getElementById('charReviewError');
      const text=input.value.trim();
      if(text.length<10){ errEl.textContent=t('toast_write_more'); errEl.hidden=false; return; }
      if(!await saveCharReviewText(characterId, text)){ errEl.textContent=t('err_save_review'); errEl.hidden=false; return; } // el texto escrito queda en el cuadro para reintentar
      state.charReviewEditing=false;
      toast(t('toast_review_published'));
      renderCharacterDetail();
    };
    document.getElementById('cancelCharReviewBtn').onclick = ()=>{ state.charReviewEditing=false; renderCharReviewBlock(characterId, myReview); };
  }
}
// Card de una reseña de personaje — versión simple de reviewCard (08-browse.js): sin plataformas, sin voto de "te sirvió", sin compartir. Solo autor+fecha, texto, nota, y borrar si es tuya.
function characterReviewCard(rv){
  const c = findCharacter(rv.characterId) || {name:'(personaje eliminado)'};
  const div=document.createElement('div');
  div.className='card reviewcard';
  const mine = state.user && state.user.username===rv.username;
  const hasText = rv.text && rv.text.trim().length>0;
  div.innerHTML = `
    <div class="rc-top">
      <div>
        <div class="rc-game">${esc(c.name)}</div>
        <div class="rc-meta"><span class="rc-author" role="link" tabindex="0" data-username="${esc(rv.username)}">${esc(rv.username)}</span> · ${fmtDate(rv.date)}</div>
      </div>
    </div>
    ${hasText? `<p class="rc-text">${esc(rv.text)}</p>` : `<p class="rc-text" style="color:var(--ink-soft); font-style:italic;">${esc(t('no_written_review'))}</p>`}
    <div class="cardfoot">
      <div id="char-gauge-${rv.id}">${rv.rating==null? `<span class="no-rating-tag">${t('no_rating_yet')}</span>` : ''}</div>
      ${mine? `<div class="rc-actions"><button class="icon-btn" data-del-char-review="${rv.id}">${t('delete_btn')}</button></div>` : ''}
    </div>
  `;
  if(rv.rating!=null) renderGauge(div.querySelector(`#char-gauge-${rv.id}`), rv.rating);
  div.querySelector('.rc-author').onclick=()=>{ state.profileUsername = rv.username; goView('profile'); };
  if(mine) div.querySelector('[data-del-char-review]').onclick=()=> deleteCharacterReview(rv.id);
  return div;
}
