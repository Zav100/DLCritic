/**
 * ARCHIVO 3 de 6 — Pestaña "Juegos": el formulario de alta/edición y la
 * tabla con el catálogo completo (buscador, filtro de visibilidad, orden,
 * y las acciones rápidas de cada fila: ocultar, destacar, editar, borrar).
 * Es el archivo más largo del panel porque el formulario de un juego
 * tiene bastantes campos (portada normal + portada cuadrada para la
 * tarjeta de compartir, géneros múltiples, 5 plataformas con su link
 * opcional cada una, destacar en "Juegos nuevos", ocultar de la página).
 */
/* ---- form setup ---- */
document.getElementById('coverPreview').innerHTML = ICON_SVG.gamepad;
const genreGrid = document.getElementById('genreGrid');
genreGrid.innerHTML = GENRES.map(g=>`<label class="genre-chip"><input type="checkbox" data-genre="${esc(g)}"> ${esc(g)}</label>`).join('');

const platformGrid = document.getElementById('platformGrid');
platformGrid.innerHTML = PLATFORMS.map(p=>`
  <div class="platform-row">
    <label><input type="checkbox" data-plat="${p.key}"> ${esc(p.name)}</label>
    <input type="url" placeholder="Link directo al producto (opcional)" data-plat-url="${p.key}" disabled>
  </div>
`).join('');
platformGrid.querySelectorAll('[data-plat]').forEach(cb=>{
  cb.addEventListener('change', ()=>{
    platformGrid.querySelector(`[data-plat-url="${cb.dataset.plat}"]`).disabled = !cb.checked;
  });
});

document.getElementById('f-cover-file').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ document.getElementById('coverPreview').innerHTML = `<img src="${reader.result}">`; };
  reader.readAsDataURL(file);
});
document.getElementById('f-card-cover-file').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ document.getElementById('cardCoverPreview').innerHTML = `<img src="${reader.result}">`; };
  reader.readAsDataURL(file);
});

// Vuelve el formulario al estado "Nuevo juego" (vacío), saliendo del modo edición si estaba editando uno.
function resetForm(){
  state.editingId = null;
  state.coverUrl = null;
  state.cardCoverUrl = null;
  document.getElementById('formTitle').innerHTML = iconLabel('plus', 'Nuevo juego');
  document.getElementById('submitBtn').textContent = 'Guardar juego';
  document.getElementById('cancelEditBtn').hidden = true;
  document.getElementById('gameForm').reset();
  document.getElementById('coverPreview').innerHTML = ICON_SVG.gamepad;
  document.getElementById('cardCoverPreview').innerHTML = ICON_SVG.gamepad;
  genreGrid.querySelectorAll('[data-genre]').forEach(cb=>{ cb.checked = false; });
  platformGrid.querySelectorAll('[data-plat-url]').forEach(i=>{ i.disabled = true; i.value=''; });
  document.getElementById('newReleaseDateField').hidden = true;
  document.getElementById('formError').hidden = true;
}
document.getElementById('cancelEditBtn').onclick = resetForm;

// Llena el formulario entero con los datos de un juego existente, para editarlo (botón "✎" de la tabla). Scrollea arriba de todo para que se vea el formulario.
function fillFormForEdit(g){
  state.editingId = g.id;
  state.coverUrl = g.coverUrl || null;
  state.cardCoverUrl = g.cardCoverUrl || null;
  document.getElementById('formTitle').innerHTML = iconLabel('edit', 'Editar: ' + g.title);
  document.getElementById('submitBtn').textContent = 'Guardar cambios';
  document.getElementById('cancelEditBtn').hidden = false;
  document.getElementById('f-title').value = g.title || '';
  const gGenres = (g.genres && g.genres.length) ? g.genres : [g.genre || 'Otro'];
  genreGrid.querySelectorAll('[data-genre]').forEach(cb=>{ cb.checked = gGenres.includes(cb.dataset.genre); });
  document.getElementById('f-developer').value = g.developer || '';
  document.getElementById('f-publisher').value = g.publisher || '';
  document.getElementById('f-year').value = g.releaseYear || '';
  document.getElementById('f-mode').value = g.gameMode || '';
  document.getElementById('f-description').value = g.description || '';
  document.getElementById('coverPreview').innerHTML = g.coverUrl ? `<img src="${esc(g.coverUrl)}">` : ICON_SVG.gamepad;
  document.getElementById('cardCoverPreview').innerHTML = g.cardCoverUrl ? `<img src="${esc(g.cardCoverUrl)}">` : ICON_SVG.gamepad;
  const platforms = g.platforms || [];
  const links = g.storeLinks || {};
  platformGrid.querySelectorAll('[data-plat]').forEach(cb=>{
    cb.checked = platforms.includes(cb.dataset.plat);
    const urlInput = platformGrid.querySelector(`[data-plat-url="${cb.dataset.plat}"]`);
    urlInput.disabled = !cb.checked;
    urlInput.value = links[cb.dataset.plat] || '';
  });
  document.getElementById('f-hidden').checked = !!g.hidden;
  document.getElementById('f-new-release').checked = !!g.isNewRelease;
  document.getElementById('newReleaseDateField').hidden = !g.isNewRelease;
  document.getElementById('f-new-release-date').value = g.newReleaseDate || '';
  window.scrollTo({ top:0, behavior:'smooth' });
}

