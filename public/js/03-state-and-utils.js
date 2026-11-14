/**
 * ARCHIVO 3 de 16 — Estado global de la app + utilidades chicas compartidas.
 *
 * Lo más importante de este archivo es `state`: es el ÚNICO objeto que
 * guarda todo lo que la interfaz necesita recordar (usuario logueado,
 * lista de juegos, reseñas, filtros activos, vista actual, etc.). Casi
 * cualquier función de cualquier otro archivo lee o escribe `state` en
 * algún momento — no hay "stores" separados por feature.
 *
 * También viven aquí: helpers de formato/DOM usados en TODA la app (esc,
 * fmtDate, toast, uid), el sistema de "portada real" de un juego (busca
 * la carátula real por internet vía el servidor y la cachea), y algunos
 * datos globales que se cargan una sola vez al bootear (CATALOG,
 * DATE_EVENTS, NEWS_ITEMS — ver loadAll() en 04-api-theme-rating.js).
 */
/* ---------- tamaños de página / constantes chicas usadas por el "state" de más abajo ---------- */
// Estas van PRIMERO a propósito: state.browseVisibleCount lee BROWSE_PAGE_SIZE
// apenas se define el objeto state (unas líneas más abajo), así que tienen
// que existir antes. (const/let no se "hoistean" como las funciones: si
// esto fuera después de `let state = {...}`, tirarìa un ReferenceError.)
const BROWSE_PAGE_SIZE = 28;
const WISHLIST_PAGE_SIZE = 8;
const SHELF_REVIEWS_PAGE_SIZE = 10;
const NEWS_FEED_LIMIT = 9;

/* ---------- opciones de orden para "Explorar catálogo" ---------- */
const BROWSE_SORTS = {
  rating_desc: (a,b)=> gameStats(b.id).avg - gameStats(a.id).avg,
  rating_asc: (a,b)=> gameStats(a.id).avg - gameStats(b.id).avg,
  az: (a,b)=> a.title.localeCompare(b.title),
  za: (a,b)=> b.title.localeCompare(a.title),
  release_date_desc: (a,b)=> (b.releaseYear||0) - (a.releaseYear||0),
  release_date_asc: (a,b)=> (a.releaseYear||Infinity) - (b.releaseYear||Infinity),
};
const BROWSE_SORT_KEYS = ['rating_desc','rating_asc','az','za','release_date_desc','release_date_asc'];
// Un botón por criterio: el primer toque lo activa y cada toque siguiente alterna entre sus dos direcciones (first / second).
const BROWSE_SORT_GROUPS = [
  { key:'rating', first:'rating_desc', second:'rating_asc' },
  { key:'name', first:'az', second:'za' },
  { key:'date', first:'release_date_desc', second:'release_date_asc' },
];
// EL estado global de la app. No es reactivo (no hay framework): cuando algo
// cambia aquí, quien lo cambió es responsable de volver a pintar lo que
// corresponda (llamando a la función render... que haga falta).
let state = { user:null, games:[], reviews:[], characters:[], characterReviews:[], notifications:[], view:'feed', authTab:'login', browseFilter:new Set(), browseGenres:new Set(), lang:'es', reviewEditing:false, charReviewEditing:false, browseVisibleCount:BROWSE_PAGE_SIZE, browseViewMode: (function(){ try{ return localStorage.getItem('browseViewMode')==='list' ? 'list' : 'grid'; }catch(e){ return 'grid'; } })(), browseSortMode: (function(){ try{ const v=localStorage.getItem('browseSortMode'); return BROWSE_SORT_KEYS.includes(v) ? v : 'rating_desc'; }catch(e){ return 'rating_desc'; } })() };

