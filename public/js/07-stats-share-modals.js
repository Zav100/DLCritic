/**
 * ARCHIVO 7 de 16 — Estadísticas de perfil, logros, y todo lo de "compartir".
 *
 * Es el archivo más grande y el más variado a propósito: agrupa varias
 * pantallas secundarias (no una "sección" de la app en sí) que en el
 * código original vivían una atrás de la otra. Se separan acá con
 * comentarios de sección bien marcados — usá Ctrl+F por el título de la
 * sección para saltar directo:
 *
 *   1. Niveles / racha / logros / estadísticas de un perfil (para la
 *      página de perfil, 09-shelf-profile.js).
 *   2. confirmDialog() — el cuadro de confirmación genérico (reemplaza al
 *      confirm() nativo del navegador), se usa desde CUALQUIER archivo.
 *   3. Modal de "sugerir un juego" (el formulario del footer).
 *   4. Menú y lógica de "compartir una reseña" (WhatsApp, X, copiar link).
 *   5. La tarjeta de imagen para compartir (se dibuja a mano en un
 *      <canvas>, con su selector de color de fondo).
 *   6. reviewCard() — la card de una reseña (se usa en la ficha de un
 *      juego, en el perfil, en todos lados donde se listan reseñas), y un
 *      par de helpers de UI genéricos usados por toda la app
 *      (emptyState, wireSearchClear).
 */
