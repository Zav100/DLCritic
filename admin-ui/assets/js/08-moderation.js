/**
 * ARCHIVO — Pestaña "Moderación": la bandeja con lo que marcó el filtro de palabras (server/moderation.js) o reportaron los usuarios, los GIF de foto de
 * perfil que esperan aprobación, las cuentas suspendidas y lo resuelto hace poco. Todo viene de GET /api/admin/moderation; cada botón llama a la ruta
 * correspondiente (server/admin.js, sección «moderación») y vuelve a cargar la pestaña.
 */
const MOD_KIND = { review:'Reseña de juego', character_review:'Reseña de personaje', bio:'Descripción de perfil', list:'Nombre de lista', user:'Perfil' };
const MOD_TIER = { grave:'Grave', revisar:'Revisar', odio:'Odio', acoso:'Acoso', inapropiado:'Inapropiado', spam:'Spam', otro:'Otro' };
const MOD_ACTION = { ok:'Está bien', hide:'Ocultar reseña', clear:'Quitar descripción', delete:'Borrar lista', clear_bio:'Quitar descripción', remove_avatar:'Quitar foto', suspend:'Suspender cuenta' };
const MOD_ACTIONS_BY_KIND = {
  review: ['ok', 'hide', 'suspend'], character_review: ['ok', 'hide', 'suspend'], bio: ['ok', 'clear', 'suspend'], list: ['ok', 'delete', 'suspend'],
  user: ['ok', 'clear_bio', 'remove_avatar', 'suspend'],
};
const MOD_RESOLUTION = { ok:'Aprobado', hidden:'Reseña oculta', cleared:'Descripción quitada', deleted:'Lista borrada', avatar_removed:'Foto quitada', suspended:'Cuenta suspendida' };

// El texto con lo que saltó resaltado: spans = [[desde, hasta, 'grave'|'revisar']] sobre el texto original.
function modHighlight(text, spans){
  let out = '', pos = 0;
  for(const [from, to, tier] of spans){
    if(from < pos) continue; // un tramo dentro de otro
    out += esc(text.slice(pos, from)) + `<mark class="mod-mark ${esc(tier)}">${esc(text.slice(from, to))}</mark>`;
    pos = to;
  }
  return out + esc(text.slice(pos));
}

async function loadModeration(){
  const data = await apiGet('/admin/moderation');
  state.moderation = data;
  const badge = document.getElementById('moderationBadge');
  badge.textContent = data.openCount;
  badge.hidden = data.openCount === 0;
  renderModeration();
}

function modFlagHTML(f){
  const who = f.source === 'report'
    ? `Reportado por <b>${esc(f.reporter || 'alguien')}</b>${f.note ? `: «${esc(f.note)}»` : ''}`
    : 'Lo marcó el filtro de palabras';
  const actions = (MOD_ACTIONS_BY_KIND[f.kind] || ['ok']).map(a =>
    `<button type="button" class="chip${a === 'suspend' ? ' mod-danger' : ''}" data-flag="${esc(f.id)}" data-action="${a}">${esc(MOD_ACTION[a])}</button>`).join('');
  return `
    <div class="suggestion-card mod-card ${f.tier === 'grave' ? 'mod-grave' : ''}">
      <div class="suggestion-head">
        <div class="suggestion-title"><span class="kind-badge mod">${esc(MOD_KIND[f.kind] || f.kind)}</span> de <b>${esc(f.author || '(cuenta borrada)')}</b></div>
        <span class="status-badge ${f.tier === 'grave' ? 'mod-grave-badge' : 'unread'}">${esc(MOD_TIER[f.tier] || f.tier || '')}</span>
      </div>
      <div class="suggestion-meta">${who}</div>
      ${f.text ? `<div class="suggestion-note mod-text">${modHighlight(f.text, f.spans)}</div>` : ''}
      <div class="suggestion-foot">
        <span class="suggestion-sub">${esc(fmtSuggestionDate(f.createdAt))}</span>
        <div class="chip-group">${actions}</div>
      </div>
    </div>`;
}

function renderModeration(){
  const { flags, gifs, suspended, recent } = state.moderation;
  const wrap = document.getElementById('moderationBody');
  const gifsHTML = gifs.length ? `
    <h3 class="mod-h">GIF por aprobar (${gifs.length})</h3>
    ${gifs.map(g => `
      <div class="suggestion-card mod-card">
        <div class="suggestion-head"><div class="suggestion-title"><span class="kind-badge mod">Foto de perfil</span> de <b>${esc(g.username)}</b></div></div>
        <div class="mod-gifs">
          <figure><figcaption>Foto actual</figcaption>${g.currentUrl ? `<img src="${esc(g.currentUrl)}" alt="">` : '<span class="mod-none">Sin foto</span>'}</figure>
          <figure><figcaption>GIF nuevo</figcaption><img src="${esc(g.pendingUrl)}" alt=""></figure>
        </div>
        <div class="suggestion-foot"><span></span>
          <div class="chip-group">
            <button type="button" class="chip" data-gif="${g.userId}" data-action="approve">Aprobar</button>
            <button type="button" class="chip mod-danger" data-gif="${g.userId}" data-action="reject">Rechazar</button>
          </div>
        </div>
      </div>`).join('')}` : '';
  const flagsHTML = `<h3 class="mod-h">Por revisar (${flags.length})</h3>` + (flags.length ? flags.map(modFlagHTML).join('') : '<p class="empty-row">No hay nada por revisar.</p>');
  const suspendedHTML = suspended.length ? `
    <h3 class="mod-h">Cuentas suspendidas (${suspended.length})</h3>
    ${suspended.map(u => `<div class="mod-line"><span><b>${esc(u.username)}</b> · desde ${esc(fmtSuggestionDate(u.since))}</span><button type="button" class="chip" data-reactivate="${u.userId}">Reactivar</button></div>`).join('')}` : '';
  const recentHTML = recent.length ? `
    <h3 class="mod-h">Resueltas hace poco</h3>
    ${recent.map(f => `<div class="mod-line"><span>${esc(MOD_KIND[f.kind] || f.kind)} de <b>${esc(f.author || '(cuenta borrada)')}</b> · ${esc(MOD_RESOLUTION[f.resolution] || f.resolution || '')}</span>${f.resolution === 'hidden' ? `<button type="button" class="chip" data-flag="${esc(f.id)}" data-action="restore">Volver a mostrar</button>` : ''}</div>`).join('')}` : '';
  wrap.innerHTML = gifsHTML + flagsHTML + suspendedHTML + recentHTML;

  const run = async (path, body) => { await apiPost(path, body); await loadModeration(); };
  wrap.querySelectorAll('[data-flag]').forEach(b => b.onclick = async () => {
    if(b.dataset.action === 'suspend' && !confirm('¿Suspender esta cuenta? No podrá entrar y se oculta lo marcado. Puedes reactivarla desde aquí.')) return;
    await run('/admin/moderation/flags/' + encodeURIComponent(b.dataset.flag), { action: b.dataset.action });
  });
  wrap.querySelectorAll('[data-gif]').forEach(b => b.onclick = () => run('/admin/moderation/gifs/' + encodeURIComponent(b.dataset.gif), { action: b.dataset.action }));
  wrap.querySelectorAll('[data-reactivate]').forEach(b => b.onclick = () => run('/admin/moderation/users/' + encodeURIComponent(b.dataset.reactivate) + '/reactivate'));
}
