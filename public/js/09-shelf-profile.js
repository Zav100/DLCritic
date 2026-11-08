/**
 * ARCHIVO 9 de 16 — Página de perfil (la tuya y la de otros usuarios),
 * la vista de Notificaciones, y el sistema de "seguir" a alguien.
 *
 * "Mi estantería" (tu propio perfil) y "/usuario/nombre" (el perfil
 * público de otro) son la MISMA función de render, renderProfileBody(),
 * con un flag `editable` que prende/apaga las partes que solo tiene
 * sentido ver en tu propio perfil (biblioteca, calendario de actividad,
 * botón de editar) vs las que solo aparecen en perfiles ajenos (botón de
 * seguir, contador de seguidores).
 *
 * Las Listas de un usuario se resumen aquí (una preview chica dentro del
 * perfil) pero su CRUD completo (crear/editar/agregar juegos) vive en
 * 10-lists.js — es el archivo siguiente.
 */
/* ---------- shelf (profile) ---------- */
// Arma un objeto "perfil" con la forma que espera renderProfileBody(), a partir de state.user (que tiene más campos que un perfil público, como el email — por eso no se puede pasar state.user directo).
function profileShapeFromSelf(u){
  return {
    username: u.username, joined: u.joined, favoriteGameId: u.favoriteGameId, favoritePlatinum: u.favoritePlatinum,
    bio: u.bio, avatarUrl: u.avatarUrl, socialLinks: u.socialLinks,
    isFollowing:false, isFriend:false, followerCount:0, followingCount:0,
  };
}
// "Mi estantería": tu propio perfil (siempre editable=true). Si no hay sesión, muestra el estado de "iniciá sesión para ver esto".
function renderShelf(){
  const el = document.getElementById('profileContent');
  if(!state.user){
    el.innerHTML = emptyState(ICONS.lock, t('empty_shelf_login_t'), t('empty_shelf_login_s'));
    const btn=document.createElement('a'); btn.href='/cuenta'; btn.className='btn gold'; btn.style.marginTop='14px'; btn.textContent=t('login_btn');
    btn.onclick=spa(()=>goView('auth')); el.appendChild(btn);
    return;
  }
  renderProfileBody(el, state.user.username, profileShapeFromSelf(state.user), true);
}
// Perfil público "/usuario/nombre". Si el nombre es el tuyo, redirige a la
// versión editable sin pedirle nada al servidor. Si es de otro, pide su
// perfil público a la API (que no incluye datos privados como el email).
function renderProfile(username){
  const el = document.getElementById('profileContent');
  const editable = !!(state.user && state.user.username.toLowerCase()===String(username||'').toLowerCase());
  if(editable){
    renderProfileBody(el, state.user.username, profileShapeFromSelf(state.user), true);
    return;
  }
  el.innerHTML = `<div class="empty"><div class="glyph">${ICONS.gamepad}</div><strong>${esc(t('loading_label'))}</strong></div>`;
  apiGet('/users/'+encodeURIComponent(username)).then(({user})=>{
    renderProfileBody(el, user.username, user, false);
  }).catch(()=>{
    el.innerHTML = emptyState(ICONS.helpCircle, t('profile_not_found_t'), t('profile_not_found_s'));
  });
}
// Panel «Juego favorito» del perfil: portada 16:9 y título (enlaces a la ficha), géneros, la nota que le puso esa persona y, en la fila de logros, el listón
// de platino. El platino lo marca el dueño a mano (PlayStation no tiene API de trofeos); la barra «obtenidos / total» de Steam irá en esa misma fila.
// Sin favorito, el dueño ve una invitación a elegir uno y las demás personas no ven el panel.
function favPanelHTML(profile, favGame, editable, reviews){
  if(!favGame && !editable) return '';
  const head = `<div class="sectionhead"><h2>${esc(t('game_fav_label'))}</h2></div>`;
  if(!favGame){
    return head + `<div class="card fav-panel fav-empty" id="favPanel"><span class="fav-muted">${esc(t('fav_not_chosen'))}</span><button class="btn-fav pulse" id="favPickBtn">${ICONS.star} ${t('choose_fav_btn')}</button></div>`;
  }
  const rv = reviews.find(r=>r.gameId===favGame.id && r.rating!=null);
  const href = gameHref(favGame.id);
  const genres = (favGame.genres && favGame.genres.length) ? favGame.genres : [favGame.genre || 'Otro'];
  const platinum = !!profile.favoritePlatinum;
  return head + `
    <div class="card fav-panel" id="favPanel">
      <a class="fav-cover-link" id="favCoverLink" href="${esc(href)}" aria-label="${esc(favGame.title)}">
        <div class="gc-cover ${genreTint(primaryGenre(favGame))}" data-cover-title="${esc(favGame.title)}" data-cover-url="${esc(favGame.coverUrl||'')}">${GENRE_EMOJI[primaryGenre(favGame)]||ICONS.gamepad}</div>
      </a>
      <div class="fav-info">
        <a class="fav-title" id="favTitleLink" href="${esc(href)}">${esc(favGame.title)}</a>
        <div class="fav-genres">${genres.map(gn=>`<span class="fav-genre">${esc(genreLabel(gn))}</span>`).join('')}</div>
        <div class="fav-row">
          <div class="fav-label">${esc(t(editable? 'fav_rating_you' : 'fav_rating_other'))}</div>
          ${rv? '<div id="favGauge"></div>' : `<span class="no-rating-tag">${esc(t('no_rating_yet'))}</span>`}
        </div>
        ${(platinum || editable)? `<div class="fav-row">
          <div class="fav-label">${esc(t('fav_achievements'))}</div>
          <div class="fav-achv">
            ${platinum? `<span class="platinum-badge">${ICONS.ribbon}<span>${esc(t('fav_platinum'))}</span></span>` : `<span class="fav-muted">${esc(t('fav_no_platinum'))}</span>`}
            ${editable? `<button type="button" class="btn small" id="platinumBtn">${esc(t(platinum? 'fav_platinum_unmark' : 'fav_platinum_mark'))}</button>` : ''}
          </div>
        </div>` : ''}
        ${editable? `<button class="btn-fav" id="favPickBtn">${ICONS.star} ${t('change_fav_btn')}</button>` : ''}
      </div>
    </div>`;
}
// Engancha el panel recién pintado: los dos enlaces a la ficha (sin recargar), la barra de la nota y el botón de platino.
function wireFavPanel(profile, favGame, editable, reviews){
  if(!favGame) return;
  const open = spa(()=>{ state.currentGame = favGame.id; state.gameOrigin = 'shelf'; goView('game'); });
  ['favCoverLink','favTitleLink'].forEach(id=>{ const a=document.getElementById(id); if(a) a.onclick = open; });
  const rv = reviews.find(r=>r.gameId===favGame.id && r.rating!=null);
  const gauge = document.getElementById('favGauge');
  if(rv && gauge) renderGauge(gauge, rv.rating);
  const btn = document.getElementById('platinumBtn');
  if(editable && btn) btn.onclick = async ()=>{
    const next = !state.user.favoritePlatinum;
    state.user.favoritePlatinum = next;
    try{ await apiPut('/profile/favorite/platinum', { platinum: next }); }
    catch(e){ state.user.favoritePlatinum = !next; toast(t('err_save_user')); renderShelf(); return; }
    toast(t(next? 'toast_platinum_on' : 'toast_platinum_off'));
    renderShelf();
    if(next) celebrateFavorite(document.querySelector('.platinum-badge'));
  };
}
// LA función que arma toda la página de un perfil (propio o ajeno): cabecera
// (avatar/bio/redes + botón editar o seguir), stats (reseñas/promedio/racha/
// nivel), género y juego y plataforma favoritos, selector de juego favorito
// (solo si editable), preview de listas, biblioteca (solo si editable),
// calendario de actividad (solo si editable), reseñas del usuario, y logros.
// `editable` decide qué mitad de las cosas de arriba se muestra.
function renderProfileBody(el, username, profile, editable){
  const s = userStats(username);
  s.hasAvatar = !!profile.avatarUrl;
  s.hasBio = !!(profile.bio && profile.bio.trim());
  const mine = s.reviews.filter(hasReviewContent).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const avg = mine.length? Math.round((mine.reduce((sum,r)=>sum+r.rating,0)/mine.length)*10)/10 : 0;
  const color = AVATAR_COLORS[Math.abs(hashStr(username))%AVATAR_COLORS.length];
  const lvl = computeLevel(s.count);
  const toNext = lvl.next ? (lvl.next.min - s.count) : 0;
  const favGame = profile.favoriteGameId ? findGame(profile.favoriteGameId) : null;

  const avatarHTML = profile.avatarUrl
    ? `<img class="avatar-img" src="${esc(profile.avatarUrl)}" alt="">`
    : `<div class="avatar" style="background:${color}">${esc(username[0].toUpperCase())}</div>`;

  const headActionsHTML = editable
    ? `<a class="btn-edit-profile" id="editProfileBtn" href="/ajustes">${ICONS.edit} ${t('profile_edit_btn')}</a>`
    : (state.user ? `
        <button class="wishlist-btn ${profile.isFollowing?'active':''}" id="followBtn">${ICONS.heart} ${profile.isFollowing? t('following_label') : t('follow_btn')}</button>
        ${profile.isFriend? `<span class="first-badge">${esc(t('friends_badge'))}</span>` : ''}
      ` : '');

  const statsExtraHTML = !editable ? `
      <div class="statbox"><div class="n" id="followerCountEl" style="color:var(--teal-dim);">${profile.followerCount}</div><div class="l">${t('followers_label')}</div></div>
      <div class="statbox"><div class="n" style="color:var(--gold-dim);">${profile.followingCount}</div><div class="l">${t('following_count_label')}</div></div>
  ` : '';

  el.innerHTML = `
    <div class="profilehead">
      ${avatarHTML}
      <div style="flex:1; min-width:0;">
        <div class="rc-game" style="font-size:20px; color:var(--fg);">${esc(username)}</div>
        <div class="rc-meta" style="color:var(--fg-soft);">${t('member_since')} ${fmtDate(profile.joined)}</div>
        ${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">${headActionsHTML}</div>
    </div>

    ${socialLinksHTML(profile.socialLinks)}

    <div class="statsrow">
      <div class="statbox"><div class="n" style="color:var(--teal-dim);">${s.count}</div><div class="l">${t('reviews_label')}</div></div>
      <div class="statbox"><div class="n" style="color:var(--gold-dim);">${avg||'—'}</div><div class="l">${t('avg_label')}</div></div>
      <div class="statbox"><div class="n" style="color:var(--pink-dim);">${ICONS.flame} ${s.streak}</div><div class="l">${t('streak_label')}</div></div>
      ${statsExtraHTML}
      <div class="statbox">
        <div class="n" style="font-size:19px; color:var(--gold-dim);">${lvl.current.icon} ${t(lvl.current.nameKey)}</div>
        <div class="l">${lvl.next? `${t('missing_for')} ${toNext} ${t('to_reach')} ${t(lvl.next.nameKey)}`.trim() : t('max_level')}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div class="infogrid" style="margin-top:0; padding-top:0; border-top:none;">
        <div class="infoitem"><div class="il">${t('genre_fav_label')}</div><div class="iv">${s.favGenre? (GENRE_EMOJI[s.favGenre]||ICONS.gamepad)+' '+esc(genreLabel(s.favGenre)) : '—'}</div></div>
        <div class="infoitem"><div class="il">${t('platform_fav_label')}</div><div class="iv">${s.favPlatform || '—'}</div></div>
        ${editable ? `
        <div class="infoitem center">
          <div class="il">${t('wishlist_progress_label')}</div>
          ${renderProgressRing(wishlistPlayedStats().percent)}
        </div>` : ''}
      </div>
    </div>

    ${favPanelHTML(profile, favGame, editable, s.reviews)}

    ${editable ? `
    <div class="card" id="favPickerPanel" hidden style="margin-bottom:22px;">
      <div class="field" style="margin-bottom:12px;">
        <label for="favSearch" data-i18n="add_search_label">${t('add_search_label')}</label>
        <div class="search-wrap">
          <input type="text" id="favSearch" placeholder="Elden Ring, Hades, Mario Kart…">
          <button type="button" class="search-clear" data-clears="favSearch" hidden>✕</button>
        </div>
      </div>
      <div class="picker-grid" id="favPickGrid"></div>
    </div>` : ''}

    <div class="sectionhead"><h2>${t('lists_title')}</h2><span class="count" id="listsCount">0</span></div>
    <div class="grid" id="listsGrid" style="margin-bottom:22px;"></div>

    ${editable ? `
    <div class="sectionhead"><h2>${t('wishlist_title')}</h2><span class="count" id="wishlistCount">${(state.user.wishlist||[]).length}</span></div>
    <div class="library-actions">
      <p class="hint library-hint">${state.user.libraryPublic? ICONS.globe : ICONS.lock} ${esc(t(state.user.libraryPublic? 'library_hint_public' : 'library_hint_private'))} <a href="/ajustes" id="libraryPrivacyLink">${esc(t('library_hint_change'))}</a></p>
      ${state.user.steam? `<button type="button" class="btn small" id="steamImportBtn">${esc(t('steam_import_btn'))}</button>` : ''}
    </div>
    <div class="grid wishlist-grid" id="wishlistGrid" style="margin-bottom:8px;"></div>
    ` : (profile.library && profile.library.some(id=>findGame(id)) ? `
    <div class="sectionhead"><h2>${t('library_title_other')}</h2><span class="count">${profile.library.filter(id=>findGame(id)).length}</span></div>
    <div class="grid wishlist-grid" id="publicLibraryGrid" style="margin-bottom:22px;"></div>` : '')}

    <div class="shelf-layout">
      <div class="shelf-main">
        ${editable ? `
        <div class="sectionhead" style="margin-top:0;"><h2>${t('activity_title')}</h2><span class="count">${t('activity_days')}</span></div>
        <div class="card" style="margin-bottom:22px;">
          <div id="activityCal"></div>
        </div>` : ''}
        <div class="sectionhead" style="margin-top:0;"><h2>${t(editable? 'your_reviews_title' : 'reviews_section_title')}</h2><span class="count">${mine.length}</span></div>
        <div id="shelfList"></div>
      </div>
      <aside class="shelf-side">
        <div class="sectionhead" style="margin-top:0;"><h2>${t('achievements_title')}</h2><span class="count">${ACHIEVEMENTS.filter(a=>a.check(s)).length}/${ACHIEVEMENTS.length}</span></div>
        <div class="card">
          <div class="badges-list" id="badgesGrid"></div>
        </div>
      </aside>
    </div>
  `;

  if(editable){
    document.getElementById('favPickBtn').onclick = ()=>{
      const panel=document.getElementById('favPickerPanel');
      panel.hidden = !panel.hidden;
      if(!panel.hidden){
        const input=document.getElementById('favSearch');
        input.value='';
        paintFavPickGrid();
        input.oninput = paintFavPickGrid;
        wireSearchClear('favSearch');
        input.focus();
      }
    };
    renderWishlistGrid();
    document.getElementById('libraryPrivacyLink').onclick = spa(()=> goView('settings'));
    const importBtn = document.getElementById('steamImportBtn');
    if(importBtn) importBtn.onclick = openSteamImportModal;
    renderActivityCalendar(document.getElementById('activityCal'), username);
    document.getElementById('editProfileBtn').onclick = spa(()=> goView('settings'));
  } else if(state.user){
    document.getElementById('followBtn').onclick = ()=> toggleFollow(username);
  }
  const publicGrid = document.getElementById('publicLibraryGrid');
  if(publicGrid) profile.library.map(id=>findGame(id)).filter(Boolean).forEach(g=> publicGrid.appendChild(libraryCard(g, profile.libraryHours && profile.libraryHours[g.id])));

  wireFavPanel(profile, favGame, editable, s.reviews);

  const badgesWrap=document.getElementById('badgesGrid');
  badgesWrap.innerHTML = ACHIEVEMENTS.map(a=>{
    const unlocked = a.check(s);
    return `<div class="badge-row ${unlocked?'unlocked':''}">
      <div class="bi">${a.icon}</div>
      <div class="btxt"><div class="bt">${esc(t(a.titleKey))}</div><div class="bd">${esc(t(a.descKey))}</div></div>
    </div>`;
  }).join('');

  renderProfileLists(username, editable);

  state.shelfReviews = mine;
  state.shelfReviewsEditable = editable;
  renderShelfReviewsList();
}
/* ---------- preview de listas dentro del perfil (el CRUD completo está en 10-lists.js) ---------- */
// Pinta la grilla de listas de un usuario dentro de un contenedor dado.
// gridId/countId son parametrizables porque esta MISMA función se usa
// tanto para la preview chica dentro del perfil (listsGrid/listsCount)
// como para la vista completa "/mis-listas" (listsViewGrid/listsViewCount)
// — ver renderListsView() más abajo. Guarda en state.listsRenderTarget a
// cuál de las dos hay que volver a pintar después de crear/borrar una lista.
async function renderProfileLists(username, editable, gridId, countId){
  gridId = gridId || 'listsGrid';
  countId = countId || 'listsCount';
  state.listsRenderTarget = { gridId, countId };
  const grid = document.getElementById(gridId);
  const countEl = document.getElementById(countId);
  try{
    const { lists } = editable ? await apiGet('/lists/mine') : await apiGet('/users/'+encodeURIComponent(username)+'/lists');
    state.profileLists = lists;
    state.profileListsEditable = editable;
    state.profileListsUsername = username;
    if(countEl) countEl.textContent = lists.length;
    if(!grid) return;
    if(lists.length===0 && !editable){
      grid.innerHTML = emptyState(ICONS.bookmark, t('empty_lists_other_t'), t('empty_lists_other_s'));
      return;
    }
    grid.innerHTML='';
    lists.forEach(list=>{
      const card=document.createElement('div');
      card.className='card list-card';
      card.innerHTML=`
        <div class="list-card-head">
          <span class="list-visibility-icon" title="${list.isPublic? esc(t('list_public_label')) : esc(t('list_private_label'))}">${list.isPublic? ICONS.globe : ICONS.lock}</span>
          <div class="gc-title" style="margin:0;">${esc(list.title)}</div>
        </div>
        <div class="gc-sub">${list.gameIds.length} ${t(list.gameIds.length===1 ? 'game_count_label' : 'games_count_label')}</div>
      `;
      card.onclick = ()=> openListDetailModal(list.id);
      grid.appendChild(card);
    });
    if(editable){
      const createTile=document.createElement('div');
      createTile.className='card list-create-tile';
      createTile.innerHTML = `${ICONS.plus}<span>${t('list_create_btn')}</span>`;
      createTile.onclick = openCreateListModal;
      grid.appendChild(createTile);
    }
  }catch(e){
    if(grid) grid.innerHTML = emptyState(ICONS.helpCircle, t('empty_lists_other_t'), t('empty_lists_other_s'));
  }
}
// Vista "/mis-listas": todas TUS listas, sin el resto del perfil alrededor.
function renderListsView(){
  if(!state.user){
    const el = document.getElementById('listsViewGrid');
    document.getElementById('listsViewCount').textContent = 0;
    el.innerHTML = emptyState(ICONS.lock, t('empty_login_t'), t('empty_login_s'));
    const btn=document.createElement('a'); btn.href='/cuenta'; btn.className='btn gold'; btn.style.marginTop='14px'; btn.textContent=t('login_btn');
    btn.onclick=spa(()=>goView('auth')); el.appendChild(btn);
    return;
  }
  renderProfileLists(state.user.username, true, 'listsViewGrid', 'listsViewCount');
}
/* ---------- notificaciones ---------- */
// Vista "/notificaciones": te siguieron / le sirvió tu reseña a alguien.
// Al abrir la vista, si había notificaciones sin leer, las marca como
// leídas en el servidor y actualiza el puntito rojo del header.
async function renderNotificationsView(){
  const el = document.getElementById('notificationsList');
  const countEl = document.getElementById('notificationsCount');
  if(!state.user){
    countEl.textContent = 0;
    el.innerHTML = emptyState(ICONS.lock, t('empty_login_t'), t('empty_login_s'));
    const btn=document.createElement('a'); btn.href='/cuenta'; btn.className='btn gold'; btn.style.marginTop='14px'; btn.textContent=t('login_btn');
    btn.onclick=spa(()=>goView('auth')); el.appendChild(btn);
    return;
  }
  try{
    const { notifications } = await apiGet('/notifications');
    state.notifications = notifications;
  }catch(e){}
  const list = state.notifications || [];
  countEl.textContent = list.length;
  if(list.length===0){
    el.innerHTML = emptyState(ICONS.bell, t('empty_notifications_t'), t('empty_notifications_s'));
  } else {
    el.innerHTML = '';
    list.forEach(n=>{
      const game = n.gameId ? findGame(n.gameId) : null;
      const actor = esc(n.actorUsername);
      const gameTitle = game ? esc(game.title) : '';
      const text = n.type==='follow'
        ? (state.lang==='en' ? `<b>${actor}</b> started following you` : `<b>${actor}</b> empezó a seguirte`)
        : (state.lang==='en' ? `<b>${actor}</b> found your review of ${gameTitle} helpful` : `A <b>${actor}</b> le pareció útil tu reseña de ${gameTitle}`);
      const href = n.type==='follow' ? profileHref(n.actorUsername) : (game ? gameHref(game.id) : null);
      const row = document.createElement('div');
      row.className = 'card notif-row' + (href? ' has-card-link' : '') + (n.read? '' : ' unread');
      row.innerHTML = `
        ${href? cardLinkHTML(href, n.type==='follow'? n.actorUsername : gameTitle) : ''}
        <div class="notif-icon">${n.type==='follow'? ICONS.heart : ICONS.thumbsUp}</div>
        <div class="notif-body">
          <div class="notif-text">${text}</div>
          <div class="notif-date">${fmtDate(n.createdAt)}</div>
        </div>
      `;
      row.onclick = spa(()=>{
        if(n.type==='follow'){ state.profileUsername = n.actorUsername; goView('profile'); }
        else if(game){ state.currentGame = game.id; state.gameOrigin='feed'; goView('game'); }
      });
      el.appendChild(row);
    });
  }
  if(list.some(n=>!n.read)){
    try{ await apiPost('/notifications/read'); }catch(e){}
    state.notifications = list.map(n=>({...n, read:true}));
    renderUserBadge();
  }
}
/* ---------- seguir a un usuario ---------- */
// Sigue/deja de seguir a un usuario desde su perfil, y actualiza el botón + contador de seguidores + medallita de "Amigos" (se siguen mutuamente) en el lugar, sin re-renderizar todo el perfil.
async function toggleFollow(username){
  if(!state.user){ goView('auth'); return; }
  try{
    const res = await apiPost('/users/'+encodeURIComponent(username)+'/follow', {});
    const countEl = document.getElementById('followerCountEl');
    if(countEl) countEl.textContent = res.followerCount;
    const btn = document.getElementById('followBtn');
    if(btn){
      btn.classList.toggle('active', res.isFollowing);
      btn.innerHTML = `${ICONS.heart} ${res.isFollowing? esc(t('following_label')) : esc(t('follow_btn'))}`;
      const wrap = btn.parentElement;
      let badge = wrap ? wrap.querySelector('.first-badge') : null;
      if(res.isFriend && !badge && wrap){
        badge = document.createElement('span');
        badge.className = 'first-badge';
        badge.textContent = t('friends_badge');
        wrap.appendChild(badge);
      } else if(!res.isFriend && badge){
        badge.remove();
      }
    }
  }catch(e){ toast(t('err_save_user')); }
}
