/**
 * ARCHIVO 5 de 6 — Pestaña "Noticias": CRUD de las noticias del feed.
 * Mismo patrón formulario+tabla que los dos archivos anteriores. Ojo: aquí
 * NO hay lógica de tope de 30 noticias con borrado de la más vieja —
 * eso lo hace el SERVIDOR solo, al crear una noticia nueva (ver
 * server/admin.js, trimNews) — el panel no necesita saber nada de eso.
 */
/* ---- noticias ---- */

// Trae todas las noticias cargadas (más recientes primero, según las devuelve el servidor).
async function loadNews(){
  const { news } = await apiGet('/admin/news');
  state.newsItems = news;
  renderNewsTable();
}

// Vuelve el formulario de noticia a "Nueva noticia" vacío (con el color por defecto).
function resetNewsForm(){
  state.editingNewsId = null;
  document.getElementById('newsFormTitle').innerHTML = iconLabel('plus', 'Nueva noticia');
  document.getElementById('newsSubmitBtn').textContent = 'Guardar noticia';
  document.getElementById('newsCancelBtn').hidden = true;
  document.getElementById('newsForm').reset();
  document.getElementById('n-color').value = '#5B8DEF';
  document.getElementById('newsFormError').hidden = true;
}
document.getElementById('newsCancelBtn').onclick = resetNewsForm;

// Llena el formulario con una noticia existente para editarla.
function fillNewsFormForEdit(n){
  state.editingNewsId = n.id;
  document.getElementById('newsFormTitle').innerHTML = iconLabel('edit', 'Editar noticia');
  document.getElementById('newsSubmitBtn').textContent = 'Guardar cambios';
  document.getElementById('newsCancelBtn').hidden = false;
  document.getElementById('n-title').value = n.title;
  document.getElementById('n-summary').value = n.summary || '';
  document.getElementById('n-source').value = n.source;
  document.getElementById('n-url').value = n.url;
  document.getElementById('n-color').value = n.color || '#5B8DEF';
  document.getElementById('n-initials').value = n.initials || '';
  window.scrollTo({ top:0, behavior:'smooth' });
}

// Guardar noticia (alta o edición): título/fuente/link son obligatorios; agregar una nueva puede hacer que el servidor borre la más vieja si ya había 30 (ver el comentario de arriba del archivo).
document.getElementById('newsForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errEl = document.getElementById('newsFormError');
  errEl.hidden = true;
  const payload = {
    title: document.getElementById('n-title').value.trim(),
    summary: document.getElementById('n-summary').value.trim(),
    source: document.getElementById('n-source').value.trim(),
    url: document.getElementById('n-url').value.trim(),
    color: document.getElementById('n-color').value,
    initials: document.getElementById('n-initials').value.trim(),
  };
  if(!payload.title || !payload.source || !payload.url){ errEl.textContent = 'Completa título, fuente y link.'; errEl.hidden = false; return; }
  try{
    if(state.editingNewsId) await apiPut('/admin/news/'+encodeURIComponent(state.editingNewsId), payload);
    else await apiPost('/admin/news', payload);
    resetNewsForm();
    await loadNews();
  }catch(e2){
    errEl.textContent = e2.message==='summary_too_long' ? 'El resumen supera los 180 caracteres.' : 'No se pudo guardar la noticia.';
    errEl.hidden = false;
  }
});

// Pinta la tabla de noticias.
function renderNewsTable(){
  document.getElementById('newsCountAdmin').textContent = state.newsItems.length;
  const body = document.getElementById('newsTableBody');
  if(state.newsItems.length===0){
    body.innerHTML = `<tr><td colspan="4" class="empty-row">Todavía no hay noticias cargadas.</td></tr>`;
    return;
  }
  body.innerHTML = state.newsItems.map(n=>`
    <tr>
      <td><span class="source-dot" style="background:${esc(n.color)}">${esc(n.initials)}</span></td>
      <td>${esc(n.title)}</td>
      <td>${esc(n.source)}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="icon-btn icon-edit" data-edit-news="${esc(n.id)}" title="Editar">${ICON_SVG.edit}</button>
        <button class="icon-btn icon-danger" data-del-news="${esc(n.id)}" title="Borrar">${ICON_SVG.trash}</button>
      </div></td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-edit-news]').forEach(b=> b.onclick = ()=>{
    const n = state.newsItems.find(x=>x.id===b.dataset.editNews);
    if(n) fillNewsFormForEdit(n);
  });
  body.querySelectorAll('[data-del-news]').forEach(b=> b.onclick = async ()=>{
    const n = state.newsItems.find(x=>x.id===b.dataset.delNews);
    if(!n) return;
    if(!confirm(`¿Borrar la noticia "${n.title}"?`)) return;
    await apiDelete('/admin/news/'+encodeURIComponent(n.id));
    await loadNews();
  });
}

