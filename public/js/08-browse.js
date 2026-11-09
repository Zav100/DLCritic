/**
 * ARCHIVO 8 de 16 — Explorar catálogo + ficha de detalle de un juego.
 * Dos vistas: la grilla filtrable/ordenable de "Explorar" (renderBrowse +
 * paintBrowseGrid) y la ficha completa de un juego (renderGameDetail),
 * que arma la parte de calificar/reseñar apoyándose en las funciones de
 * 04-api-theme-rating.js.
 */
/* ---------- browse ---------- */
// Cantidad de reseñas y nota promedio (redondeada a 1 decimal) de un juego.
function gameStats(gameId){
  const rvs = state.reviews.filter(r=>r.gameId===gameId);
  const rated = rvs.filter(r=>r.rating!=null);
  const avg = rated.length? (rated.reduce((s,r)=>s+r.rating,0)/rated.length) : 0;
  return { count: rvs.length, avg: Math.round(avg*10)/10, ratedCount: rated.length };
}
// Chips de plataforma para un filtro (activeSet = plataformas actualmente seleccionadas). idPrefix distingue los ids si hay más de un filtro de plataformas en la página a la vez (p.ej. "bc" para browse, "sg" para sugerir un juego).
function platformChipsHTML(activeSet, idPrefix){
  return Object.keys(PLATFORM_NAMES).map(key=>{
    const m = PLATFORM_META[key];
    const active = activeSet.has(key);
    return `<button type="button" class="plat-chip ${active?'active':''}" data-plat="${key}" id="${idPrefix}-${key}" style="--pcolor:${m.color}">
      <span class="plat-chip-icon">${m.mono}</span>${PLATFORM_NAMES[key]}
    </button>`;
  }).join('');
}
// Arma los CONTROLES de la vista Explorar (chips de plataforma, buscador, selector de orden, toggle grilla/lista) una sola vez y los engancha; la grilla de resultados en sí la pinta paintBrowseGrid(), que se llama de nuevo cada vez que cambia un filtro.
function renderBrowse(){
  const chipWrap=document.getElementById('platformChips');
  chipWrap.innerHTML = platformChipsHTML(state.browseFilter,'bc');
  chipWrap.querySelectorAll('.plat-chip').forEach(c=>{
    c.onclick=()=>{ const p=c.dataset.plat; state.browseFilter.has(p)?state.browseFilter.delete(p):state.browseFilter.add(p); renderBrowse(); };
  });
  // Filtro de géneros (varios a la vez; un juego entra si tiene AL MENOS uno de los elegidos, igual que con las plataformas).
  const genreWrap=document.getElementById('genreChips');
  genreWrap.innerHTML = GENRE_ORDER.map(g=>`<button type="button" class="chip ${state.browseGenres.has(g)?'active':''}" data-genre="${esc(g)}">${esc(genreLabel(g))}</button>`).join('');
  genreWrap.querySelectorAll('.chip').forEach(c=>{
    c.onclick=()=>{
      const g=c.dataset.genre;
      state.browseGenres.has(g) ? state.browseGenres.delete(g) : state.browseGenres.add(g);
      c.classList.toggle('active');
      paintBrowseGrid();
    };
  });
  const search=document.getElementById('browseSearch');
  search.oninput = ()=> paintBrowseGrid();
  wireSearchClear('browseSearch');
  const sortSelect = document.getElementById('browseSortSelect');
  sortSelect.innerHTML = BROWSE_SORT_KEYS.map(k=> `<option value="${k}" ${k===state.browseSortMode?'selected':''}>${esc(t('sort_'+k))}</option>`).join('');
  sortSelect.onchange = ()=>{
    state.browseSortMode = sortSelect.value;
    try{ localStorage.setItem('browseSortMode', state.browseSortMode); }catch(e){}
    paintBrowseGrid();
  };
  document.querySelectorAll('#browseViewToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.viewmode===state.browseViewMode);
    b.onclick = ()=>{
      state.browseViewMode = b.dataset.viewmode;
      try{ localStorage.setItem('browseViewMode', state.browseViewMode); }catch(e){}
      document.querySelectorAll('#browseViewToggle button').forEach(x=> x.classList.toggle('active', x===b));
      paintBrowseGrid(true);
    };
  });
  paintBrowseGrid();
}
// "1 reseña" / "3 reseñas" (o su equivalente en inglés) con el plural correcto.
function reviewsCountText(count){
  return state.lang==='en' ? `${count} review${count===1?'':'s'}` : `${count} reseña${count===1?'':'s'}`;
}
function removeBrowseLoadMore(){
  const existing = document.getElementById('browseLoadMoreWrap');
  if(existing) existing.remove();
}
// Filtra (búsqueda + plataformas), ordena y pinta la grilla de Explorar,
// con paginado "Ver más" (keepPage=true mantiene la cantidad visible
// actual en vez de resetear a la primera página — se usa al apretar "Ver
// más" o al cambiar de grilla a lista, para no perder el scroll).
function paintBrowseGrid(keepPage){
  if(!keepPage) state.browseVisibleCount = BROWSE_PAGE_SIZE;
  const grid=document.getElementById('browseGrid');
  const q=foldText(document.getElementById('browseSearch').value).trim();
  let games = allGames().filter(g=> foldText(g.title).includes(q));
  if(state.browseFilter.size>0) games = games.filter(g=> g.platforms && g.platforms.some(p=>state.browseFilter.has(p)));
  if(state.browseGenres.size>0) games = games.filter(g=> (g.genres && g.genres.length ? g.genres : [g.genre]).some(x=>state.browseGenres.has(x)));
  grid.classList.toggle('list-mode', state.browseViewMode==='list');
  removeBrowseLoadMore();
  document.getElementById('browseCount').textContent = games.length; // todos los resultados (sin búsqueda ni filtros, el total del catálogo), no solo los que se ven antes de «Ver más»
  if(games.length===0){ grid.innerHTML = emptyState(ICONS.search, t('empty_browse_t'), t('empty_browse_s')); return; }
  games = games.sort(BROWSE_SORTS[state.browseSortMode] || BROWSE_SORTS.rating_desc);
  const visible = games.slice(0, state.browseVisibleCount);
  grid.innerHTML='';
  visible.forEach(g=>{
    const st=gameStats(g.id);
    const card=document.createElement('div');
    card.className='card gamecard has-card-link';
    card.innerHTML=`
      ${cardLinkHTML(gameHref(g.id), g.title)}
      <div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
      <div class="gc-title">${esc(g.title)}</div>
      <div class="gc-sub">${esc(genreLabelList(g))} · ${reviewsCountText(st.count)} · ${st.count? st.avg+'/10':(state.lang==='en'?'no rating':'sin nota')}</div>
      <div class="platbadges">${platBadges(g.platforms)}</div>
    `;
    card.onclick=spa(()=>{ state.currentGame=g.id; state.gameOrigin='browse'; goView('game'); });
    grid.appendChild(card);
  });
  if(games.length > state.browseVisibleCount){
    const wrap = document.createElement('div');
    wrap.id = 'browseLoadMoreWrap';
    wrap.className = 'load-more-wrap';
    const btn = document.createElement('button');
    btn.className = 'btn-ghost load-more-btn';
    btn.textContent = t('load_more_btn');
    btn.onclick = ()=>{ state.browseVisibleCount += BROWSE_PAGE_SIZE; paintBrowseGrid(true); };
    wrap.appendChild(btn);
    grid.insertAdjacentElement('afterend', wrap);
  }
}
/* ---------- ficha de detalle de un juego ---------- */
// Pinta toda la ficha de un juego: cabecera (portada, título, botones
// biblioteca/agregar a lista), descripción/datos si el juego los tiene,
// widget de calificación rápida + reseña (si hay sesión), y la lista de
// reseñas de otros usuarios. El botón "Volver" cambia de texto/destino
// según de dónde vino el usuario (state.gameOrigin: feed/daily/shelf/browse).
// Nintendo es muy firme con sus imágenes: en los juegos que edita Nintendo se aclara, al final de la ficha, de quién son la portada y las imágenes.
function imageCreditHTML(g){
  if(!/nintendo/i.test(g.publisher||'')) return '';
  return `<p class="image-credit">${esc(t('nintendo_credit'))} <a href="/creditos">${esc(t('footer_credits'))}</a></p>`;
}
function renderGameDetail(){
  const g = findGame(state.currentGame);
  const el = document.getElementById('gameDetail');
  if(!g){ el.innerHTML = emptyState(ICONS.helpCircle, t('empty_game_notfound_t'), t('empty_game_notfound_s')); return; }
  if(state.reviewEditingGameId !== g.id){ state.reviewEditing = false; }
  const st = gameStats(g.id);
  const d = gameDetails(g);
  const rvs = state.reviews.filter(r=>r.gameId===g.id && hasReviewContent(r)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const myReview = state.user ? state.reviews.find(r=>r.gameId===g.id && r.username===state.user.username) : null;
  const wished = isWishlisted(g.id);
  const links = storeLinksHTML(g);
  el.innerHTML = `
    <div class="layout-rail"><div class="rail-main">
    <div class="game-hero">
      <div class="game-hero-bg"></div>
      <div class="card game-hero-card">
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; justify-content:space-between;">
          <div style="display:flex; gap:16px; align-items:center;">
            <div class="gc-cover ${genreTint(primaryGenre(g))}" style="width:64px; height:64px; font-size:30px;" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
            <div>
              <div class="rc-game" style="font-size:22px;">${esc(g.title)}</div>
              <div class="rc-meta">${esc(genreLabelList(g))} · ${reviewsCountText(st.count)}</div>
              <div class="platbadges" style="margin-top:6px;">${platBadges(g.platforms)}</div>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="wishlist-btn ${wished?'active':''}" id="wishlistBtn">${wished? t('wishlist_added') : t('wishlist_add')}</button>
            ${state.user ? `<button class="wishlist-btn" id="addToListBtn">${ICONS.bookmark} ${t('list_add_to_btn')}</button>` : ''}
          </div>
        </div>
        ${d? `<p class="game-desc">${esc(d.description)}</p>
        <div class="infogrid">
          <div class="infoitem"><div class="il">${t('dev_label')}</div><div class="iv">${esc(d.developer)}</div></div>
          <div class="infoitem"><div class="il">${t('pub_label')}</div><div class="iv">${esc(d.publisher)}</div></div>
          <div class="infoitem"><div class="il">${t('year_label')}</div><div class="iv">${esc(String(d.year))}</div></div>
          <div class="infoitem"><div class="il">${t('mode_label')}</div><div class="iv">${esc(d.mode)}</div></div>
        </div>` : `<p class="nodetails">${t('community_note')}</p>`}
        <div style="margin-top:16px;" id="detailGauge"></div>
        ${(myReview && myReview.rating!=null)? `<p class="vs-community">${esc(vsCommunityText(myReview.rating, st.avg))}</p>` : ''}
        ${links? `<div class="stores-block"><div class="il">${t('stores_title')}</div><div class="store-links">${links}</div></div>` : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:22px;" id="rateReviewCard">
      <div class="field">
        <label>${t('add_rating_label')}</label>
        ${!state.user ? `<p class="hint">${t('login_to_rate_hint')}</p>` : `
        <div class="ratebox">
          <div class="rate-readout">
            <span class="rate-num" id="qrNum">—</span><span class="rate-outof">/10</span><span class="sparkle" id="qrSparkle">${ICONS.sparkles}</span>
            <div class="rate-mood" id="qrMood"></div>
          </div>
          <div class="rate-buttons" id="qrButtons"></div>
          <button type="button" class="clear-rating-btn" id="qrClearBtn" hidden>${esc(t('clear_rating_btn'))}</button>
        </div>
        <div class="filterbar" id="qrPlatforms" style="margin-top:14px;"></div>`}
      </div>
      <div class="field" style="margin-top:6px; padding-top:16px; border-top:1px dashed var(--line-dark);">
        <label>${t('add_review_label')}</label>
        ${!state.user ? `<p class="hint">${t('login_to_review_hint')}</p>` : `<div id="reviewBlock"></div>`}
      </div>
    </div>

    ${gameCharactersHTML(g)}

    <div class="sectionhead"><h2>${t('reviews_section_title')}</h2><span class="count">${rvs.length}</span></div>
    <div id="detailList"></div>
    ${imageCreditHTML(g)}
    </div><aside class="rail" id="gameRail"></aside></div>
  `;
  renderGameRail(g);
  wireGameCharacters(el);
  renderGauge(document.getElementById('detailGauge'), st.avg||0);
  // Se busca dentro de la ficha (el), no en todo el documento: la ficha de un personaje también usa .game-hero-bg y .game-hero-card, y si antes se había
  // visitado un personaje, su elemento (oculto) venía primero y la portada del juego se pintaba ahí, dejando vacía la de la ficha hasta recargar.
  loadHeroCover(el.querySelector('.game-hero-bg'), g.coverUrl);
  makeZoomable(el.querySelector('.game-hero-card .gc-cover'), g.coverUrl, g.title); // la portada de la ficha se abre en grande
  document.getElementById('wishlistBtn').onclick = ()=> toggleWishlist(g.id);
  const addToListBtn = document.getElementById('addToListBtn');
  if(addToListBtn) addToListBtn.onclick = ()=> openAddToListModal(g.id);
  if(state.user){
    renderQuickRate('qr', g.id, myReview? myReview.rating : null);
    renderQuickPlatforms(g.id, g, myReview);
    renderReviewBlock(g.id, myReview);
  }
  // De dónde se llegó decide a dónde y con qué texto vuelve el botón. Desde un personaje: «Volver a <nombre>» (si ese personaje ya no existe, a Explorar).
  const fromCharacter = state.gameOrigin==='character' ? findCharacter(state.currentCharacter) : null;
  const origin = state.gameOrigin==='character' ? (fromCharacter? 'character' : 'browse') : (state.gameOrigin || 'browse');
  const backBtn = document.getElementById('gameBackBtn');
  document.getElementById('gameBackText').textContent = origin==='character' ? t('back_to_name').replace('{name}', fromCharacter.name) : origin==='feed' ? t('back_news') : origin==='daily' ? t('back_daily') : origin==='shelf' ? t('back_shelf') : t('back_explore');
  backBtn.href = pathForView(origin);
  backBtn.onclick = spa(()=> goView(origin));
  const list=document.getElementById('detailList');
  if(rvs.length===0){
    list.innerHTML = emptyState(ICONS.fileText, t('empty_reviews_t'), t('empty_reviews_s'));
  } else {
    rvs.forEach(rv=> list.appendChild(reviewCard(rv)));
  }
}

