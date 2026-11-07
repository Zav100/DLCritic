/**
 * ARCHIVO 7 de 7 — Pestaña "Personajes": el CRUD de los personajes que se
 * pueden calificar por separado de los juegos (calificación de personajes
 * icónicos/protagonistas). Mismo patrón general que 04-date-events.js
 * (formulario + tabla), más la subida de imagen con preview que ya usa
 * 03-games-form.js — pero aquí un personaje puede pertenecer a VARIOS
 * juegos a la vez (state.characterGameIds, una lista de ids que se arma
 * con el botón "+ Agregar" y se muestra como chips con su ✕ para sacarlos),
 * y la portada de la ficha (el banner de fondo) se elige aparte: o la
 * portada de alguno de esos juegos, o una imagen especial subida a mano.
 */
/* ---- personajes ---- */

document.getElementById('charPhotoPreview').innerHTML = ICON_SVG.gamepad;
document.getElementById('charBannerPreview').innerHTML = ICON_SVG.gamepad;

// Mismas claves que CHARACTER_CATEGORIES del servidor (index.js / admin.js) y CHAR_CATEGORIES de la app principal.
const CHAR_CATEGORY_LABELS = { protagonist:'Protagonista', coprotagonist:'Co-protagonista', villain:'Villano', ally:'Aliado', secondary:'Secundario' };
const charCategoryGrid = document.getElementById('charCategoryGrid');
charCategoryGrid.innerHTML = Object.entries(CHAR_CATEGORY_LABELS).map(([k,v])=>`<label class="genre-chip"><input type="checkbox" data-category="${k}"> ${v}</label>`).join('');
const charCategoriesLabel = cats => (cats||[]).map(k=>CHAR_CATEGORY_LABELS[k]||k).join(', ');

document.getElementById('c-photo-file').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ document.getElementById('charPhotoPreview').innerHTML = `<img src="${reader.result}">`; };
  reader.readAsDataURL(file);
});
// Subir una portada especial es "manual": mientras haya un archivo elegido aquí, gana por sobre el <select> de abajo (se aclara en renderCharBannerGameSelect, que se deshabilita solo si hay preview de portada propia).
document.getElementById('c-banner-file').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ document.getElementById('charBannerPreview').innerHTML = `<img src="${reader.result}">`; };
  reader.readAsDataURL(file);
});

// Trae todos los personajes (incluye ocultos) y llena el <datalist> de juegos del formulario.
async function loadCharacters(){
  const { characters } = await apiGet('/admin/characters');
  state.characters = characters;
  renderCharactersTable();
  const list = document.getElementById('charGameList');
  if(list) list.innerHTML = state.games.map(g=>`<option value="${esc(g.title)}">`).join('');
}

/* ---- chips de "a qué juegos pertenece" ---- */
// Pinta los chips de juegos ya agregados (state.characterGameIds) y su ✕ para sacarlos. También se llama cada vez que la lista cambia, para refrescar el <select> de portada (solo puede ofrecer portadas de juegos que siguen en la lista).
function renderCharGameChips(){
  const wrap = document.getElementById('charGamesChips');
  if(state.characterGameIds.length===0){
    wrap.innerHTML = `<span class="hint" style="margin:0;">Sin juegos agregados todavía.</span>`;
  } else {
    wrap.innerHTML = state.characterGameIds.map(id=>{
      const g = state.games.find(x=>x.id===id);
      return `<button type="button" class="chip active" data-remove-game="${esc(id)}">${esc(g? g.title : id)} ✕</button>`;
    }).join('');
    wrap.querySelectorAll('[data-remove-game]').forEach(b=> b.onclick = ()=>{
      state.characterGameIds = state.characterGameIds.filter(id=> id!==b.dataset.removeGame);
      if(state.characterBannerGameId===b.dataset.removeGame) state.characterBannerGameId = null;
      renderCharGameChips();
      renderCharBannerGameSelect();
    });
  }
  renderCharBannerGameSelect();
}
document.getElementById('charAddGameBtn').addEventListener('click', ()=>{
  const input = document.getElementById('c-game');
  const title = input.value.trim();
  if(!title) return;
  const game = state.games.find(g=>g.title.toLowerCase()===title.toLowerCase());
  if(!game){ return; } // typo o no existe todavía — no agrega nada en silencio, el admin ve que el chip no aparece
  if(!state.characterGameIds.includes(game.id)) state.characterGameIds.push(game.id);
  input.value = '';
  renderCharGameChips();
});
// Enter en el buscador de juego hace lo mismo que tocar "+ Agregar" (más rápido que ir al mouse).
document.getElementById('c-game').addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('charAddGameBtn').click(); }
});

