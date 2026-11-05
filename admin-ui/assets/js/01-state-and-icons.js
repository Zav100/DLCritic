/**
 * ARCHIVO 1 de 6 — Panel de administración (admin-ui/admin.html).
 * Íconos + datos fijos + el estado global de ESTE panel (independiente
 * del state de la app principal — son dos páginas separadas, cada una con
 * su propio HTML/CSS/JS, que solo comparten el mismo backend).
 * Primer script que carga, ver el orden de <script> al final de admin.html.
 */
const ICON_SVG = {
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  gamepad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  newspaper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
  mailOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7"/><path d="M2 13l8.4 5.6a3 3 0 0 0 3.2 0L22 13"/><path d="M2 13l7-4"/><path d="M22 13l-7-4"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
};
// Ícono + texto pegoteados, para botones tipo "🖊 Editar" — el ícono va sin escapar (siempre viene de ICON_SVG, nunca de datos externos) y el texto sí se escapa.
function iconLabel(icon, text){ return `${ICON_SVG[icon]} ${esc(text)}`; }

// Listas fijas para los <select>/checkboxes del formulario de juego — deben coincidir con lo que usa la app principal (public/js/01-icons-and-catalog-meta.js) aunque estén repetidas acá (son dos páginas separadas, sin código compartido).
const GENRES = ["Acción","Aventura","Casuales","Indie","Multijugador","Carreras","Rol","Simulación","Deportes","Estrategia","Disparos","Terror"];
const PLATFORMS = [
  { key:'steam', name:'Steam' }, { key:'epic', name:'Epic Games' }, { key:'psn', name:'PlayStation Store' },
  { key:'xbox', name:'Xbox' }, { key:'switch', name:'Nintendo eShop' },
];

// Estado global del panel: sesión de admin, catálogo completo, qué se está editando en cada una de las 3 pestañas (juegos/fechas/noticias), filtros de búsqueda, y las sugerencias de la bandeja de entrada.
let state = { user:null, games:[], editingId:null, coverUrl:null, cardCoverUrl:null, characters:[], editingCharacterId:null, characterPhotoUrl:null, characterGameIds:[], characterBannerUrl:null, characterBannerGameId:null, dateEvents:[], editingDateId:null, newsItems:[], editingNewsId:null, gameSearch:'', gameVisFilter:'all', gameSortMode:'title', suggestions:[], inboxFilter:'all', inboxKind:'all' };

// Respaldo de "field-sizing: content" (ver textarea en admin-ui/assets/admin.css) para los navegadores que no lo tienen: la casilla crece al escribir; el tope de 5 renglones lo pone el CSS (max-height).
if(!CSS.supports('field-sizing','content')){
  const fit = el=>{ if(!el.offsetParent) return; el.style.height='auto'; el.style.height=(el.scrollHeight+2)+'px'; };
  document.addEventListener('input', e=>{ if(e.target.matches('textarea')) fit(e.target); });
  document.addEventListener('focusin', e=>{ if(e.target.matches('textarea')) fit(e.target); });
  // las que aparecen ya con texto (reseña, bio, descripción al editar) o se muestran después
  new MutationObserver(()=> document.querySelectorAll('textarea').forEach(fit)).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class'] });
}