/* ---------- utilidades chicas de uso general ---------- */
// Id único cortito para cosas que se crean en el cliente (ids de elementos temporales, etc.).
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
// Escapa texto antes de inyectarlo como HTML (protección básica contra XSS). Usar SIEMPRE al insertar texto de usuario/servidor en un template string de HTML.
// Texto "plano" para buscar: sin mayúsculas ni tildes, así "ragnarok" encuentra "Ragnarök" y "pokemon" encuentra "Pokémon".
function foldText(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Rodea la foto de perfil con el borde multicolor de los suscriptores (CSS: .sub-ring). Para las demás cuentas devuelve la foto tal cual.
function subRing(html, isSub){ return isSub ? `<span class="sub-ring">${html}</span>` : html; }
// Icono de rango relleno de los suscriptores. Estilos (se eligen en Ajustes y viajan como users.rank_icon_style): invert (violeta con el icono blanco, el de por defecto),
// gold (ámbar), multi (el degradado del borde) o un color propio #rrggbb, con el icono claro u oscuro según lo claro que sea el color. Las demás cuentas lo ven de contorno, como siempre.
const RANK_ICON_PRESETS = {
  invert: { bg:'#6C5FC7', fg:'#fff' },
  gold:   { bg:'#F2B01E', fg:'#4A3000' },
  multi:  { bg:'linear-gradient(135deg,#7B61FF,#F0A8D0,#5B8DEF,#7B61FF)', fg:'#fff' },
};
function rankIconColors(style){
  if(RANK_ICON_PRESETS[style]) return RANK_ICON_PRESETS[style];
  const m = /^#([0-9a-f]{6})$/i.exec(style||'');
  if(!m) return RANK_ICON_PRESETS.invert;
  const n = parseInt(m[1], 16);
  const lum = (0.299*(n>>16) + 0.587*((n>>8)&255) + 0.114*(n&255)) / 255;
  return { bg:'#'+m[1], fg: lum>0.6 ? '#1b1b1b' : '#fff' };
}
// Atributos (clase y style="") para el elemento que muestra el icono de rango de una cuenta: vacíos si no es suscriptora.
function rankIconAttrs(isSub, style){
  if(!isSub) return { cls:'', style:'' };
  const c = rankIconColors(style);
  return { cls:' is-filled', style:` style="--ri-bg:${c.bg};--ri-fg:${c.fg}"` };
}
// El icono de rango suelto (al lado del nombre en una reseña): en un círculo relleno si la cuenta es suscriptora, tal cual si no.
function rankIconInline(iconSvg, isSub, style){
  if(!isSub) return iconSvg;
  const a = rankIconAttrs(true, style);
  return `<span class="ri-badge${a.cls}"${a.style}>${iconSvg}</span>`;
}
// Formatea una fecha ISO al formato lindo ("04 sept 2026" / "Sep 04, 2026" según el idioma).
function fmtDate(iso){ const d=new Date(iso); return d.toLocaleDateString(state.lang==='en'?'en-US':'es-ES',{day:'2-digit',month:'short',year:'numeric'}); }
// Avisa algo con una tarjeta en el centro de la pantalla y un botón «Entendido» (ver noticeDialog en 07-stats-share-modals.js); antes era un mensajito que se iba solo abajo.
// Si llegan varios seguidos se muestran de a uno, y un texto igual a uno que ya está esperando no se repite.
const noticeQueue = [];
// tone: 'good' (algo salió bien: tarjeta verde), 'bad' (algo salió mal o no se puede: tarjeta roja) o nada (neutral, como estaba).
function toast(msg, tone){
  if(noticeQueue.some(q=>q.msg===msg)) return;
  noticeQueue.push({ msg, tone });
  if(noticeQueue.length===1) showNextNotice();
}
function showNextNotice(){
  const { msg, tone } = noticeQueue[0];
  noticeDialog('', msg, '', tone).then(()=>{ noticeQueue.shift(); if(noticeQueue.length) showNextNotice(); });
}
// Lista desplegable para escribir y elegir un juego; reemplaza al <datalist> nativo, que se ve distinto en cada navegador y no se puede diseñar.
// Sale al escribir (primero los títulos que empiezan igual, después los que lo contienen), se recorre con las flechas, Enter elige el resaltado y Escape la cierra.
// getGames() devuelve los juegos entre los que buscar; onPick(título) se llama al elegir uno. Debe engancharse ANTES que otros listeners de keydown del input (para frenar el Enter).
function attachGameAutocomplete(input, getGames, onPick){
  const wrap = document.createElement('div');
  wrap.className = 'ac-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement('ul');
  list.className = 'ac-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
  wrap.appendChild(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('autocomplete', 'off');
  let active = -1;
  const rows = ()=> [...list.querySelectorAll('li[data-title]')];
  const close = ()=>{ list.hidden = true; list.innerHTML = ''; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const mark = i=>{ active = i; rows().forEach((li, n)=> li.classList.toggle('active', n===i)); if(rows()[i]) rows()[i].scrollIntoView({ block:'nearest' }); };
  const pick = title=>{ input.value = title; close(); if(onPick) onPick(title); };
  const show = ()=>{
    const q = foldText(input.value).trim();
    if(!q){ close(); return; }
    const starts = [], has = [];
    getGames().forEach(g=>{ const f = foldText(g.title); if(f.startsWith(q)) starts.push(g); else if(f.includes(q)) has.push(g); });
    const res = [...starts, ...has].slice(0, 8);
    list.innerHTML = res.length
      ? res.map(g=> `<li role="option" data-title="${esc(g.title)}"><span class="ac-title">${esc(g.title)}</span>${g.releaseYear? `<span class="ac-year">${g.releaseYear}</span>` : ''}</li>`).join('')
      : `<li class="ac-empty">${esc(t('ac_no_results'))}</li>`;
    list.hidden = false; active = -1; input.setAttribute('aria-expanded', 'true');
    rows().forEach(li=>{ li.onmousedown = e=>{ e.preventDefault(); pick(li.dataset.title); }; });
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', ()=>{ if(input.value.trim()) show(); });
  input.addEventListener('blur', ()=> setTimeout(close, 120));
  input.addEventListener('keydown', e=>{
    const n = rows().length;
    if(e.key==='ArrowDown' && n){ e.preventDefault(); mark(active<0? 0 : (active+1)%n); }
    else if(e.key==='ArrowUp' && n){ e.preventDefault(); mark(active<0? n-1 : (active-1+n)%n); }
    else if(e.key==='Enter' && active>=0){ e.preventDefault(); e.stopImmediatePropagation(); pick(rows()[active].dataset.title); }
    else if(e.key==='Escape' && !list.hidden){ e.stopPropagation(); close(); }
  });
}
// HTML de una card "esqueleto" (gris, animada) que se muestra mientras todavía no cargaron los datos reales.
function skeletonCardHTML(){
  return `<div class="card newscard skeleton-card"><div class="skel skel-cover"></div><div class="skel skel-title"></div><div class="skel skel-line"></div></div>`;
}
// Llena las grillas principales con cards esqueleto apenas arranca la página (antes de que responda el servidor).
function renderSkeletonGrids(){
  const grids = ['newGamesGrid','feedList'];
  grids.forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = skeletonCardHTML().repeat(4);
  });
  document.getElementById('charactersGrid').innerHTML = charSkeletonHTML().repeat(8);
  renderViewSkeleton();
  document.getElementById('characterDetail').innerHTML = `<div class="card skeleton-card"><div style="display:flex; gap:16px; align-items:center;"><div class="skel skel-avatar" style="margin:0;"></div><div style="flex:1;"><div class="skel skel-title"></div><div class="skel skel-line"></div></div></div></div>`;
}
// Al recargar en una dirección que no es el inicio, el <head> de index.html deja a la vista la sección de esa dirección, todavía sin contenido (ver #bootView y
// data-boot-view); mientras llegan los datos se le pone el esqueleto de lo que va a aparecer (la vista de Personajes y la del inicio ya tienen los suyos arriba).
// Cada render real reemplaza el contenido del contenedor, así que el esqueleto desaparece solo.
const skelRow = `<div class="card skeleton-card" style="margin-bottom:10px;"><div style="display:flex; gap:12px; align-items:center;"><div class="skel skel-avatar" style="width:38px; height:38px; margin:0;"></div><div style="flex:1;"><div class="skel skel-title" style="width:60%;"></div><div class="skel skel-line"></div></div></div></div>`;
const skelBlock = `<div class="card skeleton-card"><div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:75%; margin-top:10px;"></div></div>`;
const VIEW_SKELETONS = {
  browse: ['browseGrid', ()=> skeletonCardHTML().repeat(8)],
  news: ['newsViewList', ()=> skeletonCardHTML().repeat(6)],
  lists: ['listsViewGrid', ()=> skeletonCardHTML().repeat(3)],
  notifications: ['notificationsList', ()=> skelRow.repeat(4)],
  settings: ['settingsContent', ()=> skelBlock.repeat(2)],
  daily: ['guessCard', ()=> `<div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:75%; margin-top:10px;"></div>`],
  game: ['gameDetail', ()=> `<div class="layout-rail"><div class="rail-main"><div class="game-hero"><div class="game-hero-bg"></div><div class="card game-hero-card skeleton-card"><div style="display:flex; gap:16px; align-items:center;"><div class="skel" style="width:64px; height:64px; border-radius:14px;"></div><div style="flex:1;"><div class="skel skel-title"></div><div class="skel skel-line"></div></div></div><div class="skel skel-line" style="width:90%; margin-top:18px;"></div><div class="skel skel-line" style="width:70%; margin-top:10px;"></div></div></div></div></div>`],
  profile: ['profileContent', ()=> `<div class="profile-card skeleton-card"><div class="skel" style="width:88px; height:88px; border-radius:26px; flex-shrink:0;"></div><div class="profile-card-main"><div class="skel skel-title" style="width:40%; height:22px;"></div><div class="skel skel-line" style="width:28%;"></div><div class="skel skel-line" style="width:65%; margin-top:20px;"></div><div class="skel skel-line" style="width:45%; margin-top:10px;"></div></div></div><div class="statsstrip skeleton-card">${'<div class="statscell"><div class="skel" style="width:38px; height:26px;"></div><div class="skel skel-line" style="width:70%; margin-top:8px;"></div></div>'.repeat(3)}</div>`],
};
function renderViewSkeleton(){
  const entry = VIEW_SKELETONS[document.documentElement.dataset.bootView];
  const el = entry && document.getElementById(entry[0]);
  if(el) el.innerHTML = entry[1]();
}
/* ---------- portadas (la URL guardada en cada juego, cargada al hacer scroll) ---------- */
// Cómo se muestra la portada de un juego, en 3 pasos:
//   1. Cualquier elemento que necesite portada se marca con data-cover-title y data-cover-url (la portada guardada del juego; vacía = sin portada).
//   2. enhanceCovers() busca esos elementos, les da un color de fondo provisorio (placeholderColor) y los pone a observar con coverIO.
//   3. coverIO (un IntersectionObserver) espera a que el elemento esté por entrar en pantalla antes de pedir la imagen, así no se descargan de
//      una las portadas de TODO el catálogo; attachCoverImg() la inyecta con fade-in.
// Todas las portadas se ven igual: la imagen entera y centrada (object-fit: contain) sobre una copia suya desenfocada que rellena el marco 16:9,
// así no se corta ningún personaje ni el nombre del juego, sea cual sea la forma de la imagen (ver .cover-img en style.css).
// Un juego sin portada guardada queda con su color de fondo: ya no se busca por título en Steam (adivinaba mal, p. ej. "Minecraft" -> "Minecraft Dungeons II").
// Color de fondo estable (siempre el mismo para el mismo título) para mostrar mientras no hay portada real todavía.
function placeholderColor(title){
  const hue = Math.abs(hashStr(title)) % 360;
  return `hsl(${hue}, 38%, 26%)`;
}
// Crea el <img> de portada dentro de un contenedor y le agrega la clase que dispara el fade-in por CSS cuando termina de cargar.
function attachCoverImg(el, url){
  const img = document.createElement('img');
  img.className = 'cover-img';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  img.onload = ()=>{
    // Si la imagen casi tiene la forma del marco (las portadas de Steam de 616x353 son 2 % más angostas que 16:9), se llena el marco recortando un par de píxeles en vez de
    // dejar franjas desenfocadas de 3-4 px a los lados; las que se parecen poco (cuadradas, verticales, de 460x215) siguen enteras sobre el fondo desenfocado.
    const fw = el.clientWidth, fh = el.clientHeight;
    if(fw && fh && img.naturalWidth && img.naturalHeight){
      const rel = (img.naturalWidth/img.naturalHeight) / (fw/fh);
      if(rel>=0.93 && rel<=1.07) el.classList.add('cover-fill');
    }
    el.classList.add('has-cover');
  };
  el.style.setProperty('--cover-url', `url("${encodeURI(url).replace(/"/g, '%22')}")`); // la copia desenfocada que rellena el marco (CSS: ::before)
  img.src = url;
  el.appendChild(img);
}
// Observador compartido: dispara la carga de portada recién cuando el elemento está por entrar en pantalla (margen de 200px).
const coverIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    const el = entry.target;
    coverIO.unobserve(el);
    if(el.dataset.coverUrl) attachCoverImg(el, el.dataset.coverUrl);
  });
}, { rootMargin:'200px' });
// Portada "hero" (la grande de la ficha de un juego): esta se carga de una, sin esperar a que entre en pantalla, porque siempre está arriba de todo.
function loadHeroCover(el, url){
  if(!el || !url) return;
  el.style.backgroundImage = `url("${url}")`;
  el.classList.add('has-cover');
}
// Engancha data-cover-title/data-cover-url con el sistema de portadas de arriba. Idempotente: a los elementos ya enganchados no los vuelve a tocar (data-cover-observed).
function enhanceCovers(){
  document.querySelectorAll('[data-cover-title]').forEach(el=>{
    if(el.dataset.coverObserved) return;
    el.dataset.coverObserved='1';
    el.style.backgroundColor = placeholderColor(el.dataset.coverTitle);
    coverIO.observe(el);
  });
}
// Las cards clicables son <div class="card"> con onclick: sin tabindex no se alcanzan con Tab ni se activan con el teclado. Se detectan por tener un onclick propio, así que cubre cualquier card nueva sin tocar cada render.
function makeClickableCardsFocusable(){
  document.querySelectorAll('.card:not([tabindex])').forEach(c=>{
    if(typeof c.onclick==='function' && !c.querySelector(':scope > .card-link')){ c.tabIndex = 0; c.setAttribute('role','button'); }
  });
}
document.addEventListener('keydown', e=>{
  if((e.key==='Enter' || e.key===' ') && e.target.classList && e.target.classList.contains('card') && typeof e.target.onclick==='function'){
    e.preventDefault();
    e.target.click();
  }
});
// Como la app no usa un framework que avise "se agregó contenido nuevo", este observador de mutaciones del DOM llama a enhanceCovers() cada vez que un render agrega elementos — así ninguna card nueva se queda sin portada (ni sin foco de teclado).
new MutationObserver(()=>{ enhanceCovers(); makeClickableCardsFocusable(); }).observe(document.body, { childList:true, subtree:true });