/* ---- portada de la ficha: portada de uno de los juegos de arriba, o una especial ---- */
function renderCharBannerGameSelect(){
  const sel = document.getElementById('c-banner-game');
  const current = state.characterBannerGameId || '';
  sel.innerHTML = `<option value="">Sin portada de juego</option>` +
    state.characterGameIds.map(id=>{
      const g = state.games.find(x=>x.id===id);
      return `<option value="${esc(id)}">${esc(g? g.title : id)}</option>`;
    }).join('');
  sel.value = state.characterGameIds.includes(current) ? current : '';
}
document.getElementById('c-banner-game').addEventListener('change', (e)=>{
  state.characterBannerGameId = e.target.value || null;
});

// Vuelve el formulario a "Nuevo personaje" vacío.
function resetCharacterForm(){
  state.editingCharacterId = null;
  state.characterPhotoUrl = null;
  state.characterBannerUrl = null;
  state.characterBannerGameId = null;
  state.characterGameIds = [];
  document.getElementById('charFormTitle').innerHTML = iconLabel('plus', 'Nuevo personaje');
  document.getElementById('charSubmitBtn').textContent = 'Guardar personaje';
  document.getElementById('charCancelBtn').hidden = true;
  document.getElementById('characterForm').reset();
  document.getElementById('charPhotoPreview').innerHTML = ICON_SVG.gamepad;
  document.getElementById('charBannerPreview').innerHTML = ICON_SVG.gamepad;
  document.getElementById('charFormError').hidden = true;
  renderCharGameChips();
}
document.getElementById('charCancelBtn').onclick = resetCharacterForm;

