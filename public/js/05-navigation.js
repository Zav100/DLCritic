/**
 * ARCHIVO 5 de 16 — Ruteo de la SPA (single-page app) y menú de usuario.
 *
 * Esta app es una SPA con URLs "lindas": no hay recarga de página al
 * navegar, pero la URL del navegador sí cambia (con history.pushState) y
 * el botón atrás/adelante funciona (con 'popstate'). El patrón es:
 *   state.view (string, p.ej. "browse") <-> pathForView()/routeFromLocation()
 * goView(vista) es la función que hay que llamar para navegar; internamente
 * llama a applyView(), que es la que realmente esconde/muestra secciones y
 * dispara el render de cada vista.
 *
 * También vive acá el badge de usuario del header (avatar o botón
 * "Iniciar sesión") y su menú desplegable.
 */
/* ---------- nav / views ---------- */
let navigatingFromPopstate = false; // evita que syncUrl() vuelva a empujar al history cuando el cambio de vista vino de un popstate (atrás/adelante)
// Mapea un nombre de vista (state.view) a su URL "linda" — debe ser el espejo exacto de routeFromLocation() de acá abajo.
function pathForView(v){
  if(v==='game' && state.currentGame) return '/juego/'+encodeURIComponent(state.currentGame);
  if(v==='character' && state.currentCharacter) return '/personaje/'+encodeURIComponent(state.currentCharacter);
  if(v==='profile' && state.profileUsername) return '/usuario/'+encodeURIComponent(state.profileUsername);
  if(v==='browse') return '/explorar';
  if(v==='characters') return '/personajes';
  if(v==='shelf') return '/mi-estanteria';
  if(v==='lists') return '/mis-listas';
  if(v==='notifications') return '/notificaciones';
  if(v==='news') return '/noticias';
  if(v==='daily') return '/reto-del-dia';
  if(v==='about') return '/acerca-de';
  if(v==='auth') return '/cuenta';
  if(v==='settings') return '/ajustes';
  return '/';
}
// Ojo al agregar una vista nueva: la URL también tiene que agregarse en el
// arreglo de "pretty routes" de server/index.js, si no el servidor devuelve
// 404 cuando alguien entra directo a esa URL o le da F5 (en vez de navegar
// desde adentro de la SPA).
function syncUrl(v){
  if(navigatingFromPopstate) return;
  const path = pathForView(v);
  if(location.pathname !== path) history.pushState({}, '', path);
}
// El inverso de pathForView(): a partir de la URL actual, decide qué vista mostrar al cargar/refrescar la página o al navegar con atrás/adelante.
function routeFromLocation(){
  const path = location.pathname;
  const m = path.match(/^\/juego\/([^/]+)$/);
  if(m){
    const id = decodeURIComponent(m[1]);
    if(findGame(id)){ state.currentGame=id; state.gameOrigin='feed'; return 'game'; }
    return 'feed';
  }
  const cm = path.match(/^\/personaje\/([^/]+)$/);
  if(cm){
    const id = decodeURIComponent(cm[1]);
    if(findCharacter(id)){ state.currentCharacter=id; return 'character'; }
    return 'characters';
  }
  const pm = path.match(/^\/usuario\/([^/]+)$/);
  if(pm){ state.profileUsername = decodeURIComponent(pm[1]); return 'profile'; }
  if(path==='/explorar') return 'browse';
  if(path==='/personajes') return 'characters';
  if(path==='/mi-estanteria') return 'shelf';
  if(path==='/mis-listas') return 'lists';
  if(path==='/notificaciones') return 'notifications';
  if(path==='/noticias') return 'news';
  if(path==='/reto-del-dia') return 'daily';
  if(path==='/acerca-de') return 'about';
  if(path==='/cuenta') return 'auth';
  if(path==='/ajustes') return 'settings';
  return 'feed';
}
window.addEventListener('popstate', ()=>{
  navigatingFromPopstate = true;
  goView(routeFromLocation());
  navigatingFromPopstate = false;
});