/* ---------- rachas, niveles, logros y estadísticas ---------- */
// Umbral de reseñas para cada nivel (Novato/Aficionado/Crítico/Leyenda). El orden importa: son de menor a mayor.
const LEVELS = [
  {min:0,  nameKey:'level_novato',     icon:ICONS.sprout},
  {min:3,  nameKey:'level_aficionado', icon:ICONS.gamepad},
  {min:10, nameKey:'level_critico',    icon:ICONS.star},
  {min:25, nameKey:'level_leyenda',    icon:ICONS.crown}
];
// Nivel actual de un usuario según su cantidad de reseñas, + el próximo nivel (o null si ya está en el máximo).
function computeLevel(count){
  let current=LEVELS[0];
  for(const lv of LEVELS){ if(count>=lv.min) current=lv; }
  const idx=LEVELS.indexOf(current);
  return { current, next: LEVELS[idx+1] || null };
}
/* ---------- tarjeta de imagen para compartir: paleta de fondos ---------- */
// Fondos sólidos/degradados que el usuario puede elegir para la tarjeta de imagen (ver drawShareCard más abajo).
const CARD_BG_OPTIONS = [
  { id:'gold',      type:'solid',    colors:['#8B7FE8'] },
  { id:'teal',      type:'solid',    colors:['#5B8DEF'] },
  { id:'pink',      type:'solid',    colors:['#F0A8D0'] },
  { id:'red',       type:'solid',    colors:['#DB5A5A'] },
  { id:'gold-pink', type:'gradient', colors:['#8B7FE8','#F0A8D0'] },
  { id:'teal-red',  type:'gradient', colors:['#5B8DEF','#DB5A5A'] },
];
// Fecha -> string "AAAA-MM-DD" en huso horario LOCAL (a propósito, no toISOString: eso usa UTC y desfasaría el día de actividad según la hora en que se juega/reseña).
function localDateKey(d){
  const dt = d!==undefined ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
// Todos los días en que un usuario tuvo actividad: los días en que publicó/editó una reseña, más los días "manuales" guardados en activityDates (actividad que no viene de una reseña, p.ej. jugar el reto del día). Se usa para la racha y el calendario de actividad.
function userActivityDays(username){
  const reviewDates = state.reviews.filter(r=>r.username===username).map(r=> localDateKey(r.date));
  const extra = (state.user && state.user.username===username && state.user.activityDates) || [];
  return [...reviewDates, ...extra];
}
// Marca "hoy" (o la fecha que se pase) como día de actividad del usuario, si todavía no estaba marcada. Se usa desde el reto del día para que jugarlo cuente para la racha aunque no dejes una reseña.
async function recordActivity(username, dateStr){
  if(!state.user || state.user.username!==username) return;
  if(!state.user.activityDates) state.user.activityDates=[];
  if(!state.user.activityDates.includes(dateStr)){
    state.user.activityDates.push(dateStr);
    try{ await apiPost('/profile/activity', { date: dateStr }); }catch(e){}
  }
}
// Racha de días consecutivos con actividad, contando hacia atrás desde hoy (o desde ayer, si hoy todavía no hubo actividad — así la racha no se corta de golpe a la medianoche).
function computeStreak(username){
  const days = new Set(userActivityDays(username));
  if(days.size===0) return 0;
  let cursor = new Date();
  let key = localDateKey(cursor);
  if(!days.has(key)){
    cursor.setDate(cursor.getDate()-1);
    key = localDateKey(cursor);
    if(!days.has(key)) return 0;
  }
  let streak=0;
  while(days.has(key)){
    streak++;
    cursor.setDate(cursor.getDate()-1);
    key = localDateKey(cursor);
  }
  return streak;
}
// Cuántos juegos de "Mi biblioteca" el usuario ya calificó, y qué porcentaje representa (para el anillo de progreso del perfil).
function wishlistPlayedStats(){
  const wishlist = (state.user && state.user.wishlist) || [];
  const total = wishlist.length;
  if(total===0) return { total:0, rated:0, percent:0 };
  const ratedSet = new Set(state.reviews.filter(r=>r.username===state.user.username && r.rating!=null).map(r=>r.gameId));
  const rated = wishlist.filter(id=>ratedSet.has(id)).length;
  return { total, rated, percent: Math.round((rated/total)*100) };
}
// Dibuja el anillo de progreso (un arco de 300° en vez de un círculo completo) con un SVG usado como máscara CSS para "recortar" el relleno al porcentaje indicado. Es puramente HTML/CSS, no <canvas>.
function renderProgressRing(percent){
  const size=88, sw=8, c=size/2, r=(size-sw)/2;
  const circumference = 2*Math.PI*r;
  const visibleArc = circumference * (300/360);
  const gapLen = circumference - visibleArc;
  const fillLen = visibleArc * (percent/100);
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="white" stroke-width="${sw}" stroke-linecap="${percent>0?'round':'butt'}" stroke-dasharray="${fillLen} ${circumference-fillLen}" transform="rotate(120 ${c} ${c})"/></svg>`;
  const maskUrl = `url('data:image/svg+xml,${encodeURIComponent(maskSvg)}')`;
  return `
    <div class="wishlist-ring">
      <svg viewBox="0 0 ${size} ${size}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--paper-alt)" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${visibleArc} ${gapLen}" transform="rotate(120 ${c} ${c})"/>
      </svg>
      <div class="wishlist-ring-fill" style="mask-image:${maskUrl}; -webkit-mask-image:${maskUrl};"></div>
      <div class="wishlist-ring-pct">${percent}%</div>
    </div>`;
}
// El cálculo grande de estadísticas de un perfil: género y plataforma favoritos (por cantidad de reseñas, y en empate por la más reciente), cuántos géneros/plataformas distintos jugó, cuántos dieron 10, si alguna vez calificó bajo, la racha, y su reseña mejor puntuada. Es la base de la que salen tanto los "logros" como los datos que se muestran en la cabecera del perfil.
function userStats(username){
  const reviews = state.reviews.filter(r=>r.username===username);
  const genreTally={}, platTally={}, genreLast={}, platLast={};
  reviews.forEach(r=>{
    const g=findGame(r.gameId);
    const t=new Date(r.date).getTime();
    if(g){
      const gGenres = (g.genres && g.genres.length) ? g.genres : [g.genre || 'Otro'];
      gGenres.forEach(genre=>{
        genreTally[genre]=(genreTally[genre]||0)+1;
        if(!genreLast[genre] || t>genreLast[genre]) genreLast[genre]=t;
      });
    }
    (r.platforms||[]).forEach(p=>{
      platTally[p]=(platTally[p]||0)+1;
      if(!platLast[p] || t>platLast[p]) platLast[p]=t;
    });
  });
  const favGenre = Object.entries(genreTally).sort((a,b)=> b[1]-a[1] || genreLast[b[0]]-genreLast[a[0]])[0];
  const favPlatform = Object.entries(platTally).sort((a,b)=> b[1]-a[1] || platLast[b[0]]-platLast[a[0]])[0];
  const rated = reviews.filter(r=>r.rating!=null);
  const topReview = rated.length? [...rated].sort((a,b)=> b.rating-a.rating || new Date(b.date)-new Date(a.date))[0] : null;
  return {
    reviews, count:reviews.length,
    genres:Object.keys(genreTally).length, platforms:Object.keys(platTally).length,
    tens: reviews.filter(r=>r.rating===10).length,
    hasLow: reviews.some(r=>r.rating!=null && r.rating<=3),
    streak: computeStreak(username),
    favGenre: favGenre? favGenre[0] : null,
    favPlatform: favPlatform? PLATFORM_NAMES[favPlatform[0]] : null,
    topReview
  };
}
// Lista de logros: cada uno tiene un ícono, sus claves de traducción para
// título/descripción, y check(stats) — una función que recibe el objeto de
// userStats() de arriba y devuelve true/false si el logro está desbloqueado.
// Para agregar un logro nuevo: sumá una entrada acá + sus claves ach_XXX_t /
// ach_XXX_d en el diccionario I18N (02-i18n.js), en los dos idiomas.
const ACHIEVEMENTS = [
  { id:'first',      icon:ICONS.gamepad, titleKey:'ach_first_t',     descKey:'ach_first_d',     check:s=>s.count>=1 },
  { id:'ten',        icon:ICONS.book, titleKey:'ach_ten_t',       descKey:'ach_ten_d',       check:s=>s.count>=10 },
  { id:'legend',     icon:ICONS.crown, titleKey:'ach_legend_t',    descKey:'ach_legend_d',    check:s=>s.count>=25 },
  { id:'genres5',    icon:ICONS.layers, titleKey:'ach_genres5_t',   descKey:'ach_genres5_d',   check:s=>s.genres>=5 },
  { id:'platforms3', icon:ICONS.gamepad, titleKey:'ach_plat3_t',     descKey:'ach_plat3_d',     check:s=>s.platforms>=3 },
  { id:'streak3',    icon:ICONS.flame, titleKey:'ach_streak3_t',   descKey:'ach_streak3_d',   check:s=>s.streak>=3 },
  { id:'harsh',      icon:ICONS.zap, titleKey:'ach_harsh_t',     descKey:'ach_harsh_d',     check:s=>s.hasLow },
  { id:'fan',        icon:ICONS.heart, titleKey:'ach_fan_t',       descKey:'ach_fan_d',       check:s=>s.tens>=3 },
  { id:'fifty',       icon:ICONS.trophy,   titleKey:'ach_fifty_t',       descKey:'ach_fifty_d',       check:s=>s.count>=50 },
  { id:'genres8',     icon:ICONS.sparkles, titleKey:'ach_genres8_t',     descKey:'ach_genres8_d',     check:s=>s.genres>=8 },
  { id:'platforms5',  icon:ICONS.globe,    titleKey:'ach_platforms5_t',  descKey:'ach_platforms5_d',  check:s=>s.platforms>=5 },
  { id:'streak7',     icon:ICONS.calendar, titleKey:'ach_streak7_t',     descKey:'ach_streak7_d',     check:s=>s.streak>=7 },
  { id:'wordsmith',   icon:ICONS.fileText, titleKey:'ach_wordsmith_t',   descKey:'ach_wordsmith_d',   check:s=>s.reviews.some(r=>r.text && r.text.trim().length>=300) },
  { id:'polarized',   icon:ICONS.dice,     titleKey:'ach_polarized_t',   descKey:'ach_polarized_d',   check:s=>s.tens>=1 && s.hasLow },
  { id:'helpful5',    icon:ICONS.thumbsUp, titleKey:'ach_helpful5_t',    descKey:'ach_helpful5_d',    check:s=>s.reviews.reduce((sum,r)=>sum+((r.helpfulBy||[]).length),0)>=5 },
  { id:'fullprofile', icon:ICONS.user,     titleKey:'ach_fullprofile_t', descKey:'ach_fullprofile_d', check:s=>!!s.hasAvatar && !!s.hasBio }
];
// El mini-calendario de actividad tipo "heatmap" (últimos 84 días) del
// perfil — son los cuadraditos chicos de 12x12px, NO tiene relación con el
// calendario de fechas importantes de 06-news-and-new-games.js (ese usa
// las clases evcal-grid/evcal-cell a propósito, para no chocar con las
// clases cal-grid/cal-cell de este calendarito, que son las originales).
function renderActivityCalendar(container, username){
  const tally={};
  userActivityDays(username).forEach(key=>{ tally[key]=(tally[key]||0)+1; });
  const today=new Date(); today.setHours(0,0,0,0);
  const totalDays=84;
  const start=new Date(today); start.setDate(start.getDate()-(totalDays-1));
  let html='<div class="cal-grid">';
  for(let i=0;i<totalDays;i++){
    const d=new Date(start); d.setDate(d.getDate()+i);
    const key=localDateKey(d);
    const c=tally[key]||0;
    const lvl = c===0?0:c===1?1:c===2?2:3;
    html+=`<div class="cal-cell lvl${lvl}" title="${key}: ${c} actividad${c===1?'':'es'}"></div>`;
  }
  html+='</div>';
  container.innerHTML=html;
}

// Una reseña "cuenta" para mostrarse en listados si tiene nota y/o texto (una que solo tiene plataformas marcadas, sin nota ni texto, no se considera contenido real).
function hasReviewContent(rv){
  return rv.rating!=null || !!(rv.text && rv.text.trim());
}
// True si esta reseña fue la PRIMERA que se publicó para ese juego (le da la medallita "Primera reseña").
function isFirstReview(rv){
  const candidates = state.reviews.filter(r=>r.gameId===rv.gameId);
  if(candidates.length===0) return false;
  const earliest = candidates.reduce((a,b)=> new Date(a.date)<=new Date(b.date)? a : b);
  return earliest.id === rv.id;
}
// Botón "¿Te sirvió esta reseña?": vota/desvota y actualiza SOLO el botón y el contador en el lugar (no re-renderiza toda la vista), así la página no salta al principio cada vez que alguien vota.
async function toggleHelpful(reviewId){
  if(!state.user){ goView('auth'); return; }
  const rv = state.reviews.find(r=>r.id===reviewId);
  if(!rv) return;
  let helpfulBy;
  try{
    ({ helpfulBy } = await apiPost('/reviews/id/'+encodeURIComponent(reviewId)+'/helpful'));
    rv.helpfulBy = helpfulBy;
  }catch(e){ toast(t('err_save_review')); return; }
  // Update the button/count in place instead of re-rendering the whole view,
  // so the page doesn't jump back to the top on every vote.
  const btn = document.querySelector(`[data-helpful="${CSS.escape(reviewId)}"]`);
  if(!btn) return;
  const voted = helpfulBy.includes(state.user.username);
  btn.classList.toggle('voted', voted);
  btn.textContent = voted ? t('helpful_yes') : t('helpful_ask');
  const row = btn.closest('.helpful-row');
  let countEl = row.querySelector('.helpful-count');
  if(helpfulBy.length>0){
    if(!countEl){ countEl=document.createElement('span'); countEl.className='helpful-count'; row.appendChild(countEl); }
    countEl.textContent = `${helpfulBy.length} ${helpfulBy.length===1? t('helpful_count') : t('helpful_count_pl')}`;
  } else if(countEl){
    countEl.remove();
  }
}
/* ---------- confirm dialog (glass, replaces native confirm()) ---------- */
// Reemplazo con el estilo visual de la app para el confirm() nativo del
// navegador. Es una Promise: `if(await confirmDialog('¿Seguro?')) {...}`.
// Se resuelve true si el usuario confirma, false si cancela, cierra con
// Escape, o hace click afuera del cuadro.
function confirmDialog(message){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${esc(message)}</p>
        <div class="confirm-actions">
          <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
          <button class="btn" data-act="ok" style="background:var(--red); box-shadow:0 4px 14px rgba(224,64,91,0.34);">${t('delete_btn')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    function onKey(e){ if(e.key==='Escape') cleanup(false); }
    function cleanup(result){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
    overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(false); });
    overlay.querySelector('[data-act="cancel"]').onclick = ()=> cleanup(false);
    overlay.querySelector('[data-act="ok"]').onclick = ()=> cleanup(true);
    document.addEventListener('keydown', onKey);
  });
}

/* ---------- sugerir un juego (footer) ---------- */
// Modal del botón "Sugerir un juego" del footer: un formulario simple que
// manda la sugerencia a /api/suggestions (la revisa un admin desde el
// panel de administración, ver admin-ui/assets/js/06-suggestions-and-init.js).
function openSuggestModal(){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  const platSet = new Set();
  overlay.innerHTML = `
    <div class="confirm-box suggest-modal">
      <h3>${esc(t('suggest_modal_title'))}</h3>
      <div class="field">
        <label for="sg-title">${esc(t('suggest_title_label'))}</label>
        <input type="text" id="sg-title" maxlength="80" placeholder="${esc(t('suggest_title_ph'))}">
      </div>
      <div class="field">
        <label>${esc(t('suggest_platforms_label'))}</label>
        <div class="filterbar" id="sgPlatforms">${platformChipsHTML(platSet,'sg')}</div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="sg-genre">${esc(t('suggest_genre_label'))}</label>
          <select id="sg-genre"><option value="">—</option>${Object.keys(GENRE_EMOJI).map(g=>`<option value="${esc(g)}">${esc(genreLabel(g))}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="sg-year">${esc(t('suggest_year_label'))}</label>
          <input type="text" inputmode="numeric" id="sg-year" maxlength="4" placeholder="2024">
        </div>
      </div>
      <div class="field">
        <label for="sg-note">${esc(t('suggest_note_label'))}</label>
        <textarea id="sg-note" maxlength="300" placeholder="${esc(t('suggest_note_ph'))}" style="min-height:60px;"></textarea>
      </div>
      <div class="error" id="sgError" hidden></div>
      <div class="confirm-actions">
        <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
        <button class="btn gold" data-act="send">${esc(t('suggest_submit_btn'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('#sgPlatforms .plat-chip').forEach(c=>{
    c.onclick = ()=>{ const p=c.dataset.plat; platSet.has(p) ? platSet.delete(p) : platSet.add(p); c.classList.toggle('active'); };
  });
  function onKey(e){ if(e.key==='Escape') cleanup(); }
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="cancel"]').onclick = cleanup;
  overlay.querySelector('[data-act="send"]').onclick = async ()=>{
    const errEl = document.getElementById('sgError');
    errEl.hidden = true;
    const title = document.getElementById('sg-title').value.trim();
    if(title.length<2){ errEl.textContent = t('suggest_err_title'); errEl.hidden=false; return; }
    const genre = document.getElementById('sg-genre').value;
    const yearRaw = document.getElementById('sg-year').value.trim();
    const note = document.getElementById('sg-note').value.trim();
    try{
      await apiPost('/suggestions', {
        title, platforms: Array.from(platSet),
        genre: genre || undefined,
        releaseYear: yearRaw ? Number(yearRaw) : undefined,
        note: note || undefined,
      });
      toast(t('toast_suggestion_sent'));
      cleanup();
    }catch(e){ errEl.textContent = t('err_send_suggestion'); errEl.hidden=false; }
  };
  document.getElementById('sg-title').focus();
}

/* ---------- compartir reseña/calificación ---------- */
function shareUrlForGame(gameId){ return location.origin + '/juego/' + encodeURIComponent(gameId); }
// Arma el texto para compartir por WhatsApp/X/copiar: "usuario calificó X con N/10" (o "reseñó X" si no puso nota), + un fragmento del texto de la reseña si tiene (recortado a 140 caracteres).
function buildShareText(rv, game){
  let text = rv.rating!=null
    ? `${rv.username} calificó "${game.title}" con ${rv.rating}/10 en DLCritic.`
    : `${rv.username} reseñó "${game.title}" en DLCritic.`;
  if(rv.text && rv.text.trim()){
    const snippet = rv.text.length>140 ? rv.text.slice(0,140)+'…' : rv.text;
    text += ` "${snippet}"`;
  }
  return text;
}
let currentShareMenu = null; // el menú de compartir actualmente abierto, o null (misma idea que currentUserMenu en 05-navigation.js)
function closeShareMenu(){
  if(currentShareMenu){ currentShareMenu.remove(); currentShareMenu=null; }
  document.removeEventListener('click', shareMenuOutsideClick, true);
  window.removeEventListener('scroll', closeShareMenu, true);
}
function shareMenuOutsideClick(e){ if(currentShareMenu && !currentShareMenu.contains(e.target)) closeShareMenu(); }
// Menú de compartir (el ícono de link en una card de reseña): nativo del
// sistema operativo si el navegador lo soporta (navigator.share), copiar
// texto+link, WhatsApp, X, o abrir el generador de tarjeta de imagen.
function openShareMenu(anchorEl, rv, game){
  closeShareMenu();
  closeUserMenu();
  const url = shareUrlForGame(game.id);
  const text = buildShareText(rv, game);
  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.innerHTML = `
    ${navigator.share ? `<button data-act="native">${t('share_native')}</button>` : ''}
    <button data-act="copy">${t('share_copy')}</button>
    <button data-act="whatsapp">${t('share_whatsapp')}</button>
    <button data-act="x">${t('share_x')}</button>
    <button data-act="card">${t('share_card')}</button>
  `;
  document.body.appendChild(menu);
  currentShareMenu = menu;
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  let left = rect.left + window.scrollX;
  if(left + menuWidth > window.scrollX + document.documentElement.clientWidth - 8){
    left = window.scrollX + document.documentElement.clientWidth - menuWidth - 8;
  }
  menu.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  menu.style.left = Math.max(8, left) + 'px';

  const nativeBtn = menu.querySelector('[data-act="native"]');
  if(nativeBtn) nativeBtn.onclick = async ()=>{
    closeShareMenu();
    try{ await navigator.share({ title:'DLCritic', text, url }); }catch(e){}
  };
  menu.querySelector('[data-act="copy"]').onclick = async ()=>{
    closeShareMenu();
    try{ await navigator.clipboard.writeText(text+' '+url); toast(t('share_copied')); }
    catch(e){ toast(t('share_copy_failed')); }
  };
  menu.querySelector('[data-act="whatsapp"]').onclick = ()=>{
    closeShareMenu();
    window.open('https://wa.me/?text='+encodeURIComponent(text+' '+url), '_blank', 'noopener');
  };
  menu.querySelector('[data-act="x"]').onclick = ()=>{
    closeShareMenu();
    window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(text)+'&url='+encodeURIComponent(url), '_blank', 'noopener');
  };
  menu.querySelector('[data-act="card"]').onclick = ()=>{
    closeShareMenu();
    openShareCardModal(rv, game);
  };
  setTimeout(()=>{
    document.addEventListener('click', shareMenuOutsideClick, true);
    window.addEventListener('scroll', closeShareMenu, true);
  }, 0);
}

/* ---------- tarjeta de imagen para compartir ---------- */
// Esta sección dibuja, a mano con la API de <canvas>, una tarjeta tipo
// "story" (1080x1920, formato vertical de Instagram/WhatsApp) con la
// reseña de un juego, para descargar o compartir como imagen. drawShareCard
// es la función principal; las demás son helpers que usa.
// Cómo probar cambios acá: abrí el modal de compartir (ícono de link en
// una reseña) -> "Crear tarjeta", cambiá el color de fondo para forzar un
// redibujado y ver el resultado al toque.

// Carga una URL como HTMLImageElement, para poder dibujarla en el canvas. Nunca rechaza la promise: si falla, resuelve null (y quien llama dibuja un color de fondo en su lugar).
function loadImageForCanvas(url){
  return new Promise(resolve=>{
    if(!url){ resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = ()=> resolve(null);
    img.src = url;
  });
}
// Consigue la URL de portada a usar en la tarjeta (la del admin si la
// tiene, si no la portada real cacheada). Si la imagen es de OTRO dominio,
// la pasa por el proxy del propio servidor (/api/image-proxy) porque
// <canvas> no puede leer píxeles de una imagen externa sin CORS
// (dibujarla se ve bien, pero canvas.toBlob()/toDataURL() tira error de
// "tainted canvas" — por eso el proxy).
async function resolveCardCoverUrl(game){
  let url = game.cardCoverUrl || game.coverUrl || null;
  if(!url){ try{ url = await fetchCover(game.title); }catch(e){ url = null; } }
  if(!url) return null;
  try{
    const host = new URL(url, location.origin).hostname;
    if(host !== location.hostname) return '/api/image-proxy?url=' + encodeURIComponent(url);
  }catch(e){}
  return url;
}
// Path de un rectángulo con esquinas redondeadas (canvas no tiene un roundRect universal en todos los navegadores todavía, así que se arma a mano con arcTo).
function roundedRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
// Dibuja una imagen dentro de un rectángulo tipo "object-fit: cover" (recorta el sobrante en vez de deformar la imagen).
function drawCoverFit(ctx, img, x, y, w, h){
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx, sy, sw, sh;
  if(imgRatio > boxRatio){ sh = img.height; sw = sh * boxRatio; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / boxRatio; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
// Como <canvas> no hace word-wrap solo, esto parte un texto en líneas que
// entren en maxWidth (según el font ya seteado en ctx), hasta maxLines
// líneas — si sobra texto después de esa última línea, la corta y le pone
// "…" (recortando de a un carácter hasta que entre, con el "…" incluido).
function wrapCardText(ctx, text, maxWidth, maxLines){
  const words = (text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  let i = 0;
  while(i < words.length){
    const word = words[i];
    const test = line ? line+' '+word : word;
    if(ctx.measureText(test).width <= maxWidth){ line = test; i++; }
    else if(!line){ line = word; i++; }
    else { lines.push(line); line = ''; if(lines.length===maxLines) break; }
  }
  const hasMore = i < words.length;
  if(line && lines.length < maxLines) lines.push(line);
  if(lines.length===maxLines && hasMore){
    let last = lines[maxLines-1];
    while(last.length>1 && ctx.measureText(last+'…').width>maxWidth) last = last.slice(0,-1).trimEnd();
    lines[maxLines-1] = last+'…';
  }
  return lines;
}
// <canvas> no espera solo a que las fuentes @font-face terminen de cargar
// (a diferencia del HTML normal) — si no se hace esto, la primera vez que
// se dibuja la tarjeta puede salir con la tipografía de respaldo del
// sistema en vez de Bungee/Space Grotesk/Space Mono. Esto fuerza la carga
// de cada combinación peso+tamaño+fuente que drawShareCard va a usar.
async function loadCardFonts(){
  const specs = [
    "700 42px Bungee", "700 58px Bungee", "700 124px Bungee", "700 220px Bungee",
    "700 34px 'Space Grotesk'", "700 36px 'Space Grotesk'", "500 32px 'Space Grotesk'",
    "500 30px 'Space Mono'", "400 26px 'Space Mono'", "400 22px 'Space Mono'",
  ];
  try{ await Promise.all(specs.map(f=> document.fonts.load(f))); }catch(e){}
}
// LA función que arma la tarjeta entera, de arriba a abajo: fondo -> logo
// "DLCritic" -> portada (cuadrada, con fallback a la inicial del título si
// no hay imagen) -> título del juego -> género/año -> nota grande -> (si
// hay) el texto de la reseña -> footer con avatar/usuario/nivel/marca de
// agua. Todas las coordenadas son manuales — si querés mover algo, `y` es
// la variable que va acumulando la posición vertical a medida que se
// dibuja cada bloque de arriba hacia abajo.
async function drawShareCard(canvas, rv, game, bgOption){
  const W = 1080, H = 1920, PAD = 80;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  await loadCardFonts();

  ctx.clearRect(0,0,W,H);
  if(bgOption.type==='solid'){ ctx.fillStyle = bgOption.colors[0]; }
  else {
    const g = ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0, bgOption.colors[0]);
    g.addColorStop(1, bgOption.colors[1]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0,0,W,H);

  const contentW = W - PAD*2;
  const textShadow = ()=>{ ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=18; ctx.shadowOffsetY=3; };
  const noShadow = ()=>{ ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0; };

  let y = 60;
  textShadow();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = "700 42px Bungee";
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('DLCritic', W/2, y+34);
  y += 130;

  noShadow();
  const coverSize = contentW;
  const coverX = PAD, coverY = y;
  ctx.save();
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 36);
  ctx.clip();
  ctx.fillStyle = placeholderColor(game.title||'?');
  ctx.fillRect(coverX, coverY, coverSize, coverSize);
  const coverUrl = await resolveCardCoverUrl(game);
  const img = await loadImageForCanvas(coverUrl);
  if(img){
    drawCoverFit(ctx, img, coverX, coverY, coverSize, coverSize);
  } else {
    textShadow();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = "700 220px Bungee";
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText((game.title||'?').trim().charAt(0).toUpperCase(), coverX+coverSize/2, coverY+coverSize/2+10);
    noShadow();
  }
  ctx.restore();
  y = coverY + coverSize + 50;

  textShadow();
  ctx.fillStyle = '#fff';
  ctx.font = "700 58px Bungee";
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const titleLines = wrapCardText(ctx, game.title||'', contentW, 2);
  titleLines.forEach(line=>{ y += 60; ctx.fillText(line, W/2, y); });
  y += 36;

  ctx.font = "500 30px 'Space Mono'";
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  const meta = [genreLabelList(game), game.releaseYear ? String(game.releaseYear) : ''].filter(Boolean).join('   ·   ');
  if(meta) ctx.fillText(meta, W/2, y+26);
  y += 80;

  ctx.fillStyle = '#fff';
  const ratingText = rv.rating!=null ? `${rv.rating}/10` : t('card_no_rating');
  // "X/10" siempre entra al tamaño grande, pero "Sin calificación"/"Not rated"
  // puede ser mucho más largo — se reduce el tamaño hasta que entre en el ancho.
  let ratingSize = 124;
  ctx.font = `700 ${ratingSize}px Bungee`;
  while(ratingSize > 44 && ctx.measureText(ratingText).width > contentW - 40){
    ratingSize -= 4;
    ctx.font = `700 ${ratingSize}px Bungee`;
  }
  ctx.fillText(ratingText, W/2, y + ratingSize*0.84);
  y += ratingSize + 60;

  // El footer (avatar + usuario + nivel + marca de agua) siempre ocupa el mismo
  // espacio fijo desde abajo: el texto de la reseña nunca debe dibujarse encima.
  const FOOTER_RESERVED = 260;
  const bottomBoundary = H - FOOTER_RESERVED;
  if(rv.text && rv.text.trim()){
    ctx.font = "500 32px 'Space Grotesk'";
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const lineHeight = 40;
    const available = bottomBoundary - y - 16;
    // Sin mínimo forzado: si no entra ni una línea, se omite el bloque entero
    // en vez de dibujar encima del footer.
    const maxLines = Math.max(0, Math.min(6, Math.floor(available / lineHeight)));
    if(maxLines > 0){
      const quoted = `"${rv.text.trim()}"`;
      const lines = wrapCardText(ctx, quoted, contentW - 40, maxLines);
      y += 16;
      lines.forEach(line=>{ y += lineHeight; ctx.fillText(line, W/2, y); });
    }
  }

  noShadow();
  const avatarR = 42;
  const footerY = bottomBoundary + 20 + avatarR;
  ctx.beginPath();
  ctx.arc(W/2, footerY, avatarR, 0, Math.PI*2);
  ctx.fillStyle = placeholderColor(rv.username||'?');
  ctx.fill();
  textShadow();
  ctx.fillStyle = '#fff';
  ctx.font = "700 36px 'Space Grotesk'";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((rv.username||'?').trim().charAt(0).toUpperCase(), W/2, footerY+3);

  ctx.textBaseline = 'alphabetic';
  ctx.font = "700 34px 'Space Grotesk'";
  ctx.fillStyle = '#fff';
  ctx.fillText(rv.username||'', W/2, footerY + avatarR + 50);

  const lvl = computeLevel(state.reviews.filter(r=>r.username===rv.username).length).current;
  ctx.font = "400 26px 'Space Mono'";
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(t(lvl.nameKey), W/2, footerY + avatarR + 92);

  ctx.font = "400 22px 'Space Mono'";
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('dlcritic', W/2, footerY + avatarR + 128);
  noShadow();
}
// Modal "Crear tarjeta": muestra el <canvas> de drawShareCard en vivo,
// deja elegir el color de fondo (redibuja al cambiar), y ofrece
// descargarla como PNG o (si el navegador lo soporta) compartirla como
// archivo directamente.
function openShareCardModal(rv, game){
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  let selectedBg = CARD_BG_OPTIONS[0];
  overlay.innerHTML = `
    <div class="confirm-box card-modal">
      <h3>${esc(t('card_modal_title'))}</h3>
      <canvas id="shareCardCanvas" width="1080" height="1920" style="width:100%;max-width:270px;aspect-ratio:1080/1920;"></canvas>
      <label style="display:block; font-size:12px; color:var(--ink-soft); margin-bottom:8px;">${esc(t('card_choose_bg'))}</label>
      <div class="card-swatches" id="cardSwatches">
        ${CARD_BG_OPTIONS.map(bg=>`<button type="button" class="card-swatch${bg===selectedBg?' active':''}" data-bg="${bg.id}" style="background:${bg.type==='solid'?bg.colors[0]:`linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})`};"></button>`).join('')}
      </div>
      <div class="error" id="cardError" hidden></div>
      <div class="confirm-actions">
        <button class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
        <button class="btn gold" data-act="download">${esc(t('card_download_btn'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const canvas = document.getElementById('shareCardCanvas');

  function redraw(){
    drawShareCard(canvas, rv, game, selectedBg).catch(()=>{
      const errEl = document.getElementById('cardError');
      if(errEl){ errEl.textContent = t('card_render_error'); errEl.hidden = false; }
    });
  }
  redraw();

  overlay.querySelectorAll('.card-swatch').forEach(btn=>{
    btn.onclick = ()=>{
      selectedBg = CARD_BG_OPTIONS.find(b=>b.id===btn.dataset.bg) || CARD_BG_OPTIONS[0];
      overlay.querySelectorAll('.card-swatch').forEach(b=> b.classList.toggle('active', b===btn));
      redraw();
    };
  });

  function onKey(e){ if(e.key==='Escape') cleanup(); }
  function cleanup(){ overlay.remove(); document.removeEventListener('keydown', onKey); }
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cleanup(); });
  overlay.querySelector('[data-act="cancel"]').onclick = cleanup;
  overlay.querySelector('[data-act="download"]').onclick = ()=>{
    canvas.toBlob(blob=>{
      if(!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dlcritic-'+(game.id||'review')+'.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  };

  if(navigator.canShare){
    (async ()=>{
      let supportsFileShare = false;
      try{
        const testFile = new File([new Uint8Array([0])], 'test.png', {type:'image/png'});
        supportsFileShare = navigator.canShare({ files:[testFile] });
      }catch(e){}
      if(!supportsFileShare) return;
      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn-ghost';
      shareBtn.textContent = t('card_share_btn');
      shareBtn.onclick = ()=>{
        canvas.toBlob(async blob=>{
          if(!blob) return;
          try{
            const file = new File([blob], 'dlcritic-'+(game.id||'review')+'.png', {type:'image/png'});
            await navigator.share({ files:[file], title:'DLCritic', text: buildShareText(rv, game) });
          }catch(e){}
        }, 'image/png');
      };
      overlay.querySelector('.confirm-actions').appendChild(shareBtn);
    })();
  }

  document.addEventListener('keydown', onKey);
}

/* ---------- card de una reseña + un par de helpers de UI genéricos ---------- */
// LA card de una reseña: se usa en la ficha de un juego, en el perfil (tus
// reseñas), y en cualquier otro listado de reseñas de la app. Arma botón
// "te sirvió" (si no es tuya), botón compartir, botón borrar (si es tuya),
// medallita de "primera reseña", chips de plataforma, y el gauge de nota.
function reviewCard(rv){
  const game = findGame(rv.gameId) || {title:'(juego eliminado)', genre:'Otro', platforms:[]};
  const div=document.createElement('div');
  div.className='card reviewcard';
  const mine = state.user && state.user.username===rv.username;
  const authorLevel = computeLevel(state.reviews.filter(r=>r.username===rv.username).length).current;
  const helpfulBy = rv.helpfulBy || [];
  const voted = state.user && helpfulBy.includes(state.user.username);
  const hasText = rv.text && rv.text.trim().length>0;
  div.innerHTML = `
    <div class="rc-top">
      <div>
        <div class="rc-game">${esc(game.title)}${isFirstReview(rv)? ` <span class="first-badge">${t('first_review_badge')}</span>` : ''}</div>
        <div class="rc-meta">${authorLevel.icon} <span class="rc-author" data-username="${esc(rv.username)}">${esc(rv.username)}</span> · ${fmtDate(rv.date)}</div>
        ${rv.platforms && rv.platforms.length? `<div class="platbadges" style="margin-top:6px;">${platBadges(rv.platforms)}</div>` : ''}
      </div>
      <div class="rc-genre ${genreTint(primaryGenre(game))}" title="${esc(genreLabelList(game))}">${GENRE_EMOJI[primaryGenre(game)]||ICONS.gamepad}</div>
    </div>
    ${hasText? `<p class="rc-text">${esc(rv.text)}</p>` : `<p class="rc-text" style="color:var(--ink-soft); font-style:italic;">${esc(t('no_written_review'))}</p>`}
    ${!mine? `<div class="helpful-row">
      <button class="helpful-btn ${voted?'voted':''}" data-helpful="${rv.id}">${voted? t('helpful_yes') : t('helpful_ask')}</button>
      ${helpfulBy.length>0? `<span class="helpful-count">${helpfulBy.length} ${helpfulBy.length===1? t('helpful_count') : t('helpful_count_pl')}</span>` : ''}
    </div>` : ''}
    <div class="cardfoot">
      <div id="gauge-${rv.id}">${rv.rating==null? `<span class="no-rating-tag">${t('no_rating_yet')}</span>` : ''}</div>
      <div class="rc-actions">
        <button class="icon-btn" data-share="${rv.id}" title="${esc(t('share_btn'))}">${ICONS.link}</button>
        ${mine? `<button class="icon-btn" data-del="${rv.id}">${t('delete_btn')}</button>` : ''}
      </div>
    </div>
  `;
  if(rv.rating!=null) renderGauge(div.querySelector(`#gauge-${rv.id}`), rv.rating);
  div.querySelector('[data-share]').onclick=(e)=> openShareMenu(e.currentTarget, rv, game);
  div.querySelector('.rc-author').onclick=()=>{ state.profileUsername = rv.username; goView('profile'); };
  if(mine){
    div.querySelector('[data-del]').onclick=()=> deleteReview(rv.id);
  } else {
    const hb = div.querySelector('[data-helpful]');
    if(hb) hb.onclick = ()=> toggleHelpful(rv.id);
  }
  return div;
}
// HTML del "estado vacío" genérico (ícono + título + texto) que se usa en TODA la app cuando una lista/grilla no tiene nada para mostrar. `title` y `sub` van sin escapar porque siempre se les pasa el resultado de t(), nunca texto de usuario.
function emptyState(glyph,title,sub){ return `<div class="empty"><div class="glyph">${glyph}</div><strong>${title}</strong><p>${sub}</p></div>`; }
// Engancha el botoncito "✕" que aparece dentro de un input de búsqueda para vaciarlo. Se puede llamar varias veces sobre el mismo input sin duplicar el listener (usa el atributo data-clear-wired como guarda).
function wireSearchClear(inputId){
  const input = document.getElementById(inputId);
  const btn = document.querySelector(`.search-clear[data-clears="${inputId}"]`);
  if(!input || !btn) return;
  const sync = ()=>{ btn.hidden = input.value.length===0; };
  sync();
  if(!input.dataset.clearWired){
    input.dataset.clearWired='1';
    input.addEventListener('input', sync);
  }
  btn.onclick = ()=>{
    input.value='';
    sync();
    input.dispatchEvent(new Event('input'));
    input.focus();
  };
}