// Llena el formulario con un personaje existente para editarlo.
function fillCharacterFormForEdit(c){
  state.editingCharacterId = c.id;
  state.characterPhotoUrl = c.photoUrl || null;
  state.characterBannerUrl = c.bannerUrl || null;
  state.characterBannerGameId = c.bannerGameId || null;
  state.characterGameIds = (c.gameIds && c.gameIds.length) ? c.gameIds.slice() : (c.gameId ? [c.gameId] : []);
  document.getElementById('charFormTitle').innerHTML = iconLabel('edit', 'Editar: ' + c.name);
  document.getElementById('charSubmitBtn').textContent = 'Guardar cambios';
  document.getElementById('charCancelBtn').hidden = false;
  document.getElementById('c-name').value = c.name || '';
  charCategoryGrid.querySelectorAll('[data-category]').forEach(cb=>{ cb.checked = (c.categories||[]).includes(cb.dataset.category); });
  document.getElementById('c-game').value = '';
  document.getElementById('c-description').value = c.description || '';
  document.getElementById('charPhotoPreview').innerHTML = c.photoUrl ? `<img src="${esc(c.photoUrl)}">` : ICON_SVG.gamepad;
  document.getElementById('charBannerPreview').innerHTML = c.bannerUrl ? `<img src="${esc(c.bannerUrl)}">` : ICON_SVG.gamepad;
  document.getElementById('c-hidden').checked = !!c.hidden;
  renderCharGameChips();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// Guardar personaje (alta o edición): sube foto y/o portada especial si se
// tocaron esos inputs, arma la lista de juegos y la portada elegida, y pega
// a POST o PUT según corresponda.
document.getElementById('characterForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errEl = document.getElementById('charFormError');
  errEl.hidden = true;
  const submitBtn = document.getElementById('charSubmitBtn');
  const name = document.getElementById('c-name').value.trim();
  if(name.length < 2){ errEl.textContent = 'El nombre es obligatorio.'; errEl.hidden = false; return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';
  try{
    const photoUrl = await uploadImageIfNeeded('c-photo-file', state.characterPhotoUrl);
    const bannerUrl = await uploadImageIfNeeded('c-banner-file', state.characterBannerUrl);
    const payload = {
      name, gameIds: state.characterGameIds,
      categories: [...charCategoryGrid.querySelectorAll('[data-category]:checked')].map(cb=>cb.dataset.category),
      bannerGameId: bannerUrl ? null : state.characterBannerGameId, // una portada especial gana por sobre la de un juego
      bannerUrl,
      description: document.getElementById('c-description').value.trim(),
      photoUrl, hidden: document.getElementById('c-hidden').checked,
    };
    if(state.editingCharacterId) await apiPut('/admin/characters/'+encodeURIComponent(state.editingCharacterId), payload);
    else await apiPost('/admin/characters', payload);
    resetCharacterForm();
    await loadCharacters();
  }catch(e2){
    errEl.textContent = 'No se pudo guardar el personaje.';
    errEl.hidden = false;
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = state.editingCharacterId ? 'Guardar cambios' : 'Guardar personaje';
  }
});

// Pinta la tabla de personajes (foto, nombre, juegos asociados, estado, editar/ocultar/borrar).
function renderCharactersTable(){
  document.getElementById('charCount').textContent = state.characters.length;
  const body = document.getElementById('charactersTableBody');
  if(state.characters.length===0){
    body.innerHTML = `<tr><td colspan="6" class="empty-row">Todavía no hay personajes cargados.</td></tr>`;
    return;
  }
  body.innerHTML = state.characters.map(c=>{
    const gameIds = (c.gameIds && c.gameIds.length) ? c.gameIds : (c.gameId ? [c.gameId] : []);
    const titles = gameIds.map(id=> (state.games.find(g=>g.id===id)||{}).title).filter(Boolean);
    return `
    <tr class="${c.hidden?'row-hidden':''}">
      <td>${c.photoUrl? `<img class="row-cover" style="border-radius:50%;" src="${esc(c.photoUrl)}">` : `<div class="row-cover row-cover-empty" style="border-radius:50%;">${ICON_SVG.gamepad}</div>`}</td>
      <td>${esc(c.name)}</td>
      <td>${esc(charCategoriesLabel(c.categories) || '—')}</td>
      <td>${titles.length? esc(titles.join(', ')) : '—'}</td>
      <td>${c.hidden? '<span class="tag tag-hidden">Oculto</span>' : ''}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="icon-btn ${c.hidden?'state-hidden':''}" data-toggle-char-hidden="${esc(c.id)}" title="${c.hidden?'Mostrar en la página':'Ocultar de la página'}">${c.hidden?ICON_SVG.eyeOff:ICON_SVG.eye}</button>
        <button class="icon-btn icon-edit" data-edit-char="${esc(c.id)}" title="Editar">${ICON_SVG.edit}</button>
        <button class="icon-btn icon-danger" data-del-char="${esc(c.id)}" title="Borrar">${ICON_SVG.trash}</button>
      </div></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-edit-char]').forEach(b=> b.onclick = ()=>{
    const c = state.characters.find(x=>x.id===b.dataset.editChar);
    if(c) fillCharacterFormForEdit(c);
  });
  body.querySelectorAll('[data-del-char]').forEach(b=> b.onclick = async ()=>{
    const c = state.characters.find(x=>x.id===b.dataset.delChar);
    if(!c) return;
    if(!confirm(`¿Borrar a "${c.name}"? Esta acción no se puede deshacer.`)) return;
    await apiDelete('/admin/characters/'+encodeURIComponent(c.id));
    await loadCharacters();
  });
  body.querySelectorAll('[data-toggle-char-hidden]').forEach(b=> b.onclick = async ()=>{
    const c = state.characters.find(x=>x.id===b.dataset.toggleCharHidden);
    if(!c) return;
    await apiPut('/admin/characters/'+encodeURIComponent(c.id), { hidden: !c.hidden });
    await loadCharacters();
  });
}

renderCharGameChips();
