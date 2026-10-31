/**
 * ARCHIVO 4 de 6 — Pestaña "Fechas importantes": el CRUD de los eventos
 * del calendario que se ve en la página principal (cumpleaños/salidas de
 * juegos, fechas del gaming en general). Mismo patrón que el archivo
 * anterior (formulario + tabla), pero más chico: un evento es mes+día,
 * título/descripción en los dos idiomas, y opcionalmente un juego
 * asociado (se elige escribiendo el título en un input con autocompletado
 * — el <datalist> lo llena loadGames() en 03-games-form.js).
 */
/* ---- fechas importantes ---- */

// Trae todos los eventos del calendario (para el año entero, no filtrado por mes — el filtrado por mes es cosa de la vista pública, acá se administran todos juntos).
async function loadDates(){
  const { dateEvents } = await apiGet('/admin/date-events');
  state.dateEvents = dateEvents;
  renderDatesTable();
}

// Vuelve el formulario de fecha a "Nueva fecha" vacío.
function resetDateForm(){
  state.editingDateId = null;
  document.getElementById('dateFormTitle').innerHTML = iconLabel('plus', 'Nueva fecha');
  document.getElementById('dateSubmitBtn').textContent = 'Guardar fecha';
  document.getElementById('dateCancelBtn').hidden = true;
  document.getElementById('dateForm').reset();
  document.getElementById('dateFormError').hidden = true;
}
document.getElementById('dateCancelBtn').onclick = resetDateForm;

// Llena el formulario con un evento existente para editarlo.
function fillDateFormForEdit(ev){
  state.editingDateId = ev.id;
  document.getElementById('dateFormTitle').innerHTML = iconLabel('edit', 'Editar fecha');
  document.getElementById('dateSubmitBtn').textContent = 'Guardar cambios';
  document.getElementById('dateCancelBtn').hidden = false;
  document.getElementById('d-month').value = ev.month;
  document.getElementById('d-day').value = ev.day;
  const linkedGame = ev.gameId ? state.games.find(g=>g.id===ev.gameId) : null;
  document.getElementById('d-game').value = linkedGame ? linkedGame.title : '';
  document.getElementById('d-title-es').value = ev.titleEs;
  document.getElementById('d-title-en').value = ev.titleEn;
  document.getElementById('d-desc-es').value = ev.descEs || '';
  document.getElementById('d-desc-en').value = ev.descEn || '';
  window.scrollTo({ top:0, behavior:'smooth' });
}

// Guardar fecha (alta o edición): el juego asociado se resuelve buscando
// por título EXACTO (sin importar mayúsculas) entre los juegos ya
// cargados — si no coincide con ninguno, se guarda sin juego asociado en
// vez de fallar (así un typo en el título no rompe el guardado, solo
// deja el evento sin link a un juego).
document.getElementById('dateForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errEl = document.getElementById('dateFormError');
  errEl.hidden = true;
  const gameTitle = document.getElementById('d-game').value.trim();
  const linkedGame = gameTitle ? state.games.find(g=>g.title.toLowerCase()===gameTitle.toLowerCase()) : null;
  const payload = {
    month: Number(document.getElementById('d-month').value),
    day: Number(document.getElementById('d-day').value),
    gameId: linkedGame ? linkedGame.id : null,
    titleEs: document.getElementById('d-title-es').value.trim(),
    titleEn: document.getElementById('d-title-en').value.trim(),
    descEs: document.getElementById('d-desc-es').value.trim(),
    descEn: document.getElementById('d-desc-en').value.trim(),
  };
  if(!payload.titleEs || !payload.titleEn){ errEl.textContent = 'Completá el título en ambos idiomas.'; errEl.hidden = false; return; }
  try{
    if(state.editingDateId) await apiPut('/admin/date-events/'+encodeURIComponent(state.editingDateId), payload);
    else await apiPost('/admin/date-events', payload);
    resetDateForm();
    await loadDates();
  }catch(e2){
    errEl.textContent = 'No se pudo guardar la fecha.';
    errEl.hidden = false;
  }
});

// Pinta la tabla de fechas (fecha, título, juego asociado si tiene, editar/borrar).
function renderDatesTable(){
  document.getElementById('dateCount').textContent = state.dateEvents.length;
  const body = document.getElementById('datesTableBody');
  if(state.dateEvents.length===0){
    body.innerHTML = `<tr><td colspan="4" class="empty-row">Todavía no hay fechas cargadas.</td></tr>`;
    return;
  }
  body.innerHTML = state.dateEvents.map(ev=>{
    const linkedGame = ev.gameId ? state.games.find(g=>g.id===ev.gameId) : null;
    return `
    <tr>
      <td>${String(ev.day).padStart(2,'0')}/${String(ev.month).padStart(2,'0')}</td>
      <td>${esc(ev.titleEs)}</td>
      <td>${linkedGame? esc(linkedGame.title) : '—'}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="icon-btn icon-edit" data-edit-date="${esc(ev.id)}" title="Editar">${ICON_SVG.edit}</button>
        <button class="icon-btn icon-danger" data-del-date="${esc(ev.id)}" title="Borrar">${ICON_SVG.trash}</button>
      </div></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-edit-date]').forEach(b=> b.onclick = ()=>{
    const ev = state.dateEvents.find(x=>x.id===b.dataset.editDate);
    if(ev) fillDateFormForEdit(ev);
  });
  body.querySelectorAll('[data-del-date]').forEach(b=> b.onclick = async ()=>{
    const ev = state.dateEvents.find(x=>x.id===b.dataset.delDate);
    if(!ev) return;
    if(!confirm(`¿Borrar la fecha "${ev.titleEs}"?`)) return;
    await apiDelete('/admin/date-events/'+encodeURIComponent(ev.id));
    await loadDates();
  });
}

