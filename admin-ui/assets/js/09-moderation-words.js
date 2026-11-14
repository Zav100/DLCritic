/**
 * ARCHIVO — Pestaña "Palabras": las palabras y frases que el filtro de moderación censura o marca (server/moderation.js). La lista original viene de
 * server/moderation-words.json; aquí un admin agrega palabras y quita las que no quiera (las quitadas se pueden restaurar). Las rutas son /api/admin/moderation/words*.
 * Lo que se cambia vale para lo que se escriba desde ahora: las reseñas ya publicadas no se tocan.
 */
const WORD_TIERS = {
  grave: { title: 'Se censuran con asteriscos', help: 'Insultos y frases de odio. Se guardan con asteriscos (por ejemplo «n******») y llegan a la bandeja de Moderación con el texto original.' },
  revisar: { title: 'Solo se marcan', help: 'Palabras que pueden ser legítimas en una reseña de videojuegos («nazi» en Wolfenstein, amenazas…). Se publican tal cual y llegan a la bandeja para que las veas.' },
  grupo: { title: 'Grupos', help: 'Una palabra de Grupos seguida de una de Insultos se censura como frase («negros de mierda»). Una palabra de Grupos sola no pasa nada.', more: true },
  insulto: { title: 'Insultos (se combinan con Grupos)', help: 'Va después de un grupo: «de mierda», «asqueroso», «are animals»…', more: true },
};
const WORD_ERRORS = { exists: 'Ya está en la lista.', invalid_term: 'Escribe de 3 a 60 caracteres: letras, números y espacios.', too_many_words: 'Llegaste al máximo de palabras agregadas (500).', invalid_tier: 'Lista no válida.' };

async function loadWords(){
  const { tiers } = await apiGet('/admin/moderation/words');
  state.moderationWords = tiers;
  renderWords();
}

function wordSectionHTML(t){
  const info = WORD_TIERS[t.tier];
  const chips = t.items.map(i =>
    `<span class="word-chip ${i.builtin ? 'builtin' : 'custom'}" title="${i.builtin ? 'De la lista original' : 'Agregada por ti'}">${esc(i.term)}<button type="button" class="word-x" data-remove="${esc(t.tier)}" data-term="${esc(i.term)}" aria-label="Quitar ${esc(i.term)}">×</button></span>`).join('');
  const removed = t.removed.length ? `
    <p class="word-removed-title">Quitadas de la lista original (toca para restaurar):</p>
    <div class="word-chips">${t.removed.map(term => `<button type="button" class="word-chip restore" data-restore="${esc(t.tier)}" data-term="${esc(term)}">${esc(term)} ↺</button>`).join('')}</div>` : '';
  const body = `
    <p class="hint" style="margin:0 0 10px;">${esc(info.help)}</p>
    <div class="word-chips">${chips || '<span class="hint">La lista está vacía.</span>'}</div>
    <form class="word-add" data-add="${esc(t.tier)}">
      <input type="text" maxlength="60" placeholder="Agregar palabra o frase" autocomplete="off" aria-label="Agregar a: ${esc(info.title)}">
      <button type="submit" class="chip">Agregar</button>
      <span class="word-error" role="alert" hidden></span>
    </form>
    ${removed}`;
  return info.more
    ? `<details class="word-section"><summary>${esc(info.title)} (${t.items.length})</summary>${body}</details>`
    : `<div class="word-section"><h3 class="mod-h">${esc(info.title)} (${t.items.length})</h3>${body}</div>`;
}

function renderWords(){
  const wrap = document.getElementById('wordsBody');
  wrap.innerHTML = state.moderationWords.map(wordSectionHTML).join('');
  const run = async (path, body, errEl) => {
    try{ const r = await apiPost(path, body); state.moderationWords = r.tiers; renderWords(); }
    catch(e){
      if(errEl){ errEl.textContent = WORD_ERRORS[e.body && e.body.error] || 'No se pudo guardar. Intenta de nuevo.'; errEl.hidden = false; }
      else alert(WORD_ERRORS[e.body && e.body.error] || 'No se pudo guardar. Intenta de nuevo.');
    }
  };
  wrap.querySelectorAll('[data-add]').forEach(form => form.onsubmit = e => {
    e.preventDefault();
    const input = form.querySelector('input'), err = form.querySelector('.word-error');
    err.hidden = true;
    if(!input.value.trim()) return;
    run('/admin/moderation/words', { tier: form.dataset.add, term: input.value }, err);
  });
  wrap.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => run('/admin/moderation/words/remove', { tier: b.dataset.remove, term: b.dataset.term }));
  wrap.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => run('/admin/moderation/words', { tier: b.dataset.restore, term: b.dataset.term }));
}

// Probador: cómo quedaría un texto con la lista de ahora (no guarda nada).
document.getElementById('wordsTestBtn').onclick = async () => {
  const text = document.getElementById('wordsTestInput').value;
  const out = document.getElementById('wordsTestResult');
  if(!text.trim()){ out.textContent = ''; return; }
  try{
    const r = await apiPost('/admin/moderation/words/test', { text });
    const marks = [...r.graves.map(g => `«${g}» (se censura)`), ...r.revisar.map(g => `«${g}» (se marca)`), ...(r.links ? ['un enlace (se marca)'] : [])];
    out.innerHTML = `<b>Quedaría:</b> ${esc(r.text)}<br><span class="hint">${marks.length ? 'Lo que encontró: ' + esc(marks.join(', ')) : 'No encontró nada.'}</span>`;
  }catch(e){ out.textContent = 'No se pudo probar. Intenta de nuevo.'; }
};
document.getElementById('wordsTestInput').addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('wordsTestBtn').click(); });
