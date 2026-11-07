/**
 * ARCHIVO 6 de 6 — Pestaña "Buzón" (sugerencias de juegos que mandan los
 * usuarios desde el botón "Sugerir un juego" del footer de la app
 * principal — ver public/js/07-stats-share-modals.js, openSuggestModal —
 * y de personajes desde "Sugerir un personaje" en la sección Personajes,
 * kind==='character' — ver public/js/14-characters.js),
 * y el arranque del panel entero (al final de este archivo).
 *
 * Cada sugerencia tiene un estado: sin leer / leído / archivado. Es sólo
 * organización para el admin, no dispara ninguna acción automática (a
 * diferencia de un juego, una sugerencia nunca se "convierte" sola en un
 * juego del catálogo — si al admin le interesa, la carga a mano en la
 * pestaña Juegos y listo).
 */
/* ---- game suggestions inbox ---- */
// Trae todas las sugerencias y actualiza el numerito de "sin leer" en la pestaña Buzón.
async function loadSuggestions(){
  const { suggestions } = await apiGet('/admin/suggestions');
  state.suggestions = suggestions;
  const unread = suggestions.filter(s=>s.status==='unread').length;
  const badge = document.getElementById('inboxUnreadBadge');
  badge.textContent = unread;
  badge.hidden = unread===0;
  renderInboxList();
}

document.querySelectorAll('#inboxFilter .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#inboxFilter .chip').forEach(x=> x.classList.toggle('active', x===c));
    state.inboxFilter = c.dataset.status;
    renderInboxList();
  });
});

document.querySelectorAll('#inboxKindFilter .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#inboxKindFilter .chip').forEach(x=> x.classList.toggle('active', x===c));
    state.inboxKind = c.dataset.kind;
    renderInboxList();
  });
});

// Formatea la fecha de una sugerencia ("04 sept 2026"). Con try/catch por las dudas de que venga una fecha rara — si falla, muestra el string tal cual en vez de romper toda la lista.
function fmtSuggestionDate(iso){
  try{ return new Date(iso).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' }); }
  catch(e){ return iso; }
}

// Pinta la lista de sugerencias (filtrada por estado), cada una con sus botones de marcar leído/no-leído/archivar y borrar.
function renderInboxList(){
  const list = state.suggestions.filter(s=> (state.inboxFilter==='all' || s.status===state.inboxFilter) && (state.inboxKind==='all' || s.kind===state.inboxKind));
  document.getElementById('inboxCount').textContent = list.length;
  const wrap = document.getElementById('inboxList');
  if(list.length===0){ wrap.innerHTML = `<p class="empty-row">No hay sugerencias aquí todavía.</p>`; return; }  wrap.innerHTML = list.map(s=>{
    const metaParts = [];
    if(s.kind==='character'){
      if(s.relatedGame) metaParts.push(s.relatedGame);
      if(s.categories && s.categories.length) metaParts.push(charCategoriesLabel(s.categories));
    }
    if(s.platforms && s.platforms.length) metaParts.push(s.platforms.map(p=> (PLATFORMS.find(x=>x.key===p)||{name:p}).name).join(', '));
    if(s.genre) metaParts.push(s.genre);
    if(s.releaseYear) metaParts.push(String(s.releaseYear));
    const statusLabel = { unread:'Sin leer', read:'Leído', archived:'Archivado' }[s.status] || s.status;
    return `
    <div class="suggestion-card kind-${esc(s.kind)} ${s.status==='read'?'is-read':''} ${s.status==='archived'?'is-archived':''}">
      <div class="suggestion-head">
        <div class="suggestion-title"><span class="kind-badge ${esc(s.kind)}">${s.kind==='character'?'Personaje':'Juego'}</span> ${esc(s.title)}</div>
        <span class="status-badge ${esc(s.status)}">${esc(statusLabel)}</span>
      </div>
      ${metaParts.length? `<div class="suggestion-meta">${esc(metaParts.join(' · '))}</div>` : ''}
      ${s.note? `<div class="suggestion-note">${esc(s.note)}</div>` : ''}
      <div class="suggestion-foot">
        <span class="suggestion-sub">${esc(s.submittedBy || 'Anónimo')} · ${fmtSuggestionDate(s.createdAt)}</span>
        <div class="row-actions">
          ${s.status==='unread'
            ? `<button class="icon-btn icon-edit" data-mark="read" data-id="${esc(s.id)}" title="Marcar como leído">${ICON_SVG.mailOpen}</button>`
            : `<button class="icon-btn" data-mark="unread" data-id="${esc(s.id)}" title="Marcar como no leído">${ICON_SVG.mail}</button>`}
          ${s.status!=='archived'
            ? `<button class="icon-btn" data-mark="archived" data-id="${esc(s.id)}" title="Archivar">${ICON_SVG.archive}</button>`
            : `<button class="icon-btn icon-edit" data-mark="read" data-id="${esc(s.id)}" title="Desarchivar">${ICON_SVG.mailOpen}</button>`}
          <button class="icon-btn icon-danger" data-del-suggestion="${esc(s.id)}" title="Borrar">${ICON_SVG.trash}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-mark]').forEach(b=> b.onclick = async ()=>{
    await apiPut('/admin/suggestions/'+encodeURIComponent(b.dataset.id), { status: b.dataset.mark });
    await loadSuggestions();
  });
  wrap.querySelectorAll('[data-del-suggestion]').forEach(b=> b.onclick = async ()=>{
    if(!confirm('¿Borrar esta sugerencia?')) return;
    await apiDelete('/admin/suggestions/'+encodeURIComponent(b.dataset.delSuggestion));
    await loadSuggestions();
  });
}

/* ---- arranque del panel ---- */
// Si ya había una sesión (cookie válida), entra directo; si no, afterLogin() manda a la pantalla de login.
(async function init(){
  try{
    const { user } = await apiGet('/auth/me');
    state.user = user;
  }catch(e){ state.user = null; }
  await afterLogin();
})();
