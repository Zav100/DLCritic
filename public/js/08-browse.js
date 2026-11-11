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
  return { count: rvs.length, avg: Math.round(avg*10)/10, ratedCount: rated.length, reviewCount: rvs.filter(hasReviewContent).length };
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
  // Filtro de géneros: lista desplegable con varias opciones a la vez (un juego entra si tiene AL MENOS uno de los elegidos, igual que con las plataformas).
  const genreDD = buildDropdown(document.getElementById('genreDD'), {
    multi: true,
    ariaLabel: ()=> t('side_genres'),
    label: ()=>{ const n = state.browseGenres.size; return n===0 ? esc(t('side_genres')) : n===1 ? esc(genreLabel([...state.browseGenres][0])) : esc(t('side_genres'))+' · '+n; },
    active: ()=> state.browseGenres.size>0,
    options: ()=> GENRE_ORDER.map(g=>({ value:g, selected:state.browseGenres.has(g), html:`<span class="dd-check" aria-hidden="true">✓</span><span class="ac-title">${esc(genreLabel(g))}</span>` })),
    onPick: g=>{ state.browseGenres.has(g) ? state.browseGenres.delete(g) : state.browseGenres.add(g); paintBrowseGrid(); },
  });
  // Un solo botón limpia los filtros de plataformas y de géneros (la búsqueda por texto y el orden se quedan como están).
  document.getElementById('browseClearBtn').onclick = ()=>{ state.browseFilter.clear(); state.browseGenres.clear(); renderBrowse(); };
  const search=document.getElementById('browseSearch');
  search.oninput = ()=> paintBrowseGrid();
  wireSearchClear('browseSearch');
  paintBrowseSort();
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
// Orden: una lista desplegable con un renglón por criterio (calificación, alfabético, fecha). Elegir uno lo activa con su dirección principal y volver a elegir el activo la invierte;
// la flecha (↓ / ↑) y el texto de ayuda del botón dicen cuál está puesta.
function paintBrowseSort(){
  const arrow = ()=> BROWSE_SORT_GROUPS.some(gr=>gr.second===state.browseSortMode) ? '↑' : '↓';
  buildDropdown(document.getElementById('browseSortDD'), {
    ariaLabel: ()=> t('browse_sort_aria')+': '+t('sort_'+state.browseSortMode),
    title: ()=> t('sort_'+state.browseSortMode),
    label: ()=>{ const gr = BROWSE_SORT_GROUPS.find(x=>x.first===state.browseSortMode || x.second===state.browseSortMode) || BROWSE_SORT_GROUPS[0]; return esc(t('sort_group_'+gr.key))+`<span class="sort-arrow" aria-hidden="true">${arrow()}</span>`; },
    options: ()=> BROWSE_SORT_GROUPS.map(gr=>{
      const on = state.browseSortMode===gr.first || state.browseSortMode===gr.second;
      return { value:gr.key, selected:on, html:`<span class="ac-title">${esc(t('sort_group_'+gr.key))}</span>${on? `<span class="sort-arrow" aria-hidden="true">${arrow()}</span>` : ''}` };
    }),
    onPick: key=>{
      const gr = BROWSE_SORT_GROUPS.find(x=>x.key===key);
      state.browseSortMode = state.browseSortMode===gr.first ? gr.second : gr.first;
      try{ localStorage.setItem('browseSortMode', state.browseSortMode); }catch(e){}
      paintBrowseGrid();
    },
    closeOnPick: true,
  });
}
// Lista desplegable con el estilo del sitio (reemplaza al <select> nativo, que se ve distinto en cada navegador y no se puede diseñar).
// cfg: label() html del botón · options() [{ value, html, selected }] · onPick(value) · ariaLabel() · title() opcional · active() resalta el botón (hay algo elegido) ·
// multi: se pueden marcar varias y la lista sigue abierta · closeOnPick: se cierra al elegir. Teclado: flechas para moverse, Enter o espacio para elegir, Escape para cerrar.
let dropdownsWired = false;
function closeDropdownEl(d){
  d.classList.remove('open');
  const l = d.querySelector('.dd-list'), b = d.querySelector('.dd-btn');
  if(l) l.hidden = true;
  if(b) b.setAttribute('aria-expanded', 'false');
}
function buildDropdown(wrap, cfg){
  if(!dropdownsWired){
    dropdownsWired = true;
    // composedPath y no contains(e.target): al elegir un renglón la lista se vuelve a pintar y el renglón clicado ya no está en el árbol cuando el evento llega aquí.
    document.addEventListener('click', e=>{ const path = e.composedPath(); document.querySelectorAll('.dd.open').forEach(d=>{ if(!path.includes(d)) closeDropdownEl(d); }); });
  }
  wrap.classList.add('dd');
  wrap.innerHTML = `<button type="button" class="chip dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-label"></span>${ICONS.chevronDown}</button><ul class="ac-list dd-list" role="listbox" hidden></ul>`;
  const btn = wrap.querySelector('.dd-btn'), list = wrap.querySelector('.dd-list');
  if(cfg.multi) list.setAttribute('aria-multiselectable', 'true');
  const rows = ()=> [...list.querySelectorAll('li')];
  const isOpen = ()=> wrap.classList.contains('open');
  const open = ()=>{ document.querySelectorAll('.dd.open').forEach(d=>{ if(d!==wrap) closeDropdownEl(d); }); wrap.classList.add('open'); list.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const paint = ()=>{
    btn.querySelector('.dd-label').innerHTML = cfg.label();
    btn.setAttribute('aria-label', cfg.ariaLabel());
    btn.title = cfg.title ? cfg.title() : '';
    btn.classList.toggle('active', !!(cfg.active && cfg.active()));
    list.innerHTML = cfg.options().map(o=>`<li role="option" tabindex="-1" data-v="${esc(o.value)}" aria-selected="${o.selected}" class="${o.selected? 'on' : ''}">${o.html}</li>`).join('');
    rows().forEach(li=>{
      li.onclick = ()=>{
        const i = rows().indexOf(li);
        cfg.onPick(li.dataset.v);
        paint();
        if(cfg.closeOnPick){ closeDropdownEl(wrap); btn.focus(); }
        else if(rows()[i]) rows()[i].focus(); // la lista se vuelve a pintar: el foco vuelve al mismo renglón
      };
    });
  };
  btn.onclick = ()=>{ isOpen() ? closeDropdownEl(wrap) : open(); };
  wrap.onkeydown = e=>{
    const r = rows(), cur = r.indexOf(document.activeElement);
    if(e.key==='Escape' && isOpen()){ e.preventDefault(); closeDropdownEl(wrap); btn.focus(); }
    else if(e.key==='ArrowDown' || e.key==='ArrowUp'){
      e.preventDefault();
      if(!isOpen()) open();
      const n = r.length;
      r[e.key==='ArrowDown' ? (cur<0? 0 : (cur+1)%n) : (cur<0? n-1 : (cur-1+n)%n)].focus();
    } else if((e.key==='Enter' || e.key===' ') && cur>=0){ e.preventDefault(); r[cur].click(); }
  };
  paint();
  return { paint };
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
      <div class="gc-sub">${esc(genreLabelList(g))} · ${reviewsCountText(st.reviewCount)} · ${st.ratedCount? st.avg+'/10':(state.lang==='en'?'no rating':'sin nota')}</div>
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
/* ---------- una reseña en su propia página (/resena/<id>) ---------- */
// Lo que se comparte, o lo que se abre desde la actividad reciente o una notificación: la reseña sola, sin las demás, para que con cientos de reseñas siga siendo fácil de encontrar.
// Busca el id entre las reseñas de juegos y las de personajes; devuelve { kind:'game'|'character', rv, target } o null.
function findReviewAny(id){
  const rv = state.reviews.find(r=>r.id===id);
  if(rv) return { kind:'game', rv, target: findGame(rv.gameId) };
  const crv = state.characterReviews.find(r=>r.id===id);
  if(crv) return { kind:'character', rv: crv, target: findCharacter(crv.characterId) };
  return null;
}
function reviewTargetName(f){ return f.target ? (f.kind==='game' ? f.target.title : f.target.name) : ''; }
function renderReviewPage(){
  const el = document.getElementById('reviewDetail');
  const back = document.getElementById('reviewBackBtn');
  const found = findReviewAny(state.currentReview);
  const goBack = ()=>{
    if(found && found.target && found.kind==='game'){ state.currentGame = found.target.id; state.gameOrigin = 'feed'; goView('game'); }
    else if(found && found.target){ state.currentCharacter = found.target.id; goView('character'); }
    else goView('browse');
  };
  if(!found){
    document.getElementById('reviewBackText').textContent = t('back_explore');
    back.href = '/explorar'; back.onclick = spa(goBack);
    el.innerHTML = emptyState(ICONS.helpCircle, t('empty_review_notfound_t'), t('empty_review_notfound_s'));
    return;
  }
  const { kind, rv, target } = found;
  document.getElementById('reviewBackText').textContent = target ? t('back_to_name').replace('{name}', reviewTargetName(found)) : t('back_explore');
  back.href = target ? (kind==='game' ? gameHref(target.id) : characterHref(target.id)) : '/explorar';
  back.onclick = spa(goBack);
  el.innerHTML = '<div id="reviewSolo"></div><div id="reviewContext"></div>';
  el.querySelector('#reviewSolo').appendChild(kind==='game' ? reviewCard(rv, { full:true }) : characterReviewCard(rv, { full:true }));
  if(target){
    const row = kind==='game' ? gameRailRow(target, gameStats(target.id).avg || null) : characterRailRow(target, characterStats(target.id).avg || null);
    const ctx = el.querySelector('#reviewContext');
    ctx.innerHTML = railCardHTML(t(kind==='game' ? 'review_about_game' : 'review_about_char'), `<div class="rail-list">${row}</div><button type="button" class="btn small" data-go-${kind==='game' ? 'game' : 'char'}="${esc(target.id)}" style="margin-top:12px;">${esc(t('review_see_all_btn'))}</button>`);
    wireRail(ctx);
    enhanceCovers(ctx);
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
              <div class="rc-meta">${esc(genreLabelList(g))} · ${reviewsCountText(st.reviewCount)}</div>
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

