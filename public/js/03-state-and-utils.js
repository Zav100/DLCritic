/**
 * ARCHIVO 3 de 16 — Estado global de la app + utilidades chicas compartidas.
 *
 * Lo más importante de este archivo es `state`: es el ÚNICO objeto que
 * guarda todo lo que la interfaz necesita recordar (usuario logueado,
 * lista de juegos, reseñas, filtros activos, vista actual, etc.). Casi
 * cualquier función de cualquier otro archivo lee o escribe `state` en
 * algún momento — no hay "stores" separados por feature.
 *
 * También viven acá: helpers de formato/DOM usados en TODA la app (esc,
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
const NO_VALUE_SORT_LAST = '￿'; // valor "más alto posible" para que los juegos sin dato queden al final al ordenar
const isSoloMode = g=> g.gameMode==='Un jugador';

/* ---------- opciones de orden para "Explorar catálogo" ---------- */
const BROWSE_SORTS = {
  rating_desc: (a,b)=> gameStats(b.id).avg - gameStats(a.id).avg,
  rating_asc: (a,b)=> gameStats(a.id).avg - gameStats(b.id).avg,
  az: (a,b)=> a.title.localeCompare(b.title),
  za: (a,b)=> b.title.localeCompare(a.title),
  release_date_desc: (a,b)=> (b.releaseYear||0) - (a.releaseYear||0),
  release_date_asc: (a,b)=> (a.releaseYear||Infinity) - (b.releaseYear||Infinity),
  developer: (a,b)=> (a.developer||NO_VALUE_SORT_LAST).localeCompare(b.developer||NO_VALUE_SORT_LAST) || a.title.localeCompare(b.title),
  game_mode_solo: (a,b)=> (isSoloMode(b)?1:0)-(isSoloMode(a)?1:0) || (a.gameMode||NO_VALUE_SORT_LAST).localeCompare(b.gameMode||NO_VALUE_SORT_LAST) || a.title.localeCompare(b.title),
  game_mode_other: (a,b)=> (isSoloMode(a)?1:0)-(isSoloMode(b)?1:0) || (a.gameMode||NO_VALUE_SORT_LAST).localeCompare(b.gameMode||NO_VALUE_SORT_LAST) || a.title.localeCompare(b.title),
};
const BROWSE_SORT_KEYS = ['rating_desc','rating_asc','az','za','release_date_desc','release_date_asc','developer','game_mode_solo','game_mode_other'];
// EL estado global de la app. No es reactivo (no hay framework): cuando algo
// cambia acá, quien lo cambió es responsable de volver a pintar lo que
// corresponda (llamando a la función render... que haga falta).
let state = { user:null, games:[], reviews:[], characters:[], characterReviews:[], notifications:[], view:'feed', authTab:'login', browseFilter:new Set(), browseGenres:new Set(), lang:'es', reviewEditing:false, charReviewEditing:false, browseVisibleCount:BROWSE_PAGE_SIZE, browseViewMode: (function(){ try{ return localStorage.getItem('browseViewMode')==='list' ? 'list' : 'grid'; }catch(e){ return 'grid'; } })(), browseSortMode: (function(){ try{ const v=localStorage.getItem('browseSortMode'); return BROWSE_SORT_KEYS.includes(v) ? v : 'rating_desc'; }catch(e){ return 'rating_desc'; } })() };

/* ---------- utilidades chicas de uso general ---------- */
// Id único cortito para cosas que se crean en el cliente (ids de elementos temporales, etc.).
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
// Escapa texto antes de inyectarlo como HTML (protección básica contra XSS). Usar SIEMPRE al insertar texto de usuario/servidor en un template string de HTML.
// Texto "plano" para buscar: sin mayúsculas ni tildes, así "ragnarok" encuentra "Ragnarök" y "pokemon" encuentra "Pokémon".
function foldText(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Formatea una fecha ISO al formato lindo ("04 sept 2026" / "Sep 04, 2026" según el idioma).
function fmtDate(iso){ const d=new Date(iso); return d.toLocaleDateString(state.lang==='en'?'en-US':'es-ES',{day:'2-digit',month:'short',year:'numeric'}); }
// Muestra el mensajito flotante abajo de la pantalla (el "toast") con un texto, y lo oculta solo a los 2.2s.
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'), 2200); }
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
  document.getElementById('characterDetail').innerHTML = `<div class="card skeleton-card"><div style="display:flex; gap:16px; align-items:center;"><div class="skel skel-avatar" style="margin:0;"></div><div style="flex:1;"><div class="skel skel-title"></div><div class="skel skel-line"></div></div></div></div>`;
  // Entrando directo a /personajes o a la ficha de uno, mostrar ya esa vista (con sus esqueletos) en vez de dejar Novedades a la vista hasta que lleguen los datos.
  const early = location.pathname==='/personajes' ? 'view-characters' : location.pathname.startsWith('/personaje/') ? 'view-character' : null;
  if(early) document.querySelectorAll('.viewsec').forEach(s=> s.hidden = s.id!==early);
}
/* ---------- real cover art (best-effort, cached server-side, lazy-loaded) ---------- */
// Cómo funciona la portada real de un juego, en 4 pasos:
//   1. Cualquier elemento que necesite portada se marca con data-cover-title
//      (y opcionalmente data-cover-url si ya se sabe la URL directa) en su HTML.
//   2. enhanceCovers() busca esos elementos y les da un color de fondo
//      provisorio (placeholderColor) + los pone a observar con coverIO.
//   3. coverIO (un IntersectionObserver) espera a que el elemento esté por
//      entrar en pantalla (scroll) antes de pedir la imagen — así no se
//      descargan de una las portadas de TODO el catálogo.
//   4. fetchCover() pide la URL real al servidor (que la cachea del lado
//      del server) y attachCoverImg() la inyecta con fade-in.
// enhanceCovers() se vuelve a llamar solo cada vez que el DOM cambia (ver el
// MutationObserver al final), así que no hace falta acordarse de llamarla
// manualmente después de cada render.
const coverCache = new Map(); // title -> Promise<url|null>, para no pedir la misma portada dos veces
function fetchCover(title){
  if(coverCache.has(title)) return coverCache.get(title);
  const p = apiGet('/cover?title='+encodeURIComponent(title)).then(r=>r.url).catch(()=>null);
  coverCache.set(title, p);
  return p;
}
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
  img.onload = ()=> el.classList.add('has-cover');
  img.src = url;
  el.appendChild(img);
}
// Observador compartido: dispara la carga de portada recién cuando el elemento está por entrar en pantalla (margen de 200px).
const coverIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    const el = entry.target;
    coverIO.unobserve(el);
    const direct = el.dataset.coverUrl;
    if(direct){ attachCoverImg(el, direct); return; }
    fetchCover(el.dataset.coverTitle).then(url=>{ if(url) attachCoverImg(el, url); });
  });
}, { rootMargin:'200px' });
// Portada "hero" (la grande de la ficha de un juego): esta se carga de una, sin esperar a que entre en pantalla, porque siempre está arriba de todo.
function loadHeroCover(title, el, directUrl){
  if(!el) return;
  const apply = (url)=>{
    if(!url) return;
    el.style.backgroundImage = `url("${url}")`;
    el.classList.add('has-cover');
  };
  if(directUrl) apply(directUrl);
  else fetchCover(title).then(apply);
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
    if(typeof c.onclick==='function'){ c.tabIndex = 0; c.setAttribute('role','button'); }
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