// El "motor" real de la navegación: guarda la vista en el estado, muestra
// SOLO la sección <div class="viewsec"> que corresponde (todas las demás
// quedan hidden), actualiza qué botón del nav está resaltado, sincroniza
// la URL, y llama a la función renderX() de esa vista para que pinte su
// contenido. Ojo: si agregás una vista nueva, tiene que tener su propio
// "if(target===...)" acá abajo llamando a su render, si no queda en blanco.
// Título de la pestaña. El servidor lo arma al cargar la página de un juego, personaje o usuario; la navegación dentro del sitio no pasa por el
// servidor, así que hay que actualizarlo en cada cambio de vista: si no, queda el del primero que se abrió.
// Solo el inicio lleva el título completo (el mismo que el <title> de server/views/index.html); el resto, "Nombre de la vista — DLCritic".
const DEFAULT_TITLE = 'DLCritic — Tu estantería de juegos';
// El nombre de cada vista, como aparece en el menú o en su encabezado (clave de traducción: sigue el idioma elegido).
const VIEW_TITLE_KEYS = { browse:'nav_browse', characters:'nav_characters', shelf:'nav_shelf', daily:'nav_daily', about:'nav_about', news:'feed_news_title', lists:'lists_title', notifications:'notifications_title', settings:'settings_title' };
function titleForView(v){
  if(v==='game' && state.currentGame){ const g=findGame(state.currentGame); if(g) return g.title+' — DLCritic'; }
  if(v==='character' && state.currentCharacter){ const c=findCharacter(state.currentCharacter); if(c) return c.name+' — DLCritic'; }
  if(v==='profile' && state.profileUsername) return state.profileUsername+' — DLCritic';
  if(v==='auth') return t(state.authTab==='register' ? 'auth_register_tab' : 'auth_login_tab')+' — DLCritic';
  if(VIEW_TITLE_KEYS[v]) return t(VIEW_TITLE_KEYS[v])+' — DLCritic';
  return DEFAULT_TITLE;
}
function applyView(v){
  state.view=v;
  document.querySelectorAll('.viewsec').forEach(s=>s.hidden=true);
  const target = v;
  const sectionId = (target==='shelf') ? 'view-profile' : 'view-'+target;
  document.getElementById(sectionId).hidden=false;
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  syncUrl(target);
  document.title = titleForView(target);
  if(target==='feed'){ renderDateWidget(); renderNewGames(); renderNews(); renderFeed(); renderFeedRail(); }
  if(target==='browse') renderBrowse();
  if(target==='game') renderGameDetail();
  if(target==='characters') renderCharactersBrowse();
  if(target==='character') renderCharacterDetail();
  if(target==='shelf') renderShelf();
  if(target==='profile') renderProfile(state.profileUsername);
  if(target==='lists') renderListsView();
  if(target==='notifications') renderNotificationsView();
  if(target==='news') renderNewsView();
  if(target==='daily') renderDaily();
  if(target==='auth') renderAuthForm();
  if(target==='settings') renderSettingsView();
  fillTipsRail(target);
}
let appReady = false;
let currentViewTransition = null;
// A transition suspended mid-flight (tab backgrounded, etc.) can leave its
// ::view-transition overlay stuck on screen forever. Skipping it as soon as
// the tab is hidden forces cleanup instead of leaving a corrupted frozen frame.
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && currentViewTransition){
    try{ currentViewTransition.skipTransition(); }catch(e){}
  }
});
// Punto de entrada público para navegar (usalo en vez de applyView directo).
// Envuelve el cambio de vista en la View Transitions API del navegador
// (si existe) para el efecto de fade/cross-fade entre pantallas; si esa
// API no está disponible, o la pestaña está oculta, simplemente aplica la
// vista sin animación. Siempre cierra los menús abiertos y scrollea al
// principio de la página.
function goView(v){
  closeShareMenu();
  closeUserMenu();
  const run = () => applyView(v);
  if(appReady && document.startViewTransition && !document.hidden){
    try{
      const tr = document.startViewTransition(run);
      currentViewTransition = tr;
      const clear = ()=>{ if(currentViewTransition===tr) currentViewTransition=null; };
      // The animation itself is a nice-to-have; never let a rejected
      // transition promise surface as an unhandled error in the console.
      [tr.ready, tr.updateCallbackDone, tr.finished].forEach(p=> p.catch(()=>{}));
      tr.finished.finally(clear);
    }catch(e){ run(); }
  } else {
    run();
  }
  appReady = true;
  window.scrollTo({top:0,behavior:'smooth'});
}
function unreadNotifCount(){ return (state.notifications||[]).filter(n=>!n.read).length; }
// Pinta la esquina derecha del header: avatar + nombre (con puntito rojo si hay notificaciones sin leer) si hay sesión, o el botón "Iniciar sesión" si no.
function renderUserBadge(){
  const el=document.getElementById('userBadge');
  if(state.user){
    const u = state.user;
    const color = AVATAR_COLORS[Math.abs(hashStr(u.username))%AVATAR_COLORS.length];
    const avatarHTML = u.avatarUrl
      ? `<img class="user-menu-avatar-img" src="${esc(u.avatarUrl)}" alt="">`
      : `<span class="user-menu-avatar" style="background:${color}">${esc(u.username[0].toUpperCase())}</span>`;
    const dotHTML = unreadNotifCount()>0 ? `<span class="unread-dot"></span>` : '';
    el.innerHTML = `
      <button class="user-menu-trigger" id="userMenuTrigger" type="button" aria-haspopup="true" aria-expanded="false">
        ${avatarHTML}<span class="user-menu-name">${esc(u.username)}</span>${ICONS.chevronDown}${dotHTML}
      </button>`;
    document.getElementById('userMenuTrigger').onclick = (e)=>{ e.stopPropagation(); toggleUserMenu(e.currentTarget); };
  } else {
    el.innerHTML = `<button class="btn small" id="loginBtn">${t('login_btn')}</button>`;
    document.getElementById('loginBtn').onclick = ()=> goView('auth');
  }
}
/* ---------- menú desplegable del avatar (Mi estantería / Notificaciones / Listas / Ajustes / ...) ---------- */
let currentUserMenu = null; // el <div> del menú actualmente abierto, o null
// Cierra el menú desplegable si está abierto y saca los listeners globales que lo mantenían escuchando clicks/scroll afuera.
function closeUserMenu(){
  if(currentUserMenu){ currentUserMenu.remove(); currentUserMenu=null; }
  const trigger = document.getElementById('userMenuTrigger');
  if(trigger) trigger.setAttribute('aria-expanded','false');
  document.removeEventListener('click', userMenuOutsideClick, true);
  window.removeEventListener('scroll', closeUserMenu, true);
}
// Handler de "click en cualquier lado": si el click no fue ni adentro del menú ni en el botón que lo abre, lo cierra.
function userMenuOutsideClick(e){ if(currentUserMenu && !currentUserMenu.contains(e.target) && !e.target.closest('#userMenuTrigger')) closeUserMenu(); }
function toggleUserMenu(anchorEl){
  if(currentUserMenu){ closeUserMenu(); return; }
  openUserMenu(anchorEl);
}
// Crea y posiciona el menú desplegable (pegado abajo-a-la-derecha del avatar) y engancha cada opción. Reutiliza la misma clase "share-menu" que el menú de compartir (mismo estilo visual, contenido distinto).
function openUserMenu(anchorEl){
  closeShareMenu();
  const unread = unreadNotifCount();
  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.innerHTML = `
    <button data-act="profile">${ICONS.user} ${esc(t('nav_shelf'))}</button>
    <button data-act="notifications">${ICONS.bell} ${esc(t('notifications_title'))}${unread>0?`<span class="menu-badge">${unread}</span>`:''}</button>
    <button data-act="lists">${ICONS.bookmark} ${esc(t('lists_title'))}</button>
    <button data-act="settings">${ICONS.settings} ${esc(t('settings_title'))}</button>
    <div class="menu-sep"></div>
    <button data-act="suggest">${ICONS.plus} ${esc(t('footer_suggest_btn'))}</button>
    <button data-act="subscribe">${ICONS.crown} ${esc(t('subscribe_btn'))}</button>
    <div class="menu-sep"></div>
    <button data-act="logout" style="color:var(--red);">${ICONS.logOut} ${esc(t('logout_btn'))}</button>
  `;
  document.body.appendChild(menu);
  currentUserMenu = menu;
  anchorEl.setAttribute('aria-expanded','true');
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  let left = rect.right + window.scrollX - menuWidth;
  if(left < 8) left = 8;
  menu.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  menu.style.left = left + 'px';

  menu.querySelector('[data-act="profile"]').onclick = ()=>{ closeUserMenu(); goView('shelf'); };
  menu.querySelector('[data-act="notifications"]').onclick = ()=>{ closeUserMenu(); goView('notifications'); };
  menu.querySelector('[data-act="lists"]').onclick = ()=>{ closeUserMenu(); goView('lists'); };
  menu.querySelector('[data-act="settings"]').onclick = ()=>{ closeUserMenu(); goView('settings'); };
  menu.querySelector('[data-act="suggest"]').onclick = ()=>{ closeUserMenu(); openSuggestModal(); };
  menu.querySelector('[data-act="subscribe"]').onclick = ()=>{ closeUserMenu(); toast(t('subscribe_soon')); };
  menu.querySelector('[data-act="logout"]').onclick = async ()=>{
    closeUserMenu();
    try{ await apiPost('/auth/logout'); }catch(e){}
    state.user=null; state.notifications=[]; await loadDailyState(); renderUserBadge(); goView('feed'); toast(t('toast_logged_out'));
  };
  setTimeout(()=>{
    document.addEventListener('click', userMenuOutsideClick, true);
    window.addEventListener('scroll', closeUserMenu, true);
  }, 0);
}

