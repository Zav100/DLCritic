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
    username: u.username, joined: u.joined, favoriteGameId: u.favoriteGameId, favoritePlatinum: u.favoritePlatinum, favoriteSteam: u.favoriteSteam,
    bio: u.bio, avatarUrl: u.avatarUrl, isSubscriber: u.isSubscriber, rankIconStyle: u.rankIconStyle, socialLinks: u.socialLinks,
    isFollowing:false, isFriend:false, followerCount:u.followerCount||0, followingCount:u.followingCount||0,
  };
}
// "Mi estantería": tu propio perfil (siempre editable=true). Si no hay sesión, muestra el estado de "inicia sesión para ver esto".
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
// Fila «Logros del juego» del panel de favorito. Si el juego está en la cuenta de Steam de la persona (profile.favoriteSteam), los logros salen de Steam:
// barra «obtenidos / total» y el listón de platino aparece solo cuando están todos; no hay botón. Si no, el platino lo marca el dueño a mano
// (PlayStation y los demás no tienen API de trofeos). Devuelve '' si no hay nada que mostrar.
function favAchievementsHTML(profile, editable){
  const st = profile.favoriteSteam, platinum = !!profile.favoritePlatinum;
  const badge = platinum? `<span class="platinum-badge">${ICONS.ribbon}<span>${esc(t('fav_platinum'))}</span></span>` : '';
  let body;
  if(st){
    if(st.total>0) body = '<div id="favAchGauge"></div>' + badge;
    else if(st.total===0) body = `<span class="fav-muted">${esc(t('fav_ach_none'))}</span>`;
    else if(editable) body = `<span class="fav-muted">${esc(t('fav_ach_missing'))}</span>`; // Steam no los dio (privado o caído): solo se le avisa al dueño
    else return '';
  } else {
    if(!platinum && !editable) return '';
    body = (badge || `<span class="fav-muted">${esc(t('fav_no_platinum'))}</span>`)
      + (editable? `<button type="button" class="btn small" id="platinumBtn">${esc(t(platinum? 'fav_platinum_unmark' : 'fav_platinum_mark'))}</button>` : '');
  }
  return `<div class="fav-row"><div class="fav-label">${esc(t('fav_achievements'))}</div><div class="fav-achv">${body}</div></div>`;
}
// Panel «Juego favorito» del perfil: portada 16:9 y título (enlaces a la ficha), géneros, la nota que le puso esa persona, las horas de Steam (si el juego
// está en su cuenta de Steam y no las ocultó) y la fila de logros (ver favAchievementsHTML).
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
  const st = profile.favoriteSteam;
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
        ${st? `<div class="fav-row"><div class="fav-label">${esc(t('fav_hours'))}</div><span class="hours-tag">${ICONS.clock} ${esc(fmtHours(st.minutes))}</span></div>` : ''}
        ${favAchievementsHTML(profile, editable)}
        ${editable? `<button class="btn-fav" id="favPickBtn">${ICONS.star} ${t('change_fav_btn')}</button>` : ''}
      </div>
    </div>`;
}
// Engancha el panel recién pintado: los dos enlaces a la ficha (sin recargar), la barra de la nota, la de logros y el botón de platino.
function wireFavPanel(profile, favGame, editable, reviews){
  if(!favGame) return;
  const open = spa(()=>{ state.currentGame = favGame.id; state.gameOrigin = 'shelf'; goView('game'); });
  ['favCoverLink','favTitleLink'].forEach(id=>{ const a=document.getElementById(id); if(a) a.onclick = open; });
  const rv = reviews.find(r=>r.gameId===favGame.id && r.rating!=null);
  const gauge = document.getElementById('favGauge');
  if(rv && gauge) renderGauge(gauge, rv.rating);
  const achGauge = document.getElementById('favAchGauge');
  if(achGauge && profile.favoriteSteam) renderGauge(achGauge, profile.favoriteSteam.unlocked, profile.favoriteSteam.total);
  const btn = document.getElementById('platinumBtn');
  if(editable && btn) btn.onclick = async ()=>{
    const next = !state.user.favoritePlatinum;
    state.user.favoritePlatinum = next;
    try{ await apiPut('/profile/favorite/platinum', { platinum: next }); }
    catch(e){ state.user.favoritePlatinum = !next; toast(t('err_save_user'), 'bad'); renderShelf(); return; }
    toast(t(next? 'toast_platinum_on' : 'toast_platinum_off'), next? 'good' : undefined);
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
  const byDate = (a,b)=> new Date(b.date)-new Date(a.date);
  const mine = s.reviews.filter(hasReviewContent).sort(byDate); // pestaña «Reseñas»: las que tienen texto
  const rated = s.reviews.filter(r=>r.rating!=null).sort(byDate); // pestaña «Calificaciones»: todas las notas, con o sin reseña
  const avg = rated.length? Math.round((rated.reduce((sum,r)=>sum+r.rating,0)/rated.length)*10)/10 : 0;
  if(state.profileTabUser!==username){ state.profileTabUser = username; state.profileTab = 'reviews'; } // al cambiar de perfil se vuelve a la primera pestaña
  const color = AVATAR_COLORS[Math.abs(hashStr(username))%AVATAR_COLORS.length];
  const counts = levelCounts(username);
  const lvl = computeLevel(counts);
  const favGame = profile.favoriteGameId ? findGame(profile.favoriteGameId) : null;

  const riAttrs = rankIconAttrs(profile.isSubscriber, profile.rankIconStyle); // insignia del rango rellena si es suscriptor
  const avatarHTML = subRing(profile.avatarUrl
    ? `<img class="avatar-img" src="${esc(profile.avatarUrl)}" alt="">`
    : `<div class="avatar" style="background:${color}">${esc(username[0].toUpperCase())}</div>`, profile.isSubscriber);

  const headActionsHTML = editable
    ? `<a class="btn-edit-profile" id="editProfileBtn" href="/ajustes">${ICONS.edit} ${t('profile_edit_btn')}</a>`
    : (state.user ? `
        <button class="wishlist-btn ${profile.isFollowing?'active':''}" id="followBtn">${ICONS.heart} ${profile.isFollowing? t('following_label') : t('follow_btn')}</button>
        ${profile.isFriend? `<span class="first-badge">${esc(t('friends_badge'))}</span>` : ''}
        <button type="button" class="wishlist-btn" id="reportUserBtn" title="${esc(t('report_btn'))}" aria-label="${esc(t('report_btn'))}">${ICONS.flag}</button>
      ` : '');

  // Progreso hacia el siguiente rango (0 a 100 %) y qué falta para llegar (ver levelProgress y levelMissingText en 07-stats-share-modals.js).
  const levelPct = levelProgress(counts, lvl);
  const levelNextText = lvl.next ? levelMissingText(counts, lvl.next) : t('max_level');

  // Seguidores y seguidos, en todos los perfiles (también el propio): botones con aspecto de enlace que abren la lista (openFollowListModal).
  const followsHTML = `
      <button type="button" class="follow-link" data-follow-list="followers" aria-label="${esc(t('follow_list_open_followers'))}"><b id="followerCountEl">${profile.followerCount||0}</b> <span>${t('followers_label')}</span></button>
      <button type="button" class="follow-link" data-follow-list="following" aria-label="${esc(t('follow_list_open_following'))}"><b id="followingCountEl">${profile.followingCount||0}</b> <span>${t('following_count_label')}</span></button>
  `;
  const noData = `<span class="tl">${esc(t('no_data_yet'))}</span>`;

  // Encabezado del perfil en tres bloques: tarjeta de identidad (foto con la insignia del nivel, nombre, nivel y progreso, descripción, seguidores y redes),
  // franja de estadísticas (una sola tarjeta con celdas) y las píldoras de gustos (género y plataforma favoritos).
  el.innerHTML = `
    <div class="profile-card"${editable? ' data-own' : ''}>
      <div class="profile-avatar">${avatarHTML}<span class="profile-level-badge${riAttrs.cls}"${riAttrs.style} title="${esc(t(lvl.current.nameKey))}">${lvl.current.icon}</span></div>
      <div class="profile-card-main">
        <div class="profile-card-top">
          <div class="profile-id">
            <div class="profile-name">${esc(username)}</div>
            <div class="profile-since">${t('member_since')} ${fmtDate(profile.joined)}</div>
          </div>
          <div class="profile-actions">${headActionsHTML}</div>
        </div>
        <div class="profile-level">
          <span class="level-chip">${lvl.current.icon} ${esc(t(lvl.current.nameKey))}</span>
          <div class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${levelPct}"><i style="width:${levelPct}%"></i></div>
          <span class="level-next">${esc(levelNextText)}</span>
        </div>
        ${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ''}
        <div class="profile-follows">${followsHTML}</div>
        ${socialLinksHTML(profile.socialLinks)}
      </div>
    </div>

    <div class="statsstrip">
      <div class="statscell"><div class="n">${mine.length}</div><div class="l">${t('reviews_label')}</div></div>
      <div class="statscell"><div class="n">${rated.length}</div><div class="l">${t('ratings_label')}</div></div>
      <div class="statscell"><div class="n">${avg||'—'}</div><div class="l">${t('avg_label')}</div></div>
      <div class="statscell"><div class="n">${ICONS.flame} ${s.streak}</div><div class="l">${t('streak_label')}</div></div>
      ${editable ? `<div class="statscell ring">${renderProgressRing(wishlistPlayedStats().percent)}<div class="l">${t('wishlist_progress_label')}</div></div>` : ''}
    </div>

    <div class="taste-row">
      <span class="taste-pill${s.favGenre? '' : ' empty'}">${s.favGenre? (GENRE_EMOJI[s.favGenre]||ICONS.gamepad) : ICONS.gamepad}<span class="tl">${t('genre_fav_label')}</span> ${s.favGenre? esc(genreLabel(s.favGenre)) : noData}</span>
      <span class="taste-pill${s.favPlatform? '' : ' empty'}">${ICONS.layers}<span class="tl">${t('platform_fav_label')}</span> ${s.favPlatform? esc(s.favPlatform) : noData}</span>
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

    ${editable ? `
    <div class="sectionhead"><h2>${t('wishlist_title')}</h2></div>
    <div class="library-actions">
      <p class="hint library-hint">${state.user.libraryPublic? ICONS.globe : ICONS.lock} ${esc(t(state.user.libraryPublic? 'library_hint_public' : 'library_hint_private'))} <a href="/ajustes" id="libraryPrivacyLink">${esc(t('library_hint_change'))}</a></p>
      <button type="button" class="btn small" id="libraryAddBtn">${ICONS.plus} ${esc(t('wishlist_add_game_btn'))}</button>
    </div>
    <div class="grid wishlist-grid" id="wishlistGrid" style="margin-bottom:8px;"></div>
    ` : (profile.library && profile.library.some(id=>findGame(id)) ? `
    <div class="sectionhead"><h2>${t('library_title_other')}</h2></div>
    <div id="publicLibrary" style="margin-bottom:22px;"><div class="grid wishlist-grid" id="publicLibraryGrid"></div></div>` : '')}

    <div class="sectionhead"><h2>${t('lists_title')}</h2></div>
    <div class="grid" id="listsGrid" style="margin-bottom:22px;"></div>

    <div class="shelf-layout">
      <div class="shelf-main">
        ${editable ? `
        <div class="sectionhead" style="margin-top:0;"><h2>${t('activity_title')}</h2><span class="count">${t('activity_days')}</span></div>
        <div class="card" style="margin-bottom:36px;">
          <div id="activityCal"></div>
        </div>` : ''}
        <div class="profile-tabs" role="tablist">
          <button type="button" role="tab" class="profile-tab" data-ptab="reviews" aria-selected="${state.profileTab!=='ratings'}">${t('tab_reviews')} <span class="count">${mine.length}</span></button>
          <button type="button" role="tab" class="profile-tab" data-ptab="ratings" aria-selected="${state.profileTab==='ratings'}">${t('tab_ratings')} <span class="count">${rated.length}</span></button>
        </div>
        <div id="shelfList" role="tabpanel"></div>
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
    document.getElementById('libraryPrivacyLink').onclick = spa(()=>{ state.settingsTab = 'connections'; goView('settings'); });
    document.getElementById('libraryAddBtn').onclick = openAddToWishlistModal;
    renderActivityCalendar(document.getElementById('activityCal'), username);
    document.getElementById('editProfileBtn').onclick = spa(()=> goView('settings'));
  } else if(state.user){
    document.getElementById('followBtn').onclick = ()=> toggleFollow(username);
    document.getElementById('reportUserBtn').onclick = ()=> openReportModal('user', username);
  }
  el.querySelectorAll('[data-follow-list]').forEach(b=>{ b.onclick = ()=> openFollowListModal(username, b.dataset.followList, editable); });
  makeZoomable(el.querySelector('.profile-avatar .avatar-img'), profile.avatarUrl, username); // la foto de perfil se abre en grande (sin foto, la letra no hace nada)
  if(editable) refreshOwnFollowCounts();
  const bioEl = el.querySelector('.profile-bio');
  if(bioEl) wireProfileBio(bioEl, profile.bio, username);
  renderPublicLibrary(profile);

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
  state.shelfRatings = rated;
  state.shelfReviewsEditable = editable;
  el.querySelectorAll('[data-ptab]').forEach(b=>{
    b.onclick = ()=>{
      state.profileTab = b.dataset.ptab;
      el.querySelectorAll('[data-ptab]').forEach(x=> x.setAttribute('aria-selected', String(x===b)));
      renderShelfReviewsList();
    };
  });
  renderShelfReviewsList();
}
// Avatar chico (la foto, o la inicial en un círculo de color) para las listas de personas: el buscador del header y la lista de seguidores.
function miniAvatarHTML(username, avatarUrl, isSub){
  if(avatarUrl) return subRing(`<img class="mini-avatar" src="${esc(avatarUrl)}" alt="" loading="lazy" decoding="async">`, isSub);
  const color = AVATAR_COLORS[Math.abs(hashStr(username))%AVATAR_COLORS.length];
  return subRing(`<span class="mini-avatar" style="background:${color}">${esc(username[0].toUpperCase())}</span>`, isSub);
}
// Abre el perfil de una persona: el propio es Mi estantería; el de otra persona, su perfil público.
function openProfileOf(username){
  if(state.user && state.user.username.toLowerCase()===username.toLowerCase()) goView('shelf');
  else { state.profileUsername = username; goView('profile'); }
}
// El perfil propio se pinta con los contadores que trajo la sesión; aquí se piden de nuevo por si alguien siguió o dejó de seguir mientras tanto.
// Solo se toca el contador que está dentro de un .profile-card[data-own]: si mientras tanto se abrió el perfil de otra persona, su contador no se pisa.
async function refreshOwnFollowCounts(){
  try{
    const { user } = await apiGet('/users/'+encodeURIComponent(state.user.username));
    state.user.followerCount = user.followerCount; state.user.followingCount = user.followingCount;
    const followers = document.querySelector('.profile-card[data-own] #followerCountEl'), following = document.querySelector('.profile-card[data-own] #followingCountEl');
    if(followers) followers.textContent = user.followerCount;
    if(following) following.textContent = user.followingCount;
  }catch(e){ /* se queda el número que había */ }
}
// Ventana con quiénes siguen a una persona (kind 'followers') o a quiénes sigue (kind 'following'); se abre al tocar los contadores de un perfil.
// Cada fila lleva al perfil de esa persona. El servidor manda las 100 más recientes y el total.
async function openFollowListModal(username, kind, isSelf){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box follow-list-modal" role="dialog" aria-modal="true" aria-labelledby="followListTitle">
      <h3 id="followListTitle">${esc(t(kind==='followers'? 'follow_list_followers_title' : 'follow_list_following_title'))}</h3>
      <p class="hint follow-list-owner">${esc(username)}</p>
      <div id="followListBody"><p class="hint">${esc(t('loading_label'))}</p></div>
      <div class="confirm-actions" style="margin-top:16px;"><button type="button" class="btn-ghost" data-act="close">${esc(t('close_btn'))}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = ()=>{ overlay.remove(); document.removeEventListener('keydown', onKey); };
  function onKey(e){ if(e.key==='Escape') close(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  overlay.querySelector('[data-act="close"]').onclick = close;
  document.addEventListener('keydown', onKey);
  const body = overlay.querySelector('#followListBody');
  try{
    const { total, users } = await apiGet('/users/'+encodeURIComponent(username)+'/'+kind);
    if(!users.length){ body.innerHTML = `<p class="hint">${esc(t('follow_list_empty_'+kind+(isSelf? '_self' : '_other')))}</p>`; return; }
    body.innerHTML = `<div class="follow-rows">${users.map(u=>`<a class="follow-row" href="/usuario/${encodeURIComponent(u.username)}" data-user="${esc(u.username)}">${miniAvatarHTML(u.username, u.avatarUrl, u.isSubscriber)}<span>${esc(u.username)}</span></a>`).join('')}</div>`
      + (total>users.length? `<p class="hint" style="margin:10px 0 0;">${esc(t('follow_list_more').replace('{n}', users.length).replace('{total}', total))}</p>` : '');
    body.querySelectorAll('.follow-row').forEach(a=>{ a.onclick = spa(()=>{ close(); openProfileOf(a.dataset.user); }); });
  }catch(e){ body.innerHTML = `<p class="error">${esc(t('follow_list_error'))}</p>`; }
}
/* ---------- descripción del perfil: 3 renglones y "… Ver más" ---------- */
// La descripción (de cualquier largo, hasta 5 000 caracteres) ocupa 3 renglones como máximo. Si el texto es más largo se corta y el tercer renglón termina en
// "… Ver más"; al tocarlo se abre la descripción completa en una tarjeta. Se mide con el texto ya pintado (se busca por bisección el trozo
// más largo que cabe junto con el "… Ver más") y se vuelve a calcular si cambia el ancho (girar el móvil, redimensionar) o carga la fuente.
function wireProfileBio(p, text, username){
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'bio-more';
  more.textContent = t('load_more_btn');
  more.onclick = ()=> openBioModal(username, text);
  const paint = n => { p.textContent = text.slice(0, n).trimEnd(); if(n < text.length) p.append('… ', more); };
  const overflows = ()=> p.scrollHeight > p.clientHeight + 1; // el CSS le pone max-height de 3 renglones
  function fit(){
    paint(text.length);
    if(!overflows()) return;
    let lo = 0, hi = text.length; // lo cabe (con el "… Ver más"), hi no cabe
    while(hi - lo > 1){ const mid = (lo + hi) >> 1; paint(mid); if(overflows()) hi = mid; else lo = mid; }
    const space = text.lastIndexOf(' ', lo); // si hay un espacio cerca, se corta ahí y no a mitad de palabra
    paint(space > lo - 15 && space > 0 ? space : lo);
  }
  fit();
  let width = p.clientWidth;
  const ro = new ResizeObserver(()=>{
    if(!p.isConnected){ ro.disconnect(); return; }
    if(p.clientWidth !== width){ width = p.clientWidth; fit(); }
  });
  ro.observe(p);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if(p.isConnected) fit(); });
}
// La descripción completa, en una tarjeta al centro de la pantalla.
function openBioModal(username, text){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box bio-modal" role="dialog" aria-modal="true" aria-labelledby="bioModalTitle">
      <h3 id="bioModalTitle">${esc(t('profile_bio_label'))}</h3>
      <p class="hint follow-list-owner">${esc(username)}</p>
      <p class="bio-modal-text">${esc(text)}</p>
      <div class="confirm-actions" style="margin-top:16px;"><button type="button" class="btn-ghost" data-act="close">${esc(t('close_btn'))}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = ()=>{ overlay.remove(); document.removeEventListener('keydown', onKey); };
  function onKey(e){ if(e.key==='Escape') close(); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  overlay.querySelector('[data-act="close"]').onclick = close;
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-act="close"]').focus();
}
// Biblioteca de otra persona: 8 juegos de entrada y «Ver más» suma 8 más (el mismo paginado de la propia, ver renderWishlistGrid en 10-lists.js). Las tarjetas que
// ya están no se vuelven a pintar: «Ver más» solo agrega las siguientes.
function renderPublicLibrary(profile){
  const grid = document.getElementById('publicLibraryGrid');
  if(!grid) return;
  const games = profile.library.map(id=>findGame(id)).filter(Boolean);
  let shown = 0;
  const wrap = document.createElement('div');
  wrap.className = 'load-more-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-ghost load-more-btn';
  btn.textContent = t('load_more_btn');
  wrap.appendChild(btn);
  grid.insertAdjacentElement('afterend', wrap);
  const showMore = ()=>{
    games.slice(shown, shown + WISHLIST_PAGE_SIZE).forEach(g=> grid.appendChild(libraryCard(g, profile.libraryHours && profile.libraryHours[g.id])));
    shown = Math.min(shown + WISHLIST_PAGE_SIZE, games.length);
    wrap.hidden = shown >= games.length;
  };
  btn.onclick = showMore;
  showMore();
}
/* ---------- preview de listas dentro del perfil (el CRUD completo está en 10-lists.js) ---------- */
// Pinta la grilla de listas de un usuario dentro de un contenedor dado.
// gridId es parametrizable porque esta MISMA función se usa
// tanto para la preview chica dentro del perfil (listsGrid)
// como para la vista completa "/mis-listas" (listsViewGrid)
// — ver renderListsView() más abajo. Guarda en state.listsRenderTarget a
// cuál de las dos hay que volver a pintar después de crear/borrar una lista.
async function renderProfileLists(username, editable, gridId){
  gridId = gridId || 'listsGrid';
  state.listsRenderTarget = { gridId };
  const grid = document.getElementById(gridId);
  try{
    const { lists } = editable ? await apiGet('/lists/mine') : await apiGet('/users/'+encodeURIComponent(username)+'/lists');
    state.profileLists = lists;
    state.profileListsEditable = editable;
    state.profileListsUsername = username;
    if(!grid) return;
    if(lists.length===0 && !editable){
      grid.innerHTML = emptyState(ICONS.bookmark, t('empty_lists_other_t'), t('empty_lists_other_s'));
      return;
    }
    grid.innerHTML='';
    lists.forEach(list=>{
      const card=document.createElement('div');
      card.className='card list-card';
      card.dataset.listId = list.id; // para poder ponerla al día en su lugar (syncListCard en 10-lists.js)
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
    el.innerHTML = emptyState(ICONS.lock, t('empty_login_t'), t('empty_login_s'));
    const btn=document.createElement('a'); btn.href='/cuenta'; btn.className='btn gold'; btn.style.marginTop='14px'; btn.textContent=t('login_btn');
    btn.onclick=spa(()=>goView('auth')); el.appendChild(btn);
    return;
  }
  renderProfileLists(state.user.username, true, 'listsViewGrid');
}
/* ---------- notificaciones ---------- */
// Vista "/notificaciones": te siguieron / le gustó tu reseña a alguien. Ya no se marcan todas como leídas al abrir la vista: cada una se marca con su botón (o al abrirla),
// «Marcar todas como leídas» las marca juntas, y se pueden eliminar de a una o todas. El puntito rojo del header sigue a las que quedan sin leer.
async function renderNotificationsView(){
  const el = document.getElementById('notificationsList');
  const countEl = document.getElementById('notificationsCount');
  document.getElementById('notificationsActions').hidden = true;
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
  paintNotifications();
}
// Marca una notificación como leída en el servidor y en la lista (sin volver a pedirla). Devuelve true si quedó leída.
async function markNotificationRead(n){
  if(n.read) return true;
  try{ await apiPost('/notifications/'+encodeURIComponent(n.id)+'/read'); }catch(e){ return false; }
  n.read = true;
  return true;
}
// Dibuja la barra de botones y la lista a partir de state.notifications (se vuelve a llamar después de marcar o eliminar, sin pedir nada al servidor).
function paintNotifications(){
  const el = document.getElementById('notificationsList');
  const countEl = document.getElementById('notificationsCount');
  const bar = document.getElementById('notificationsActions');
  const list = state.notifications || [];
  countEl.textContent = list.length;
  bar.hidden = list.length===0;
  const markAll = document.getElementById('notifMarkAll');
  markAll.disabled = !list.some(n=>!n.read);
  markAll.onclick = async ()=>{
    try{ await apiPost('/notifications/read'); }catch(e){ toast(t('err_save_user'), 'bad'); return; }
    list.forEach(n=>{ n.read = true; });
    paintNotifications(); renderUserBadge();
  };
  document.getElementById('notifDeleteAll').onclick = async ()=>{
    if(!(await confirmDialog(t('notif_delete_all_confirm')))) return;
    try{ await apiDelete('/notifications'); }catch(e){ toast(t('err_save_user'), 'bad'); return; }
    state.notifications = [];
    paintNotifications(); renderUserBadge();
  };
  if(list.length===0){
    el.innerHTML = emptyState(ICONS.bell, t('empty_notifications_t'), t('empty_notifications_s'));
    return;
  }
  el.innerHTML = '';
  list.forEach(n=>{
    const game = n.gameId ? findGame(n.gameId) : null;
    // El nombre de quien actúa es un enlace a su perfil (por encima del enlace que cubre toda la tarjeta, que lleva al juego).
    const actor = `<a class="notif-actor" href="${profileHref(n.actorUsername)}">${esc(n.actorUsername)}</a>`;
    const gameTitle = game ? esc(game.title) : '';
    const text = n.type==='follow'
      ? (state.lang==='en' ? `${actor} started following you` : `${actor} empezó a seguirte`)
      : (state.lang==='en' ? `${actor} liked your review of ${gameTitle}` : `A ${actor} le gustó tu reseña de ${gameTitle}`);
    // «Le gustó tu reseña»: lleva a esa reseña (la tuya sobre ese juego), en su propia página; si ya no está, a la ficha del juego.
    const likedReview = n.type!=='follow' && game && state.user ? state.reviews.find(r=>r.gameId===game.id && r.username===state.user.username) : null;
    const href = n.type==='follow' ? profileHref(n.actorUsername) : (likedReview ? reviewHref(likedReview.id) : (game ? gameHref(game.id) : null));
    const row = document.createElement('div');
    row.className = 'card notif-row' + (href? ' has-card-link' : '') + (n.read? '' : ' unread');
    row.innerHTML = `
      ${href? cardLinkHTML(href, n.type==='follow'? n.actorUsername : gameTitle) : ''}
      <div class="notif-icon">${n.type==='follow'? ICONS.heart : ICONS.thumbsUp}</div>
      <div class="notif-body">
        <div class="notif-text">${text}</div>
        <div class="notif-date">${fmtDate(n.createdAt)}</div>
      </div>
      <div class="notif-actions">
        ${n.read? '' : `<button type="button" class="notif-act" data-notif-read title="${esc(t('notif_mark_read'))}" aria-label="${esc(t('notif_mark_read'))}">${ICONS.checkCircle}</button>`}
        <button type="button" class="notif-act del" data-notif-del title="${esc(t('notif_delete'))}" aria-label="${esc(t('notif_delete'))}">${ICONS.trash}</button>
      </div>
    `;
    // Abrir una notificación (la tarjeta o el nombre) también la marca como leída.
    const opened = ()=>{ markNotificationRead(n).then(ok=>{ if(ok) renderUserBadge(); }); };
    row.querySelector('.notif-actor').onclick = spa(e=>{ e.stopPropagation(); opened(); state.profileUsername = n.actorUsername; goView('profile'); });
    row.onclick = spa(()=>{
      opened();
      if(n.type==='follow'){ state.profileUsername = n.actorUsername; goView('profile'); }
      else if(likedReview) openReview(likedReview.id);
      else if(game){ state.currentGame = game.id; state.gameOrigin='feed'; goView('game'); }
    });
    const readBtn = row.querySelector('[data-notif-read]');
    if(readBtn) readBtn.onclick = async e=>{
      e.stopPropagation();
      if(await markNotificationRead(n)){ paintNotifications(); renderUserBadge(); }
    };
    row.querySelector('[data-notif-del]').onclick = async e=>{
      e.stopPropagation();
      try{ await apiDelete('/notifications/'+encodeURIComponent(n.id)); }catch(err){ toast(t('err_save_user'), 'bad'); return; }
      state.notifications = state.notifications.filter(x=>x!==n);
      paintNotifications(); renderUserBadge();
    };
    el.appendChild(row);
  });
}
/* ---------- seguir a un usuario ---------- */
// Sigue/deja de seguir a un usuario desde su perfil, y actualiza el botón + contador de seguidores + medallita de "Amigos" (se siguen mutuamente) en el lugar, sin re-renderizar todo el perfil.
async function toggleFollow(username){
  if(!state.user){ goView('auth'); return; }
  try{
    const res = await apiPost('/users/'+encodeURIComponent(username)+'/follow', {});
    const countEl = document.getElementById('followerCountEl');
    if(countEl) countEl.textContent = res.followerCount;
    if(state.user) state.user.followingCount = Math.max(0, (state.user.followingCount||0) + (res.isFollowing? 1 : -1)); // a quién sigue la propia persona cambió
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
  }catch(e){ toast(t('err_save_user'), 'bad'); }
}
