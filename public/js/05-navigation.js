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
 * También vive aquí el badge de usuario del header (avatar o botón
 * "Iniciar sesión") y su menú desplegable.
 */
/* ---------- nav / views ---------- */
// ENLACES DE VERDAD. Todo lo que lleva a otra sección o página es un <a href>: así el clic derecho ofrece "Abrir en una pestaña nueva" y funcionan
// Ctrl/Cmd+clic, Mayús+clic y el clic del medio (el navegador abre la dirección, que el servidor sabe servir). Un clic normal navega adentro del
// sitio sin recargar: spa(fn) arma ese handler y, si el clic trae una tecla modificadora, lo deja pasar al navegador sin tocarlo.
const gameHref = id => '/juego/' + encodeURIComponent(id);
const characterHref = id => '/personaje/' + encodeURIComponent(id);
const profileHref = name => '/usuario/' + encodeURIComponent(name);
function isPlainClick(e){ return !e || (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey); }
function spa(fn){ return function(e){ if(!isPlainClick(e)) return; if(e) e.preventDefault(); return fn.call(this, e); }; }
// El enlace que cubre toda una tarjeta (la tarjeta sigue siendo un <div> con sus botones adentro; ver .card-link en style.css).
function cardLinkHTML(href, label){ return `<a class="card-link" href="${esc(href)}" aria-label="${esc(label)}"></a>`; }
// Cambia un <button> o <span> por un <a href> igual (mismo id, clases, atributos y contenido) para que sea un enlace de verdad.
function asLink(el, href){
  if(!el) return el;
  if(el.tagName === 'A'){ el.setAttribute('href', href); return el; }
  const a = document.createElement('a');
  for(const at of el.attributes) if(at.name!=='type' && at.name!=='role' && at.name!=='tabindex') a.setAttribute(at.name, at.value);
  a.href = href;
  a.append(...el.childNodes);
  el.replaceWith(a);
  return a;
}
let navigatingFromPopstate = false; // evita que syncUrl() vuelva a empujar al history cuando el cambio de vista vino de un popstate (atrás/adelante)
// Mapea un nombre de vista (state.view) a su URL "linda" — debe ser el espejo exacto de routeFromLocation() de aquí abajo.
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
// contenido. Ojo: si agregas una vista nueva, tiene que tener su propio
// "if(target===...)" aquí abajo llamando a su render, si no queda en blanco.
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
  const boot = document.getElementById('bootView'); // el estilo que dejaba a la vista la sección de la dirección mientras cargaban los datos (ver el <head> de index.html)
  if(boot) boot.remove();
  if(v!=='settings') state.settingsTab = null; // la pestaña abierta de Ajustes (12-settings.js) solo se recuerda mientras se está ahí
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
// Lo que se hace en pantalla después de cerrar sesión (la del menú y "cerrar en todos los dispositivos" de Ajustes): vaciar el usuario y volver al inicio.
async function finishLogout(toastKey){
  state.user=null; state.notifications=[]; await loadDailyState(); renderUserBadge(); goView('feed'); toast(t(toastKey));
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
// Punto de entrada público para navegar (úsalo en vez de applyView directo).
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
  // Al entrar a Inicio, Explorar o Personajes se vuelven a pedir los datos (sin recargar la página); ver refreshData() en 04-api-theme-rating.js.
  if(v==='feed' || v==='browse' || v==='characters') refreshData();
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
      <button class="user-menu-trigger" id="userMenuTrigger" type="button" aria-label="${esc(u.username)}" title="${esc(u.username)}" aria-haspopup="true" aria-expanded="false">
        ${avatarHTML}<span class="user-menu-name">${esc(u.username)}</span>${ICONS.chevronDown}${dotHTML}
      </button>`;
    document.getElementById('userMenuTrigger').onclick = (e)=>{ e.stopPropagation(); toggleUserMenu(e.currentTarget); };
  } else {
    el.innerHTML = `<a class="btn small" id="loginBtn" href="/cuenta">${t('login_btn')}</a>`;
    document.getElementById('loginBtn').onclick = spa(()=> goView('auth'));
  }
}
/* ---------- buscador de perfiles (header) ---------- */
// Un cuadro de texto que, a partir de 2 letras, le pide a /api/user-search los perfiles cuyo nombre contiene lo escrito y los muestra en una lista; elegir uno abre su perfil.
// En pantallas anchas el cuadro está a la vista; en las demás hay una lupa que lo abre como una tarjeta bajo el header (ver .user-search en style.css).
// Teclado: flechas para moverse por los resultados, Enter para abrir (sin elegir, abre el primero) y Escape para cerrar. Se llama una vez desde 16-init.js.
function initUserSearch(){
  const box = document.getElementById('userSearch');
  const toggle = document.getElementById('userSearchToggle');
  const input = document.getElementById('userSearchInput');
  const list = document.getElementById('userSearchResults');
  let timer = null, seq = 0, active = -1; // seq: cada búsqueda lleva un número, y una respuesta atrasada (de un texto que ya cambió) se descarta
  const options = ()=> [...list.querySelectorAll('a')];
  const setActive = i=>{
    active = i;
    options().forEach((a, n)=>{
      a.parentElement.classList.toggle('active', n===i);
      if(n===i){ input.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block:'nearest' }); }
    });
    if(i<0) input.removeAttribute('aria-activedescendant');
  };
  const move = step=>{ const n = options().length; if(n) setActive(active<0 ? (step>0? 0 : n-1) : (active+step+n)%n); };
  const hideList = ()=>{ list.hidden = true; list.innerHTML = ''; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const closeAll = ()=>{ clearTimeout(timer); seq++; hideList(); box.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };
  const choose = name=>{ closeAll(); input.value = ''; openProfileOf(name); };
  const showMessage = text=>{ list.innerHTML = `<li class="user-search-note" role="presentation">${esc(text)}</li>`; list.hidden = false; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const showUsers = users=>{
    if(!users.length){ showMessage(t('user_search_empty')); return; }
    list.innerHTML = users.map((u, i)=>`<li role="presentation"><a role="option" id="userSearchOpt${i}" href="/usuario/${encodeURIComponent(u.username)}" data-user="${esc(u.username)}">${miniAvatarHTML(u.username, u.avatarUrl)}<span>${esc(u.username)}</span></a></li>`).join('');
    list.hidden = false; active = -1; input.setAttribute('aria-expanded', 'true');
    options().forEach(a=>{ a.onclick = spa(()=> choose(a.dataset.user)); });
  };
  const search = async ()=>{
    const q = input.value.trim(), mine = ++seq;
    if(q.length<2){ hideList(); return; }
    try{
      const { users } = await apiGet('/user-search?q='+encodeURIComponent(q));
      if(mine===seq) showUsers(users);
    }catch(e){ if(mine===seq) showMessage(t('user_search_error')); }
  };
  input.addEventListener('input', ()=>{ clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); move(1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); move(-1); }
    else if(e.key==='Enter'){
      e.preventDefault();
      const pick = options()[active>=0? active : 0];
      if(pick) choose(pick.dataset.user);
      else if(input.value.trim().length>=2){ clearTimeout(timer); search(); } // Enter antes de que salgan los resultados: se busca ya
    } else if(e.key==='Escape'){
      if(!list.hidden) hideList();
      else { closeAll(); if(toggle.offsetParent) toggle.focus(); }
    }
  });
  toggle.addEventListener('click', ()=>{
    const open = box.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    if(open) input.focus(); else closeAll();
  });
  document.addEventListener('click', e=>{ if(!box.contains(e.target)) closeAll(); });
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
    <a data-act="profile" href="/mi-estanteria">${ICONS.user} ${esc(t('nav_shelf'))}</a>
    <a data-act="notifications" href="/notificaciones">${ICONS.bell} ${esc(t('notifications_title'))}${unread>0?`<span class="menu-badge">${unread}</span>`:''}</a>
    <a data-act="lists" href="/mis-listas">${ICONS.bookmark} ${esc(t('lists_title'))}</a>
    <a data-act="settings" href="/ajustes">${ICONS.settings} ${esc(t('settings_title'))}</a>
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

  menu.querySelector('[data-act="profile"]').onclick = spa(()=>{ closeUserMenu(); goView('shelf'); });
  menu.querySelector('[data-act="notifications"]').onclick = spa(()=>{ closeUserMenu(); goView('notifications'); });
  menu.querySelector('[data-act="lists"]').onclick = spa(()=>{ closeUserMenu(); goView('lists'); });
  menu.querySelector('[data-act="settings"]').onclick = spa(()=>{ closeUserMenu(); goView('settings'); });
  menu.querySelector('[data-act="suggest"]').onclick = ()=>{ closeUserMenu(); openSuggestModal(); };
  menu.querySelector('[data-act="subscribe"]').onclick = ()=>{ closeUserMenu(); toast(t('subscribe_soon')); };
  menu.querySelector('[data-act="logout"]').onclick = async ()=>{
    closeUserMenu();
    try{ await apiPost('/auth/logout'); }catch(e){}
    await finishLogout('toast_logged_out');
  };
  setTimeout(()=>{
    document.addEventListener('click', userMenuOutsideClick, true);
    window.addEventListener('scroll', closeUserMenu, true);
  }, 0);
}