/* ---------- accesos rápidos al catálogo ---------- */
function allGames(){ return state.games; }
function findGame(id){ return allGames().find(g=>g.id===id); }
function allCharacters(){ return state.characters; }
function findCharacter(id){ return allCharacters().find(c=>c.id===id); }
// Chips de plataforma chiquitos (ST/EP/PS/XB/NS) que aparecen al lado del título en las cards.
function platBadges(platforms){ return (platforms||[]).map(p=>`<span class="pbadge ${p}">${PLATFORM_NAMES[p]||p}</span>`).join(''); }


/* ---------- datos globales del catálogo (se llenan al bootear, ver loadAll() en 04-api-theme-rating.js) ---------- */
// Convierte un título en un slug de URL ("Elden Ring" -> "elden-ring"); saca tildes y caracteres raros.
function slug(t){ return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
let CATALOG = [];     // todos los juegos (catálogo base + agregados por usuarios), llenado por loadAll()
let DATE_EVENTS = []; // eventos del calendario de "fechas importantes" (cumpleaños/salidas), llenado por loadAll()
let NEWS_ITEMS = [];  // noticias del feed, llenado por loadAll()

/* ---------- ficha de un juego, colores de avatar y "mood" de una nota (1-10 -> palabra + color) ---------- */
// Datos extendidos de un juego (desarrollador/editor/año/descripción) para la ficha de detalle; null si el juego no tiene nada de eso cargado (juegos agregados por usuarios).
function gameDetails(g){
  if(g.description || g.developer || g.publisher){
    return { developer:g.developer||'—', publisher:g.publisher||'—', year:g.releaseYear||'—', description:g.description||'', mode:g.gameMode||'—' };
  }
  return null;
}

// Paleta de colores para el avatar por-defecto de un usuario (cuando no subió foto); se elige uno según el nombre de usuario (ver hashStr en 10-lists.js).
const AVATAR_COLORS = ["#8B7FE8","#5B8DEF","#E88FC0","#6C5FC7","#4C7DF0","#B06AC9"];
// Texto del "estado de ánimo" según la nota (1-10): "Un desastre" ... "¡Obra maestra!".
function MOOD(r){ return r<=2? t('mood1') : r<=4? t('mood3') : r<=6? t('mood5') : r<=8? t('mood7') : t('mood9'); }
// Igual que MOOD, pero con palabras pensadas para calificar un PERSONAJE en vez de un juego entero (ver 14-characters.js) — mismos 5 tramos de nota, texto distinto.
function MOOD_CHARACTER(r){ return r<=2? t('char_mood1') : r<=4? t('char_mood3') : r<=6? t('char_mood5') : r<=8? t('char_mood7') : t('char_mood9'); }
// Color de fondo del gauge/barra según la nota.
const MOOD_COLOR = (r)=> r<=2?'var(--red)': r<=4?'var(--teal-dim)': r<=6?'var(--teal)': r<=8?'var(--gold)':'var(--pink)';
// Color de texto a juego con MOOD_COLOR (para que el número sea legible arriba del gauge).
const MOOD_TEXT_COLOR = (r)=> r<=2?'var(--red-dim)': r<=6?'var(--teal-dim)': r<=8?'var(--gold-dim)':'var(--pink-dim)';

// Respaldo de "field-sizing: content" (ver textarea en public/css/style.css) para los navegadores que no lo tienen: la casilla crece al escribir; el tope de 5 renglones lo pone el CSS (max-height).
if(!CSS.supports('field-sizing','content')){
  const fit = el=>{ if(!el.offsetParent) return; el.style.height='auto'; el.style.height=(el.scrollHeight+2)+'px'; };
  document.addEventListener('input', e=>{ if(e.target.matches('textarea')) fit(e.target); });
  document.addEventListener('focusin', e=>{ if(e.target.matches('textarea')) fit(e.target); });
  // las que aparecen ya con texto (reseña, bio, descripción al editar) o se muestran después
  new MutationObserver(()=> document.querySelectorAll('textarea').forEach(fit)).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class'] });
}