// Si se eligió un archivo nuevo en el input de imagen, lo sube y devuelve su URL; si no se tocó el input, devuelve la URL que ya tenía (o null, si es un juego nuevo sin portada todavía).
async function uploadImageIfNeeded(inputId, existingUrl){
  const file = document.getElementById(inputId).files[0];
  if(!file) return existingUrl;
  const formData = new FormData();
  formData.append('image', await shrinkImage(file));
  const { url } = await api('/admin/upload', { method:'POST', body: formData, isForm:true });
  return url;
}

// Guardar juego (alta o edición, según state.editingId): valida título y
// al menos un género, sube las imágenes que hayan cambiado, arma el
// payload completo, y pega a POST o PUT según corresponda.
document.getElementById('gameForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errEl = document.getElementById('formError');
  errEl.hidden = true;
  const submitBtn = document.getElementById('submitBtn');
  const title = document.getElementById('f-title').value.trim();
  if(title.length < 2){ errEl.textContent = 'El título es obligatorio.'; errEl.hidden = false; return; }
  const genres = [];
  genreGrid.querySelectorAll('[data-genre]').forEach(cb=>{ if(cb.checked) genres.push(cb.dataset.genre); });
  if(genres.length === 0){ errEl.textContent = 'Elegí al menos un género.'; errEl.hidden = false; return; }

  const platforms = [];
  const storeLinks = {};
  platformGrid.querySelectorAll('[data-plat]').forEach(cb=>{
    if(cb.checked){
      platforms.push(cb.dataset.plat);
      const url = platformGrid.querySelector(`[data-plat-url="${cb.dataset.plat}"]`).value.trim();
      if(url) storeLinks[cb.dataset.plat] = url;
    }
  });

  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';
  try{
    const coverUrl = await uploadImageIfNeeded('f-cover-file', state.coverUrl);
    const cardCoverUrl = await uploadImageIfNeeded('f-card-cover-file', state.cardCoverUrl);
    const isNewRelease = document.getElementById('f-new-release').checked;
    const payload = {
      title, genres,
      developer: document.getElementById('f-developer').value.trim(),
      publisher: document.getElementById('f-publisher').value.trim(),
      releaseYear: document.getElementById('f-year').value ? Number(document.getElementById('f-year').value) : null,
      gameMode: document.getElementById('f-mode').value.trim(),
      description: document.getElementById('f-description').value.trim(),
      platforms, storeLinks, coverUrl, cardCoverUrl,
      hidden: document.getElementById('f-hidden').checked,
      isNewRelease, newReleaseDate: isNewRelease ? (document.getElementById('f-new-release-date').value || null) : null,
    };
    if(state.editingId) await apiPut('/admin/games/'+encodeURIComponent(state.editingId), payload);
    else await apiPost('/admin/games', payload);
    resetForm();
    await loadGames();
  }catch(e2){
    errEl.textContent = 'No se pudo guardar el juego.';
    errEl.hidden = false;
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = state.editingId ? 'Guardar cambios' : 'Guardar juego';
  }
});

/* ---- tabla de juegos: carga, búsqueda/filtro/orden, y acciones rápidas por fila ---- */
// Trae el catálogo completo (incluye ocultos, a diferencia de la API pública) y también llena el <datalist> de autocompletado que usa la pestaña de Fechas para elegir a qué juego atar un evento.
async function loadGames(){
  const { games } = await apiGet('/admin/games');
  state.games = games;
  renderGamesTable();
  const list = document.getElementById('dateGameList');
  if(list) list.innerHTML = games.map(g=>`<option value="${esc(g.title)}">`).join('');
}

document.getElementById('gameSearch').addEventListener('input', (e)=>{
  state.gameSearch = e.target.value.toLowerCase().trim();
  renderGamesTable();
});

document.querySelectorAll('#visibilityFilter .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    state.gameVisFilter = chip.dataset.vis;
    document.querySelectorAll('#visibilityFilter .chip').forEach(c=> c.classList.toggle('active', c===chip));
    renderGamesTable();
  });
});

