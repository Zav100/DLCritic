/**
 * ARCHIVO 1 de 16 — Íconos y metadata del catálogo.
 * Este es el PRIMER script que carga la página (ver el orden de <script> al
 * final de index.html): no depende de ningún otro archivo, y varios de los
 * siguientes (i18n, navegación, browse, etc.) usan lo que se define aquí.
 *
 * Contiene:
 *   - ICONS: todos los íconos SVG de la app, como strings HTML listos para
 *     inyectar (reemplazan a los emojis que se usaban antes).
 *   - Datos fijos sobre géneros, plataformas de tiendas y redes sociales,
 *     más los helpers que arman los "chips"/links que se ven en las cards.
 */

/* ---------- librería de íconos (reemplaza los emojis usados en toda la app) ---------- */
// Diccionario nombre -> SVG (string). Se usa así en el resto del código: ICONS.trash, ICONS.star, etc.
const ICONS = {
  arrowLeft: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='19' y1='12' x2='5' y2='12'/><polyline points='11 18 5 12 11 6'/></svg>`,
  grid: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='7' height='7' rx='1.5'/><rect x='14' y='3' width='7' height='7' rx='1.5'/><rect x='3' y='14' width='7' height='7' rx='1.5'/><rect x='14' y='14' width='7' height='7' rx='1.5'/></svg>`,
  list: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='8' y1='6' x2='21' y2='6'/><line x1='8' y1='12' x2='21' y2='12'/><line x1='8' y1='18' x2='21' y2='18'/><line x1='3' y1='6' x2='3.01' y2='6'/><line x1='3' y1='12' x2='3.01' y2='12'/><line x1='3' y1='18' x2='3.01' y2='18'/></svg>`,
  gamepad: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='6' y1='12' x2='10' y2='12'/><line x1='8' y1='10' x2='8' y2='14'/><line x1='15' y1='13' x2='15.01' y2='13'/><line x1='18' y1='11' x2='18.01' y2='11'/><rect x='2' y='6' width='20' height='12' rx='2'/></svg>`,
  search: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>`,
  book: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>`,
  dice: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='3'/><circle cx='8' cy='8' r='1.2' fill='currentColor'/><circle cx='16' cy='8' r='1.2' fill='currentColor'/><circle cx='8' cy='16' r='1.2' fill='currentColor'/><circle cx='16' cy='16' r='1.2' fill='currentColor'/><circle cx='12' cy='12' r='1.2' fill='currentColor'/></svg>`,
  plus: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>`,
  target: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1' fill='currentColor'/></svg>`,
  shuffle: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='16 3 21 3 21 8'/><line x1='4' y1='20' x2='21' y2='3'/><polyline points='21 16 21 21 16 21'/><line x1='15' y1='15' x2='21' y2='21'/><line x1='4' y1='4' x2='9' y2='9'/></svg>`,
  flame: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7.5 7.5 0 1 1-15 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'/></svg>`,
  crown: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 20h20'/><path d='M4 17l-1-9 5 4 4-6 4 6 5-4-1 9H4z'/></svg>`,
  bookmark: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'/></svg>`,
  thumbsUp: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z'/><path d='M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3'/></svg>`,
  sparkles: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8'/></svg>`,
  checkCircle: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/></svg>`,
  clock: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>`,
  ribbon: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='8' r='6'/><path d='M15.477 12.89 17 22l-5-3-5 3 1.523-9.11'/></svg>`,
  medal: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='15' r='6'/><path d='M9 10 6 2h2l4 8M15 10l3-8h-2l-4 8'/></svg>`,
  archive: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='3' width='20' height='5' rx='1'/><path d='M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8'/><line x1='10' y1='13' x2='14' y2='13'/></svg>`,
  helpCircle: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>`,
  fileText: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='8' y1='13' x2='16' y2='13'/><line x1='8' y1='17' x2='13' y2='17'/></svg>`,
  lock: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='11' width='18' height='11' rx='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/></svg>`,
  globe: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg>`,
  share: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='18' cy='5' r='3'/><circle cx='6' cy='12' r='3'/><circle cx='18' cy='19' r='3'/><line x1='8.59' y1='13.51' x2='15.42' y2='17.49'/><line x1='15.41' y1='6.51' x2='8.59' y2='10.49'/></svg>`,
  link: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/></svg>`,
  messageCircle: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'/></svg>`,
  x: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>`,
  sun: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='5'/><line x1='12' y1='1' x2='12' y2='3'/><line x1='12' y1='21' x2='12' y2='23'/><line x1='4.22' y1='4.22' x2='5.64' y2='5.64'/><line x1='18.36' y1='18.36' x2='19.78' y2='19.78'/><line x1='1' y1='12' x2='3' y2='12'/><line x1='21' y1='12' x2='23' y2='12'/><line x1='4.22' y1='19.78' x2='5.64' y2='18.36'/><line x1='18.36' y1='5.64' x2='19.78' y2='4.22'/></svg>`,
  moon: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/></svg>`,
  sprout: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M7 20h10M12 20V10'/><path d='M12 10C10 10 7 8.5 7 5c3.5 0 5 1.5 5 5z'/><path d='M12 10c2 0 5-1 5-5-3.5 0-5 1.5-5 5z'/></svg>`,
  layers: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='12 2 2 7 12 12 22 7 12 2'/><polyline points='2 17 12 22 22 17'/><polyline points='2 12 12 17 22 12'/></svg>`,
  zap: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg>`,
  heart: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'/></svg>`,
  sword: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='14.5' y1='9.5' x2='4' y2='20'/><path d='M18 3l3 3-3.5 3.5-3-3z'/><path d='M13 8.5L17.5 13'/><line x1='3' y1='21' x2='5' y2='19'/></svg>`,
  shield: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>`,
  map: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21'/><line x1='9' y1='3' x2='9' y2='18'/><line x1='15' y1='6' x2='15' y2='21'/></svg>`,
  puzzlePiece: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 9h3a1 1 0 0 0 1-1V6a2 2 0 1 1 4 0v2a1 1 0 0 0 1 1h3v3a1 1 0 0 0 1 1h2a2 2 0 1 1 0 4h-2a1 1 0 0 0-1 1v3H9v-3a1 1 0 0 0-1-1H6a2 2 0 1 1 0-4h2a1 1 0 0 0 1-1V9H4z'/></svg>`,
  ghost: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 10h.01M15 10h.01'/><path d='M4 21V11a8 8 0 0 1 16 0v10l-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2z'/></svg>`,
  flagPawn: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='6' r='3'/><path d='M9 21h6l-1-8h-4z'/><line x1='7' y1='21' x2='17' y2='21'/></svg>`,
  trophy: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z'/><path d='M7 5H4a2 2 0 0 0 0 4h1M17 5h3a2 2 0 0 1 0 4h-1'/></svg>`,
  flag: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='4' y1='22' x2='4' y2='3'/><path d='M4 4h14l-2.5 4L18 12H4'/></svg>`,
  mushroom: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 11a8 8 0 0 1 16 0z'/><path d='M9 11v7a3 3 0 0 0 6 0v-7'/></svg>`,
  candle: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2c1.5 2 1.5 3.5 0 5-1.5-1.5-1.5-3 0-5z'/><rect x='9' y='8' width='6' height='14' rx='1'/></svg>`,
  calendar: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='18' rx='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/></svg>`,
  edit: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/><path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'/></svg>`,
  trash: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/><line x1='10' y1='11' x2='10' y2='17'/><line x1='14' y1='11' x2='14' y2='17'/></svg>`,
  star: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'/></svg>`,
  user: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>`,
  logOut: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/><polyline points='16 17 21 12 16 7'/><line x1='21' y1='12' x2='9' y2='12'/></svg>`,
  chevronDown: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>`,
  bell: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'/><path d='M13.73 21a2 2 0 0 1-3.46 0'/></svg>`,
  settings: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>`,
};

/* Selección curada de títulos populares y su disponibilidad aproximada
   en las principales tiendas. No es un listado en vivo/completo de cada
   tienda, es una base inicial para poder calificar sin escribir a mano. */
// Ícono representativo de cada género (se usa como "portada" cuando el juego no tiene imagen real).
const GENRE_EMOJI = { "Acción":ICONS.sword,"Aventura":ICONS.map,"Casuales":ICONS.dice,"Indie":ICONS.sprout,"Multijugador":ICONS.share,"Carreras":ICONS.flag,"Rol":ICONS.shield,"Simulación":ICONS.settings,"Deportes":ICONS.trophy,"Estrategia":ICONS.flagPawn,"Disparos":ICONS.target,"Terror":ICONS.candle };
// Orden fijo de los géneros; también define a qué género le toca qué color (ver genreTint).
const GENRE_ORDER = Object.keys(GENRE_EMOJI);
// Devuelve la clase CSS "tint-N" (N entre 0 y 4) que le da a cada género un color de fondo distinto y estable.
function genreTint(genre){ const i = GENRE_ORDER.indexOf(genre); return 'tint-' + (i<0 ? 4 : i%5); }
// Nombre visible de cada tienda/plataforma soportada.
const PLATFORM_NAMES = { steam:"Steam", epic:"Epic Games", riot:"Riot Games", psn:"PlayStation Store", xbox:"Xbox", switch:"Nintendo eShop" };
// Color de marca + sigla de 2 letras de cada plataforma, usados en los chips de plataforma.
const PLATFORM_META = {
  steam:  { color:"#1b2838", mono:"ST" },
  epic:   { color:"#2a2a2a", mono:"EP" },
  riot:   { color:"#d13639", mono:"RG" },
  psn:    { color:"#003791", mono:"PS" },
  xbox:   { color:"#107c10", mono:"XB" },
  switch: { color:"#c8102e", mono:"NS" }
};
// Genera la URL de búsqueda de un juego dentro de cada tienda (fallback cuando el juego no tiene un link directo cargado).
const STORE_SEARCH = {
  steam:  (title)=> `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`,
  epic:   (title)=> `https://store.epicgames.com/en-US/browse?q=${encodeURIComponent(title)}&sortBy=relevancy&sortDir=DESC`,
  riot:   ()=> 'https://www.riotgames.com/',
  psn:    (title)=> `https://store.playstation.com/en-us/search/${encodeURIComponent(title)}`,
  xbox:   (title)=> `https://www.xbox.com/en-us/search/results/games?q=${encodeURIComponent(title)}`,
  switch: (title)=> `https://www.nintendo.com/us/search/?q=${encodeURIComponent(title)}&p=1&cat=Games`
};
// Arma los botones "Steam ↗", "Xbox ↗", etc. de la ficha de un juego (usa el link directo si existe, si no la búsqueda de arriba).
function storeLinksHTML(g){
  if(!g.platforms || !g.platforms.length) return '';
  return g.platforms.map(p=>{
    const meta = PLATFORM_META[p];
    if(!meta) return '';
    const direct = g.storeLinks && g.storeLinks[p];
    const href = direct || (STORE_SEARCH[p] && STORE_SEARCH[p](g.title));
    if(!href) return '';
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="store-link" style="--pcolor:${meta.color}"><span class="plat-chip-icon">${meta.mono}</span>${esc(PLATFORM_NAMES[p])} ↗</a>`;
  }).join('');
}
// Redes/plataformas que un usuario puede enlazar en su perfil (ver Ajustes → Perfil).
const SOCIAL_META = {
  instagram:   { name:"Instagram",   mono:"IG", color:"#C13584" },
  facebook:    { name:"Facebook",    mono:"FB", color:"#1877F2" },
  x:           { name:"X",           mono:"X",  color:"#000000" },
  youtube:     { name:"YouTube",     mono:"YT", color:"#FF0000" },
  steam:       { name:"Steam",       mono:"ST", color:"#1b2838" },
  epic:        { name:"Epic Games",  mono:"EP", color:"#2a2a2a" },
  playstation: { name:"PlayStation", mono:"PS", color:"#003791" },
  xbox:        { name:"Xbox",        mono:"XB", color:"#107c10" },
  nintendo:    { name:"Nintendo",    mono:"NS", color:"#c8102e" },
};
const SOCIAL_KEYS = Object.keys(SOCIAL_META);
// Arma los links de redes sociales que se muestran en la cabecera de un perfil público.
function socialLinksHTML(socialLinks){
  const keys = SOCIAL_KEYS.filter(k=> socialLinks && socialLinks[k]);
  if(!keys.length) return '';
  return `<div class="store-links social-links">` + keys.map(k=>{
    const meta = SOCIAL_META[k];
    return `<a href="${esc(socialLinks[k])}" target="_blank" rel="noopener noreferrer" class="store-link" style="--pcolor:${meta.color}"><span class="plat-chip-icon">${meta.mono}</span>${esc(meta.name)} ↗</a>`;
  }).join('') + `</div>`;
}
// Botón chip de una plataforma (usado en los filtros de Explorar y en el formulario de reseña); "active" le da el estilo seleccionado.
function platChip(key, active){
  const m = PLATFORM_META[key];
  return `<button type="button" class="plat-chip ${active?'active':''}" data-plat="${key}" style="--pcolor:${m.color}">
    <span class="plat-chip-icon">${m.mono}</span>${PLATFORM_NAMES[key]}
  </button>`;
}
// Traducción de cada género al inglés, para cuando la interfaz está en modo EN.
const GENRE_EN = { "Acción":"Action","Aventura":"Adventure","Casuales":"Casual","Indie":"Indie","Multijugador":"Multiplayer","Carreras":"Racing","Rol":"Role-playing","Simulación":"Simulation","Deportes":"Sports","Estrategia":"Strategy","Disparos":"Shooter","Terror":"Horror" };
// Nombre de un género en el idioma actual de la interfaz (state.lang, definido en 03-state-and-utils.js).
function genreLabel(g){ return state.lang==='en' ? (GENRE_EN[g]||g) : g; }
// Género "principal" de un juego (el primero de la lista, o el género viejo de un solo valor si el juego no tiene lista de géneros).
function primaryGenre(game){ return (game.genres && game.genres.length ? game.genres[0] : null) || game.genre || 'Otro'; }
// Todos los géneros de un juego, ya traducidos y unidos con coma, listo para mostrar (p. ej. "Acción, RPG").
function genreLabelList(game){ const list = (game.genres && game.genres.length) ? game.genres : [game.genre || 'Otro']; return list.map(genreLabel).join(', '); }

