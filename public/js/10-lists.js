/**
 * ARCHIVO 10 de 16 — Listas de juegos + "Mi biblioteca" (wishlist).
 *
 * Dos features de organización de juegos que un usuario puede crear desde
 * su perfil, con lógica bastante parecida entre sí pero con datos
 * separados en el servidor: LISTAS son varias, con nombre y visibilidad
 * pública/privada (game_lists en la base); BIBLIOTECA es una sola lista
 * fija por usuario (el array wishlist en su fila de la tabla users) para
 * marcar juegos que ya tienes/quieres tener.
 *
 * Al final del archivo hay 3 helpers sueltos (hashStr, jumpToRate,
 * deleteReview) que no tienen que ver con listas — quedaron ahí porque
 * así estaban ubicados en el archivo original.
 */
/* ---------- listas de juegos ---------- */
// Botón "+ Crear lista": pide título/visibilidad con promptCreateList() y, si el usuario confirma, crea la lista en el servidor y refresca la grilla de listas donde se abrió.
function openCreateListModal(){
  promptCreateList().then(async result=>{
    if(!result || !result.title.trim()) return;
    try{
      await apiPost('/lists', { title: result.title.trim(), isPublic: result.isPublic });
      toast(t('toast_list_created'));
      const rt = state.listsRenderTarget || {};
      renderProfileLists(state.user.username, true, rt.gridId);
    }catch(e){ toast(t('err_save_user')); }
  });
}
// Modal chico para pedir el título + visibilidad (pública/privada) de una lista nueva. Es una Promise: resuelve {title, isPublic} si confirma, o null si cancela.
function promptCreateList(){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    let visibility = 'public';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${esc(t('list_create_btn'))}</h3>
        <div class="field">
          <label>${esc(t('list_title_label'))}</label>
          <input type="text" id="newListTitle" maxlength="60">
        </div>
        <div class="field">
          <label>${esc(t('list_visibility_label'))}</label>
          <div style="display:flex; gap:8px;">
            <button type="button" class="chip active" data-vis="public">${ICONS.globe} ${esc(t('list_public_label'))}</button>
            <button type="button" class="chip" data-vis="private">${ICONS.lock} ${esc(t('list_private_label'))}</button>
          </div>
        </div>
        <div class="confirm-actions" style="margin-top:16px;">
          <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
          <button class="btn gold" data-act="create">${esc(t('list_create_btn'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('newListTitle');
    input.focus();
    overlay.querySelectorAll('[data-vis]').forEach(btn=>{
      btn.onclick = ()=>{
        visibility = btn.dataset.vis;
        overlay.querySelectorAll('[data-vis]').forEach(b=> b.classList.toggle('active', b===btn));
      };
    });
    function cleanup(val){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(val); }
    function onKey(e){ if(e.key==='Escape') cleanup(null); if(e.key==='Enter'){ e.preventDefault(); cleanup({title:input.value, isPublic: visibility==='public'}); } }
    overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(null); });
    overlay.querySelector('[data-act="cancel"]').onclick = ()=> cleanup(null);
    overlay.querySelector('[data-act="create"]').onclick = ()=> cleanup({title:input.value, isPublic: visibility==='public'});
    document.addEventListener('keydown', onKey);
  });
}
// Modal genérico "pedir un texto corto" (se usa para renombrar una lista). Promise que resuelve el texto ingresado, o null si se cancela.
function confirmTextPrompt(label, initial, confirmLabel){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="field" style="margin-bottom:0;">
          <label>${esc(label)}</label>
          <input type="text" id="promptInput" maxlength="60" value="${esc(initial||'')}">
        </div>
        <div class="confirm-actions" style="margin-top:16px;">
          <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
          <button class="btn gold" data-act="ok">${esc(confirmLabel || t('save_changes_btn'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('promptInput');
    input.focus(); input.select();
    function cleanup(val){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(val); }
    function onKey(e){ if(e.key==='Escape') cleanup(null); if(e.key==='Enter') cleanup(input.value); }
    overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(null); });
    overlay.querySelector('[data-act="cancel"]').onclick = ()=> cleanup(null);
    overlay.querySelector('[data-act="ok"]').onclick = ()=> cleanup(input.value);
    document.addEventListener('keydown', onKey);
  });
}
// Pone al día, en su lugar, las tarjetas de esa lista que hay detrás de la ventana (título, ícono de visibilidad y cantidad de juegos). Así, al quitar un
// juego, hacerla pública/privada o renombrarla no hace falta repintar la grilla ni volver a abrir la ventana, que era lo que hacía parpadear la pantalla.
function syncListCard(list){
  document.querySelectorAll(`.list-card[data-list-id="${CSS.escape(list.id)}"]`).forEach(card=>{
    card.querySelector('.gc-title').textContent = list.title;
    const icon = card.querySelector('.list-visibility-icon');
    icon.innerHTML = list.isPublic ? ICONS.globe : ICONS.lock;
    icon.title = list.isPublic ? t('list_public_label') : t('list_private_label');
    const n = list.gameIds.length;
    card.querySelector('.gc-sub').textContent = `${n} ${t(n===1 ? 'game_count_label' : 'games_count_label')}`;
  });
}
// Modal que muestra los juegos DENTRO de una lista (al hacer click en la
// card de la lista). Si es tuya (editable), suma botones para hacerla
// pública/privada, renombrarla, borrarla, agregarle juegos (openAddGamesToListModal) y quitarlos uno por uno.
// Usa la clase "list-detail-modal" para ser más ancho que un modal normal
// y mostrar los juegos en varias columnas (ver css/style.css).
function openListDetailModal(listId){
  const list = (state.profileLists||[]).find(l=>l.id===listId);
  if(!list) return;
  const editable = state.profileListsEditable;
  const games = list.gameIds.map(id=>findGame(id)).filter(Boolean);
  const visibilityHTML = ()=> list.isPublic ? ICONS.globe+' '+esc(t('list_public_label')) : ICONS.lock+' '+esc(t('list_private_label'));
  const emptyHTML = ()=> emptyState(ICONS.bookmark, t('list_empty_t'), editable ? '' : t('list_empty_other_s'));
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal list-detail-modal">
      <h3>${esc(list.title)}</h3>
      ${editable ? `
      <div class="confirm-actions list-detail-actions">
        <button class="chip" id="listAddGamesBtn">${ICONS.plus} ${esc(t('list_add_games_btn'))}</button>
        <button class="chip" id="listTogglePublic">${visibilityHTML()}</button>
        <button class="chip" id="listRenameBtn">${esc(t('list_rename_btn'))}</button>
        <button class="chip chip-danger" id="listDeleteBtn">${t('delete_btn')}</button>
      </div>` : ''}
      <div class="list-detail-scroll"><div class="grid list-detail-grid" id="listDetailGrid"></div></div>
      <div class="confirm-actions" style="margin-top:16px;">
        <button class="btn-ghost" data-act="cancel">${esc(t('back_generic'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const grid = document.getElementById('listDetailGrid');
  if(games.length===0){
    grid.innerHTML = emptyHTML();
  } else {
    grid.innerHTML='';
    games.forEach(g=>{
      const card=document.createElement('div');
      card.className='card gamecard has-card-link';
      card.innerHTML=`
        ${cardLinkHTML(gameHref(g.id), g.title)}
        <div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
        <div class="gc-title" title="${esc(g.title)}">${esc(g.title)}</div>
        <div class="gc-sub">${esc(genreLabelList(g))}</div>
        ${editable ? `<button type="button" class="list-remove-btn" data-remove="${esc(g.id)}">${ICONS.x}<span>${esc(t('list_remove_btn'))}</span></button>` : ''}
      `;
      card.onclick=spa((e)=>{
        if(e.target.closest('[data-remove]')) return;
        state.currentGame=g.id; state.gameOrigin='shelf'; cleanup(); goView('game');
      });
      if(editable){
        card.querySelector('[data-remove]').onclick = async (e)=>{
          e.stopPropagation();
          if(card.dataset.busy) return; // un toque a la vez mientras el servidor responde
          card.dataset.busy = '1';
          try{ await apiPost('/lists/'+list.id+'/items/toggle', { gameId:g.id }); }
          catch(err){ delete card.dataset.busy; toast(t('err_save_user')); return; }
          list.gameIds = list.gameIds.filter(id=>id!==g.id); // list es el mismo objeto de state.profileLists: queda al día
          syncListCard(list);
          card.animate([{ opacity:1, transform:'scale(1)' }, { opacity:0, transform:'scale(.94)' }], { duration:160, easing:'ease-out', fill:'forwards' });
          await new Promise(r=>setTimeout(r, 160)); // con un temporizador y no con animation.finished: se quita igual aunque la pestaña esté en segundo plano
          card.remove();
          if(!grid.querySelector('.gamecard')) grid.innerHTML = emptyHTML();
        };
      }
      grid.appendChild(card);
    });
  }
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="cancel"]').onclick = cleanup;
  if(editable){
    document.getElementById('listAddGamesBtn').onclick = ()=>{ cleanup(); openAddGamesToListModal(list.id); };
    document.getElementById('listTogglePublic').onclick = async ()=>{
      let updated;
      try{ ({ list: updated } = await apiPut('/lists/'+list.id, { isPublic: !list.isPublic })); }
      catch(err){ toast(t('err_save_user')); return; }
      list.isPublic = updated.isPublic;
      document.getElementById('listTogglePublic').innerHTML = visibilityHTML();
      syncListCard(list);
    };
    document.getElementById('listRenameBtn').onclick = async ()=>{
      const title = await confirmTextPrompt(t('list_title_label'), list.title);
      if(!title || !title.trim()) return;
      let updated;
      try{ ({ list: updated } = await apiPut('/lists/'+list.id, { title: title.trim() })); }
      catch(err){ toast(t('err_save_user')); return; }
      list.title = updated.title;
      overlay.querySelector('h3').textContent = list.title;
      syncListCard(list);
    };
    document.getElementById('listDeleteBtn').onclick = async ()=>{
      const ok = await confirmDialog(t('list_delete_confirm'));
      if(!ok) return;
      await apiDelete('/lists/'+list.id);
      overlay.remove();
      renderProfileLists(state.profileListsUsername, true, (state.listsRenderTarget||{}).gridId);
    };
  }
  document.addEventListener('keydown', onKey);
}
// Modal "Agregar juegos" de una lista tuya: buscador + grilla del catálogo; tocar una card suma o saca el juego de la lista sin cerrar el
// modal (así se agregan varios seguidos). Al cerrarlo se vuelve a abrir la lista con los cambios.
function openAddGamesToListModal(listId){
  const list = (state.profileLists||[]).find(l=>l.id===listId);
  if(!list) return;
  const inList = new Set(list.gameIds);
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal wishlist-pick-modal" role="dialog" aria-modal="true" aria-labelledby="listPickTitle">
      <h3 id="listPickTitle">${esc(t('list_add_games_btn'))}</h3>
      <p class="hint follow-list-owner">${esc(list.title)}</p>
      <div class="field" style="margin-bottom:12px;">
        <label for="listPickSearch">${esc(t('add_search_label'))}</label>
        <div class="search-wrap">
          <input type="text" id="listPickSearch" placeholder="Elden Ring, Hades, Mario Kart…">
          <button type="button" class="search-clear" data-clears="listPickSearch" hidden>✕</button>
        </div>
      </div>
      <div class="picker-grid" id="listPickGrid"></div>
      <div class="confirm-actions" style="margin-top:16px;">
        <button class="btn gold" data-act="close">${esc(t('back_generic'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const search = document.getElementById('listPickSearch');
  const grid = document.getElementById('listPickGrid');
  const subText = id => t(inList.has(id)? 'list_pick_in' : 'wishlist_pick_add');
  function paint(){
    const q = foldText(search.value).trim();
    const games = allGames().filter(g=> foldText(g.title).includes(q)).slice(0,60);
    if(games.length===0){ grid.innerHTML = emptyState(ICONS.search, t('empty_pick_t'), t('empty_browse_s')); return; }
    grid.innerHTML = '';
    games.forEach(g=>{
      const card = document.createElement('div');
      card.className = 'card pickcard'+(inList.has(g.id)? ' featured' : '');
      card.innerHTML = `<div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div><div class="gc-title">${esc(g.title)}</div><div class="gc-sub">${subText(g.id)}</div>`;
      card.onclick = async ()=>{
        if(card.dataset.busy) return; // un toque a la vez por juego, mientras el servidor responde
        card.dataset.busy = '1';
        try{
          await apiPost('/lists/'+listId+'/items/toggle', { gameId:g.id });
          if(inList.has(g.id)) inList.delete(g.id); else inList.add(g.id);
          card.classList.toggle('featured', inList.has(g.id));
          card.querySelector('.gc-sub').textContent = subText(g.id);
        }catch(e){ toast(t('err_save_user')); }
        delete card.dataset.busy;
      };
      grid.appendChild(card);
    });
  }
  paint();
  search.oninput = paint;
  wireSearchClear('listPickSearch');
  async function close(){
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    await renderProfileLists(state.profileListsUsername, true, (state.listsRenderTarget||{}).gridId);
    openListDetailModal(listId);
  }
  function onKey(e){ if(e.key==='Escape') close(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  overlay.querySelector('[data-act="close"]').onclick = close;
  document.addEventListener('keydown', onKey);
  search.focus();
}
// Modal "Agregar a lista" (botón en la ficha de un juego): un checkbox por
// cada una de tus listas (tildado si el juego ya está ahí) + la opción de
// crear una lista nueva al vuelo con el juego ya adentro.
async function openAddToListModal(gameId){
  if(!state.user){ goView('auth'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <h3>${esc(t('list_add_to_btn'))}</h3>
      <div id="addToListOptions"><p class="hint">${esc(t('loading_label'))}</p></div>
      <div class="confirm-actions" style="margin-top:16px;">
        <button class="btn-ghost" data-act="new">${ICONS.plus} ${esc(t('list_create_btn'))}</button>
        <button class="btn gold" data-act="close">${esc(t('back_generic'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="close"]').onclick = cleanup;
  overlay.querySelector('[data-act="new"]').onclick = async ()=>{
    const result = await promptCreateList();
    if(!result || !result.title.trim()) return;
    const { list } = await apiPost('/lists', { title: result.title.trim(), isPublic: result.isPublic });
    await apiPost('/lists/'+list.id+'/items/toggle', { gameId });
    cleanup();
    openAddToListModal(gameId);
  };
  document.addEventListener('keydown', onKey);
  try{
    const { lists } = await apiGet('/lists/mine');
    const wrap = document.getElementById('addToListOptions');
    if(!wrap) return;
    if(lists.length===0){ wrap.innerHTML = `<p class="hint">${esc(t('empty_lists_t'))}</p>`; return; }
    wrap.innerHTML = lists.map(l=>`
      <label style="display:flex; align-items:center; gap:8px; padding:9px 10px; border-radius:10px; background:var(--paper-alt); margin-bottom:8px; cursor:pointer; font-size:13.5px;">
        <input type="checkbox" data-list-id="${esc(l.id)}" ${l.gameIds.includes(gameId)?'checked':''}> ${esc(l.title)}
      </label>
    `).join('');
    wrap.querySelectorAll('[data-list-id]').forEach(cb=>{
      cb.onchange = ()=> apiPost('/lists/'+cb.dataset.listId+'/items/toggle', { gameId });
    });
  }catch(e){
    const wrap = document.getElementById('addToListOptions');
    if(wrap) wrap.innerHTML = `<p class="hint">${esc(t('err_save_user'))}</p>`;
  }
}
/* ---------- lista de "tus reseñas" del perfil (con paginado) ---------- */
function removeShelfLoadMore(){
  const existing = document.getElementById('shelfLoadMoreWrap');
  if(existing) existing.remove();
}
// Pinta las reseñas del perfil que se está viendo (state.shelfReviews, ya
// filtradas/ordenadas por renderProfileBody en 09-shelf-profile.js), con
// paginado "Ver más". El mensaje de "vacío" cambia según sea tu perfil o
// el de otro usuario (state.shelfReviewsEditable).
function renderShelfReviewsList(keepPage){
  if(!keepPage) state.shelfReviewsVisibleCount = SHELF_REVIEWS_PAGE_SIZE;
  const mine = state.shelfReviews || [];
  const list=document.getElementById('shelfList');
  removeShelfLoadMore();
  if(mine.length===0){
    list.innerHTML = state.shelfReviewsEditable
      ? emptyState(ICONS.gamepad, t('empty_shelf_t'), t('empty_shelf_s'))
      : emptyState(ICONS.gamepad, t('empty_shelf_other_t'), t('empty_shelf_other_s'));
    return;
  }
  const visible = mine.slice(0, state.shelfReviewsVisibleCount);
  list.innerHTML='';
  visible.forEach(rv=> list.appendChild(reviewCard(rv)));
  if(mine.length > state.shelfReviewsVisibleCount){
    const wrap = document.createElement('div');
    wrap.id = 'shelfLoadMoreWrap';
    wrap.className = 'load-more-wrap';
    const btn = document.createElement('button');
    btn.className = 'btn-ghost load-more-btn';
    btn.textContent = t('load_more_btn');
    btn.onclick = ()=>{ state.shelfReviewsVisibleCount += SHELF_REVIEWS_PAGE_SIZE; renderShelfReviewsList(true); };
    wrap.appendChild(btn);
    list.insertAdjacentElement('afterend', wrap);
  }
}
/* ---------- selector de "juego favorito" del perfil ---------- */
// Grilla buscable de TODO el catálogo para elegir tu juego favorito (el que se muestra destacado en tu perfil); resalta el que ya está elegido.
function paintFavPickGrid(){
  const q=foldText(document.getElementById('favSearch').value).trim();
  const grid=document.getElementById('favPickGrid');
  const games = allGames().filter(g=> foldText(g.title).includes(q)).slice(0,60);
  if(games.length===0){ grid.innerHTML = emptyState(ICONS.search, t('empty_pick_t'), t('empty_browse_s')); return; }
  grid.innerHTML='';
  games.forEach(g=>{
    const card=document.createElement('div');
    card.className='card pickcard'+(state.user.favoriteGameId===g.id?' featured':'');
    card.innerHTML = `<div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div><div class="gc-title">${esc(g.title)}</div><div class="gc-sub">${esc(genreLabelList(g))}</div>`;
    card.onclick=()=> selectFavoriteGame(g.id);
    grid.appendChild(card);
  });
}
// Efecto de confeti (16 partículas con ángulo/distancia/color al azar) que festeja elegir un juego favorito, centrado en el elemento `originEl`. Puramente decorativo — cada partícula se borra sola con setTimeout.
function celebrateFavorite(originEl){
  if(!originEl) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const colors = ['var(--gold)','var(--teal)','var(--pink)'];
  const count = 16;
  for(let i=0;i<count;i++){
    const p=document.createElement('div');
    p.className='confetti-piece';
    const angle = (Math.PI*2*i/count) + (Math.random()*0.6-0.3);
    const dist = 55+Math.random()*70;
    const dx = Math.cos(angle)*dist;
    const dy = Math.sin(angle)*dist - 30;
    const size = 5+Math.random()*4;
    p.style.left = cx+'px';
    p.style.top = cy+'px';
    p.style.width = size+'px';
    p.style.height = size+'px';
    p.style.borderRadius = Math.random()>0.5 ? '50%' : '2px';
    p.style.setProperty('--dx', dx+'px');
    p.style.setProperty('--dy', dy+'px');
    p.style.background = colors[i%colors.length];
    p.style.animationDelay = (Math.random()*0.1)+'s';
    document.body.appendChild(p);
    setTimeout(()=> p.remove(), 1100);
  }
}
async function selectFavoriteGame(gameId){
  if(state.user.favoriteGameId !== gameId){ state.user.favoritePlatinum = false; state.user.favoriteSteam = null; } // el platino, las horas y los logros eran del favorito anterior
  state.user.favoriteGameId = gameId;
  try{
    const r = await apiPut('/profile/favorite', { gameId });
    state.user.favoritePlatinum = r.favoritePlatinum; state.user.favoriteSteam = r.favoriteSteam; // el servidor dice si el nuevo favorito está en su Steam (y trae sus logros)
  }catch(e){ toast(t('err_save_user')); }
  toast(t('toast_fav_updated'));
  renderShelf();
  celebrateFavorite(document.getElementById('favPanel'));
}
// Frase "le diste X/10, la comunidad promedia Y/10, eres más [generoso/exigente/coincides]" — compara tu nota con el promedio de todos.
function vsCommunityText(you, avg){
  const diff = you - avg;
  const key = diff>=1.5? 'vs_sentence_more' : diff<=-1.5? 'vs_sentence_less' : 'vs_sentence_same';
  return t(key).replace('{you}', you).replace('{avg}', avg);
}

/* ---------- "Mi biblioteca" (wishlist): los juegos que el usuario ya tiene ---------- */
function isWishlisted(gameId){
  return !!(state.user && state.user.wishlist && state.user.wishlist.includes(gameId));
}
// Botón "Agregar a mi biblioteca" de la ficha de un juego: agrega/quita y
// vuelve a pintar TODA la vista actual (a diferencia de
// toggleWishlistQuiet más abajo, que solo actualiza la biblioteca sin
// tocar el resto de la pantalla — se usa cuando este toggle pasa desde
// DENTRO de un modal que tiene que seguir abierto).
async function toggleWishlist(gameId){
  if(!state.user){ goView('auth'); return; }
  const adding = !(state.user.wishlist||[]).includes(gameId);
  try{
    const { wishlist } = await apiPost('/profile/wishlist/toggle', { gameId });
    state.user.wishlist = wishlist;
  }catch(e){ toast(t('err_save_user')); return; }
  toast(adding? t('toast_wishlist_added') : t('toast_wishlist_removed'));
  goView(state.view);
}
function removeWishlistLoadMore(){
  const existing = document.getElementById('wishlistLoadMoreWrap');
  if(existing) existing.remove();
}
// Grilla de "Mi biblioteca" en el perfil, con paginado, más el tile "+ Agregar juego" (siempre presente, aunque la biblioteca esté vacía) que abre openAddToWishlistModal.
function renderWishlistGrid(keepPage){
  if(state.user.steam && state.steamHoursFor !== state.user.username){
    state.steamHoursFor = state.user.username; state.steamHours = {};
    loadSteamHours().then(()=>{ if(document.getElementById('wishlistGrid')) renderWishlistGrid(true); });
  }
  if(!keepPage) state.wishlistVisibleCount = WISHLIST_PAGE_SIZE;
  const grid = document.getElementById('wishlistGrid');
  const ids = state.user.wishlist || [];
  const games = ids.map(id=>findGame(id)).filter(Boolean);
  removeWishlistLoadMore();
  grid.innerHTML='';
  if(games.length===0){
    grid.insertAdjacentHTML('beforeend', emptyState(ICONS.bookmark, t('wishlist_empty_t'), t('wishlist_empty_s')));
  } else {
    const visible = games.slice(0, state.wishlistVisibleCount);
    visible.forEach(g=> grid.appendChild(libraryCard(g, state.steamHours && state.steamHours[g.id])));
  }
  const addTile=document.createElement('div');
  addTile.className='card list-create-tile';
  addTile.innerHTML = `${ICONS.plus}<span>${t('wishlist_add_game_btn')}</span>`;
  addTile.onclick = openAddToWishlistModal;
  grid.appendChild(addTile);
  if(games.length > state.wishlistVisibleCount){
    const wrap = document.createElement('div');
    wrap.id = 'wishlistLoadMoreWrap';
    wrap.className = 'load-more-wrap';
    const btn = document.createElement('button');
    btn.className = 'btn-ghost load-more-btn';
    btn.textContent = t('load_more_btn');
    btn.onclick = ()=>{ state.wishlistVisibleCount += WISHLIST_PAGE_SIZE; renderWishlistGrid(true); };
    wrap.appendChild(btn);
    grid.insertAdjacentElement('afterend', wrap);
  }
}
// Horas de Steam en texto: "45 min" o "90 h" (con un decimal si hace falta).
function fmtHours(min){ return min>=60 ? (Math.round(min/6)/10).toLocaleString(state.lang==='en'?'en':'es')+' h' : min+' min'; }
// Tarjeta de un juego de la biblioteca (la propia y la de otras personas). minutes: horas de Steam, si se conocen y se pueden mostrar.
function libraryCard(g, minutes){
  const st = gameStats(g.id);
  const card = document.createElement('div');
  card.className = 'card gamecard has-card-link';
  card.innerHTML = `
    ${cardLinkHTML(gameHref(g.id), g.title)}
    <div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div>
    <div class="gc-title">${esc(g.title)}</div>
    <div class="gc-sub">${esc(genreLabelList(g))} · ${st.count? st.avg+'/10':'—'}</div>
    <div class="platbadges">${platBadges(g.platforms)}</div>
    ${minutes>0 ? `<div class="hours-tag" title="${esc(t('steam_hours_title'))}">${ICONS.clock} ${esc(fmtHours(minutes))}</div>` : ''}
  `;
  card.onclick = spa(()=>{ state.currentGame=g.id; state.gameOrigin='shelf'; goView('game'); });
  return card;
}
async function loadSteamHours(){
  try{ state.steamHours = (await apiGet('/steam/hours')).hours; }catch(e){ state.steamHours = {}; }
}
// Guarda en memoria lo que respondió /steam/sync: las horas de todos los juegos y las horas y logros del favorito.
function applySteamSync(d){
  state.steamHours = Object.fromEntries(d.matches.map(m=>[m.gameId, m.minutes])); state.steamHoursFor = state.user.username;
  state.user.steam.syncedAt = d.syncedAt;
  state.user.favoritePlatinum = d.favoritePlatinum; state.user.favoriteSteam = d.favoriteSteam;
}
// Texto para cada error de la sincronización con Steam (el servidor manda el código en e.message).
function steamErrorText(e){
  return t({ steam_private:'steam_err_private', steam_not_configured:'steam_err_not_configured' }[e.message] || 'steam_err_unavailable');
}
// Modal "Importar desde Steam": trae los juegos de la cuenta de Steam que están en el catálogo (y guarda sus horas) y deja elegir cuáles sumar a la biblioteca.
async function openSteamImportModal(){
  if(!state.user || !state.user.steam) return;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<div class="confirm-box suggest-modal steam-import-modal"><h3>${esc(t('steam_import_title'))}</h3><div id="steamImportBody"><p class="hint">${esc(t('steam_import_loading'))}</p></div></div>`;
  document.body.appendChild(overlay);
  const close = ()=>{ overlay.remove(); document.removeEventListener('keydown', onKey); };
  function onKey(e){ if(e.key==='Escape') close(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  document.addEventListener('keydown', onKey);
  const body = overlay.querySelector('#steamImportBody');
  const closeBtn = `<div class="confirm-actions" style="margin-top:16px;"><button class="btn gold" data-act="close">${esc(t('back_generic'))}</button></div>`;
  let data;
  try{ data = await apiPost('/steam/sync'); }
  catch(e){ body.innerHTML = `<p class="error">${esc(steamErrorText(e))}</p>${closeBtn}`; body.querySelector('[data-act="close"]').onclick = close; return; }
  applySteamSync(data);
  const inLibrary = new Set(state.user.wishlist || []);
  const rows = data.matches.map(m=>({ g: findGame(m.gameId), minutes: m.minutes })).filter(r=>r.g).sort((a,b)=>b.minutes-a.minutes);
  if(!rows.length){ body.innerHTML = `<p class="hint">${esc(t('steam_import_empty'))}</p>${closeBtn}`; body.querySelector('[data-act="close"]').onclick = close; renderWishlistGrid(true); return; }
  body.innerHTML = `
    <p class="hint" style="margin-top:0;">${esc(t('steam_import_intro'))}</p>
    <div class="steam-import-tools"><button type="button" class="btn-ghost" data-all>${esc(t('steam_import_all'))}</button><button type="button" class="btn-ghost" data-none>${esc(t('steam_import_none'))}</button></div>
    <div class="steam-import-list">${rows.map(r=>{ const have = inLibrary.has(r.g.id); return `
      <label class="steam-import-row${have?' in-library':''}">
        <input type="checkbox" value="${esc(r.g.id)}" checked ${have?'disabled':''}>
        <span class="sir-title">${esc(r.g.title)}${have? `<small>${esc(t('steam_import_in_library'))}</small>` : ''}</span>
        <span class="sir-hours">${r.minutes>0? esc(fmtHours(r.minutes)) : ''}</span>
      </label>`; }).join('')}</div>
    <div class="confirm-actions" style="margin-top:16px;">
      <button class="btn-ghost" data-act="close">${esc(t('back_generic'))}</button>
      <button class="btn gold" id="steamImportAdd"></button>
    </div>`;
  const boxes = ()=>[...body.querySelectorAll('.steam-import-row:not(.in-library) input')];
  const addBtn = body.querySelector('#steamImportAdd');
  const refresh = ()=>{ const n = boxes().filter(b=>b.checked).length; addBtn.textContent = t('steam_import_add').replace('{n}', n); addBtn.disabled = n===0; };
  body.addEventListener('change', refresh);
  body.querySelector('[data-all]').onclick = ()=>{ boxes().forEach(b=>b.checked=true); refresh(); };
  body.querySelector('[data-none]').onclick = ()=>{ boxes().forEach(b=>b.checked=false); refresh(); };
  body.querySelector('[data-act="close"]').onclick = close;
  addBtn.onclick = async ()=>{
    addBtn.disabled = true;
    try{ state.user.wishlist = (await apiPost('/profile/wishlist/add', { gameIds: boxes().filter(b=>b.checked).map(b=>b.value) })).wishlist; }
    catch(e){ toast(t('err_save_user')); addBtn.disabled = false; return; }
    toast(t('toast_steam_imported'));
    close();
    renderWishlistGrid();
  };
  refresh();
  renderWishlistGrid(true); // las horas recién traídas ya se ven detrás del modal
}
// Modal "Agregar juego" de la biblioteca: buscador + grilla del catálogo
// entero, cada card se puede tocar para sumar/sacar de la biblioteca sin
// cerrar el modal (así se pueden agregar varios juegos seguidos).
function openAddToWishlistModal(){
  if(!state.user) return;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal wishlist-pick-modal">
      <h3>${esc(t('wishlist_add_game_btn'))}</h3>
      <div class="field" style="margin-bottom:12px;">
        <label for="wishlistPickSearch">${esc(t('add_search_label'))}</label>
        <div class="search-wrap">
          <input type="text" id="wishlistPickSearch" placeholder="Elden Ring, Hades, Mario Kart…">
          <button type="button" class="search-clear" data-clears="wishlistPickSearch" hidden>✕</button>
        </div>
      </div>
      <div class="picker-grid" id="wishlistPickGrid"></div>
      <div class="confirm-actions" style="margin-top:16px;">
        <button class="btn gold" data-act="close">${esc(t('back_generic'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  function paint(){
    const q=foldText(document.getElementById('wishlistPickSearch').value).trim();
    const grid=document.getElementById('wishlistPickGrid');
    const games = allGames().filter(g=> foldText(g.title).includes(q)).slice(0,60);
    if(games.length===0){ grid.innerHTML = emptyState(ICONS.search, t('empty_pick_t'), t('empty_browse_s')); return; }
    grid.innerHTML='';
    games.forEach(g=>{
      const added = isWishlisted(g.id);
      const card=document.createElement('div');
      card.className='card pickcard'+(added?' featured':'');
      card.innerHTML = `<div class="gc-cover ${genreTint(primaryGenre(g))}" data-cover-title="${esc(g.title)}" data-cover-url="${esc(g.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(g)]||ICONS.gamepad}</div><div class="gc-title">${esc(g.title)}</div><div class="gc-sub">${added? t('wishlist_pick_added') : t('wishlist_pick_add')}</div>`;
      card.onclick = async ()=>{ await toggleWishlistQuiet(g.id); paint(); };
      grid.appendChild(card);
    });
  }
  paint();
  document.getElementById('wishlistPickSearch').oninput = paint;
  wireSearchClear('wishlistPickSearch');
  function cleanup(){
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="close"]').onclick = cleanup;
  document.addEventListener('keydown', onKey);
}
// Igual que toggleWishlist, pero solo vuelve a pintar la grilla de la biblioteca (no toda la vista) — para usar desde adentro de openAddToWishlistModal sin que el modal se cierre solo.
async function toggleWishlistQuiet(gameId){
  const adding = !(state.user.wishlist||[]).includes(gameId);
  try{
    const { wishlist } = await apiPost('/profile/wishlist/toggle', { gameId });
    state.user.wishlist = wishlist;
  }catch(e){ toast(t('err_save_user')); return; }
  toast(adding? t('toast_wishlist_added') : t('toast_wishlist_removed'));
  renderWishlistGrid();
}

/* ---------- helpers sueltos (sin relación con listas, pero vivían aquí en el archivo original) ---------- */
// Hash numérico bien simple de un string (para elegir un color de avatar estable a partir de un nombre de usuario/título). No es para nada criptográfico, solo para "elegir siempre el mismo color para el mismo texto".
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return h; }

// Atajo "Calificar este juego" (botón que aparece en cards sin abrir la ficha entera primero): va directo a la ficha del juego, recordando desde qué vista se vino para que el botón "Volver" funcione bien.
function jumpToRate(gameId){
  state.currentGame = gameId;
  state.gameOrigin = (state.view==='game') ? state.gameOrigin : state.view;
  goView('game');
}
// Borra tu reseña de un juego por completo (nota + texto + plataformas). Pide confirmación.
async function deleteReview(id){
  if(!await confirmDialog(t('confirm_delete'))) return;
  state.reviews = state.reviews.filter(r=>r.id!==id);
  if(await persistOrResync(()=> apiDelete('/reviews/id/'+encodeURIComponent(id)))) toast(t('toast_review_deleted'));
  goView(state.view==='game'?'game':state.view);
}