document.getElementById('gameSortSelect').addEventListener('change', (e)=>{
  state.gameSortMode = e.target.value;
  renderGamesTable();
});

const GAME_SORTS = {
  title: (a,b)=> a.title.localeCompare(b.title),
  newest: (a,b)=> new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a,b)=> new Date(a.createdAt) - new Date(b.createdAt),
};

// Pinta la tabla de juegos según el buscador + filtro de visibilidad + orden actuales, y engancha los 4 botones de acción de cada fila (ocultar/mostrar, destacar/quitar de nuevos, editar, borrar).
function renderGamesTable(){
  document.getElementById('gameCount').textContent = state.games.length;
  const hiddenCount = state.games.filter(g=>g.hidden).length;
  document.getElementById('gameCountBreakdown').textContent =
    `${state.games.length - hiddenCount} visibles en la página · ${hiddenCount} ocultos`;
  const body = document.getElementById('gamesTableBody');
  let filtered = state.gameSearch ? state.games.filter(g=> g.title.toLowerCase().includes(state.gameSearch)) : state.games.slice();
  if(state.gameVisFilter==='visible') filtered = filtered.filter(g=> !g.hidden);
  else if(state.gameVisFilter==='hidden') filtered = filtered.filter(g=> g.hidden);
  filtered.sort(GAME_SORTS[state.gameSortMode] || GAME_SORTS.title);
  if(filtered.length===0){
    body.innerHTML = `<tr><td colspan="6" class="empty-row">${state.games.length===0? 'Todavía no hay juegos.' : 'Sin resultados con estos filtros.'}</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(g=>`
    <tr class="${g.hidden?'row-hidden':''}">
      <td>${g.coverUrl? `<img class="row-cover" src="${esc(g.coverUrl)}">` : `<div class="row-cover row-cover-empty">${ICON_SVG.gamepad}</div>`}</td>
      <td>${esc(g.title)}</td>
      <td>${esc((g.genres && g.genres.length ? g.genres : [g.genre]).join(', '))}</td>
      <td>${g.releaseYear || '—'}</td>
      <td>
        ${g.hidden? '<span class="tag tag-hidden">Oculto</span>' : ''}
        ${g.isNewRelease? '<span class="tag tag-new">Nuevo</span>' : ''}
        ${g.builtin? '<span class="tag tag-builtin">Base</span>' : ''}
      </td>
      <td class="col-actions"><div class="row-actions">
        <button class="icon-btn ${g.hidden?'state-hidden':''}" data-toggle-hidden="${esc(g.id)}" title="${g.hidden?'Mostrar en la página':'Ocultar de la página'}">${g.hidden?ICON_SVG.eyeOff:ICON_SVG.eye}</button>
        <button class="icon-btn ${g.isNewRelease?'state-featured':''}" data-toggle-new="${esc(g.id)}" title="${g.isNewRelease?'Quitar de Juegos nuevos':'Destacar en Juegos nuevos'}">${ICON_SVG.star}</button>
        <button class="icon-btn icon-edit" data-edit="${esc(g.id)}" title="Editar">${ICON_SVG.edit}</button>
        <button class="icon-btn icon-danger" data-del="${esc(g.id)}" title="Borrar">${ICON_SVG.trash}</button>
      </div></td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-edit]').forEach(b=> b.onclick = ()=>{
    const g = state.games.find(x=>x.id===b.dataset.edit);
    if(g) fillFormForEdit(g);
  });
  body.querySelectorAll('[data-del]').forEach(b=> b.onclick = async ()=>{
    const g = state.games.find(x=>x.id===b.dataset.del);
    if(!g) return;
    if(!confirm(`¿Borrar "${g.title}"? Esta acción no se puede deshacer.`)) return;
    await apiDelete('/admin/games/'+encodeURIComponent(g.id));
    await loadGames();
  });
  body.querySelectorAll('[data-toggle-hidden]').forEach(b=> b.onclick = async ()=>{
    const g = state.games.find(x=>x.id===b.dataset.toggleHidden);
    if(!g) return;
    await apiPut('/admin/games/'+encodeURIComponent(g.id), { hidden: !g.hidden });
    await loadGames();
  });
  body.querySelectorAll('[data-toggle-new]').forEach(b=> b.onclick = async ()=>{
    const g = state.games.find(x=>x.id===b.dataset.toggleNew);
    if(!g) return;
    const isNewRelease = !g.isNewRelease;
    const newReleaseDate = isNewRelease ? (g.newReleaseDate || new Date().toISOString().slice(0,10)) : null;
    await apiPut('/admin/games/'+encodeURIComponent(g.id), { isNewRelease, newReleaseDate });
    await loadGames();
  });
}

