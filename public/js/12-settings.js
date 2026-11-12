/**
 * ARCHIVO 12 de 16 — Vista "/ajustes" (perfil, privacidad y seguridad, conexiones).
 *
 * Una sola tarjeta con 3 pestañas (como las del panel de admin); renderSettingsView()
 * construye todo y engancha los botones de guardar, que son independientes (cada uno
 * hace su propio pedido al servidor y solo manda lo suyo):
 *   - Perfil: foto, usuario y descripción -> POST /api/profile/avatar y PUT /api/profile
 *   - Privacidad y seguridad: correo -> PUT /api/profile (pide la contraseña actual
 *     si cambia); cambiar contraseña -> POST /api/account/password (pide la
 *     contraseña actual; para cuentas viejas con PIN, "la contraseña actual" ES el
 *     PIN de 4 dígitos — cambiarla es opcional, nunca obligatorio, ver el aviso
 *     "legacyHintHTML"); y al final cerrar sesión en todos los dispositivos
 *   - Conexiones: redes sociales y plataformas de juego (dos grupos, un solo botón) -> PUT /api/profile (solo los enlaces),
 *     y "Steam y biblioteca" con su guía (se refresca sola, sin recargar la vista)
 * La pestaña abierta vive en state.settingsTab (se borra al salir de Ajustes).
 */
/* ---------- ajustes ---------- */
// Guía de Steam (dentro de «Steam y biblioteca»): cómo vincular, qué hay que poner en Público, cómo importar, el favorito y qué ven los demás. Es un <details>:
// abierta mientras no haya Steam vinculado (cuando más hace falta) y cerrada después. Los textos son steam_guide_1_t/_p … steam_guide_6_t/_p en 02-i18n.js.
// Si cambia el nombre de un botón citado ahí (Vincular, Actualizar, Importar, Elegir favorito), hay que cambiarlo también en la guía.
function steamGuideHTML(open){
  return `
      <details class="steam-guide" id="steamGuide" ${open? 'open' : ''}>
        <summary>${esc(t('steam_guide_title'))}</summary>
        <ol>${[1,2,3,4,5,6].map(i=>`<li><strong>${esc(t('steam_guide_'+i+'_t'))}</strong> ${esc(t('steam_guide_'+i+'_p'))}</li>`).join('')}</ol>
      </details>`;
}
// Sección "Steam y biblioteca" (pestaña Conexiones): vincular/desvincular Steam, traer las horas y los logros, qué se ve en el perfil público (la biblioteca, y las horas con los logros, por separado) y la guía.
// guideOpen: si la guía se ve abierta; sin indicar, abierta solo mientras no haya Steam vinculado.
function steamSectionHTML(u, guideOpen){
  const s = u.steam;
  const status = s ? `
      <div class="steam-status"><strong>${esc(t('steam_linked_label'))}</strong><a class="btn-ghost" href="https://steamcommunity.com/profiles/${esc(s.id)}" target="_blank" rel="noopener noreferrer">${esc(t('steam_view_profile'))} ↗</a></div>
      <p class="hint" style="margin:0 0 12px;">${s.syncedAt? esc(t('steam_last_sync'))+' '+esc(fmtDate(s.syncedAt)) : esc(t('steam_never_synced'))}</p>
      <div class="steam-actions"><button type="button" class="btn small" id="stSteamSync">${esc(t('steam_sync_btn'))}</button><button type="button" class="btn-ghost" id="stSteamUnlink">${esc(t('steam_unlink_btn'))}</button></div>`
    : `
      <p class="hint hint-tip" style="margin-top:0;">${esc(t('steam_intro'))}</p>
      <a class="btn" id="stSteamLink" href="/api/steam/link">${esc(t('steam_link_btn'))}</a>`;
  return `
    <section class="settings-section" id="steamCard">
      <h3>${esc(t('settings_steam_section'))}</h3>
      ${status}
      <div class="error" id="stSteamError" hidden></div>
      <div class="field" style="margin:16px 0 0; padding-top:14px; border-top:1px dashed var(--line-dark);">
        <label class="check-row"><input type="checkbox" id="st-library-public" ${u.libraryPublic?'checked':''}><span>${esc(t('library_public_label'))}</span></label>
        ${s? `<label class="check-row"><input type="checkbox" id="st-hours-public" ${s.hoursPublic?'checked':''}><span>${esc(t('steam_hours_public_label'))}</span></label>` : ''}
      </div>
      ${steamGuideHTML(guideOpen === undefined ? !s : guideOpen)}
    </section>`;
}
// Vuelve a pintar solo la sección de Steam (después de actualizar o desvincular), sin tocar las otras pestañas ni lo que haya escrito en ellas, y conserva si la guía estaba abierta.
function refreshSteamSection(){
  const guide = document.getElementById('steamGuide');
  document.getElementById('steamCard').outerHTML = steamSectionHTML(state.user, guide ? guide.open : undefined);
  wireSteamCard();
}
// Engancha la tarjeta de Steam y avisa el resultado cuando se vuelve de Steam (/ajustes?steam=linked | taken | error, y con linked también &sync=ok | private | none).
function wireSteamCard(){
  const u = state.user;
  const errEl = document.getElementById('stSteamError');
  const savePrivacy = async (field, input)=>{
    try{
      const r = await apiPut('/profile/privacy', { [field]: input.checked });
      u.libraryPublic = r.libraryPublic;
      if(u.steam) u.steam.hoursPublic = r.steamHoursPublic;
      toast(t('toast_privacy_saved'), 'good');
    }catch(e){ input.checked = !input.checked; toast(t('err_save_user'), 'bad'); }
  };
  const lib = document.getElementById('st-library-public');
  if(lib) lib.onchange = ()=> savePrivacy('libraryPublic', lib);
  const hours = document.getElementById('st-hours-public');
  if(hours) hours.onchange = ()=> savePrivacy('steamHoursPublic', hours);
  const sync = document.getElementById('stSteamSync');
  if(sync) sync.onclick = async ()=>{
    sync.disabled = true; errEl.hidden = true;
    try{
      applySteamSync(await apiPost('/steam/sync'));
      toast(t('toast_steam_synced'), 'good');
      refreshSteamSection();
    }catch(e){ errEl.textContent = steamErrorText(e); errEl.hidden = false; sync.disabled = false; }
  };
  const unlink = document.getElementById('stSteamUnlink');
  if(unlink) unlink.onclick = async ()=>{
    if(!await confirmDialog(t('steam_unlink_confirm'))) return;
    try{
      const r = await apiPost('/steam/unlink');
      u.steam = null; u.favoriteSteam = null; u.favoritePlatinum = r.favoritePlatinum; state.steamHours = {}; state.steamHoursFor = u.username;
      toast(t('toast_steam_unlinked'));
      refreshSteamSection();
    }catch(e){ toast(t('err_save_user'), 'bad'); }
  };
  const params = new URLSearchParams(location.search), result = params.get('steam');
  if(result){
    history.replaceState(null, '', '/ajustes');
    if(result==='linked') noticeDialog(t('steam_linked_title'), t({ ok:'steam_linked_ok', private:'steam_linked_private' }[params.get('sync')] || 'steam_linked_none'), ICONS.checkCircle, 'good');
    else noticeDialog(t('steam_failed_title'), t(result==='taken'? 'toast_steam_taken' : 'toast_steam_error'), '', 'bad');
  }
}
// Los enlaces del perfil (SOCIAL_META, 01-icons-and-catalog-meta.js) se muestran en dos grupos: redes sociales y plataformas de juego.
// Las plataformas son todo lo que no está en esta lista, así una clave nueva de SOCIAL_KEYS nunca queda fuera del formulario (guardar reemplaza todos los enlaces).
const SOCIAL_NETWORK_KEYS = ['instagram', 'facebook', 'x', 'youtube'];
function socialFieldsHTML(keys, links){
  return `<div class="field-row" style="flex-wrap:wrap;">${keys.map(k=>`
    <div class="field" style="min-width:150px;">
      <label for="st-social-${k}" style="font-weight:400; text-transform:none; font-size:11px;">${esc(SOCIAL_META[k].name)}</label>
      <input type="text" id="st-social-${k}" placeholder="https://…" value="${esc((links&&links[k])||'')}">
    </div>`).join('')}</div>`;
}
// Las pestañas de Ajustes (todas dentro de una sola tarjeta). Cada una guarda lo suyo por separado. Los textos de las pestañas están en 02-i18n.js.
const SETTINGS_TABS = [
  { key:'profile',     label:'settings_profile_section', icon:'user' },
  { key:'privacy',     label:'settings_tab_privacy',     icon:'shield' },
  { key:'connections', label:'settings_tab_connections', icon:'link' },
];
// Cambia de pestaña al tocarla o con las flechas del teclado (patrón de pestañas accesible). La elegida queda en state.settingsTab, que se borra al salir de Ajustes (ver applyView).
function wireSettingsTabs(){
  const tabs = [...document.querySelectorAll('.settings-tab')];
  const show = (key, focus)=>{
    state.settingsTab = key;
    tabs.forEach(b=>{
      const on = b.dataset.tab===key;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.tabIndex = on? 0 : -1;
      if(on && focus) b.focus();
    });
    document.querySelectorAll('.settings-panel').forEach(p=>{ p.hidden = p.dataset.panel!==key; });
  };
  tabs.forEach((b, i)=>{
    b.onclick = ()=> show(b.dataset.tab);
    b.onkeydown = e=>{
      const step = e.key==='ArrowRight'? 1 : e.key==='ArrowLeft'? -1 : 0;
      if(!step) return;
      e.preventDefault();
      show(tabs[(i + step + tabs.length) % tabs.length].dataset.tab, true);
    };
  });
}
// Arma Ajustes: una tarjeta con las pestañas Perfil (foto, nombre, descripción), Privacidad y seguridad (correo, contraseña y cerrar sesión en todos los dispositivos) y Conexiones
// (redes y plataformas de juego, y Steam y biblioteca con su guía), y engancha cada botón "Guardar". Si no hay sesión, redirige a /cuenta.
function renderSettingsView(){
  if(!state.user){ goView('auth'); return; }
  const u = state.user;
  const el = document.getElementById('settingsContent');
  const avatarHTML = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}">` : esc(u.username[0].toUpperCase());
  const emailStatusHTML = !u.email ? '' : u.emailVerified
    ? `<p class="hint email-status ok">${ICONS.checkCircle} ${esc(t('st_email_verified'))}</p>`
    : `<p class="hint email-status">${esc(t('st_email_unverified'))} <button type="button" class="linklike" id="stEmailResend">${esc(t('st_email_resend'))}</button></p>`;
  const legacyHintHTML = !u.email ? `<p class="hint" data-i18n="settings_legacy_password_hint">${esc(t('settings_legacy_password_hint'))}</p>` : '';
  // Al volver de Steam se abre Conexiones (ahí se ve el resultado); si no, la pestaña en la que estaba la persona, o Perfil.
  const tab = new URLSearchParams(location.search).has('steam') ? 'connections' : (state.settingsTab || 'profile');
  state.settingsTab = tab;
  const panel = (key, inner)=> `<div class="settings-panel" role="tabpanel" id="settingsPanel-${key}" data-panel="${key}" aria-labelledby="settingsTab-${key}" ${key===tab? '' : 'hidden'}>${inner}</div>`;
  el.innerHTML = `
    <div class="card settings-card">
      <div class="settings-tabs" role="tablist" aria-label="${esc(t('settings_tabs_label'))}">
        ${SETTINGS_TABS.map(x=>`<button type="button" class="settings-tab${x.key===tab? ' active' : ''}" role="tab" id="settingsTab-${x.key}" data-tab="${x.key}" aria-selected="${x.key===tab}" aria-controls="settingsPanel-${x.key}" tabindex="${x.key===tab? 0 : -1}">${ICONS[x.icon]} ${esc(t(x.label))}</button>`).join('')}
      </div>

      ${panel('profile', `
        <div class="field">
          <label for="st-avatar-file">${esc(t('profile_avatar_label'))}</label>
          <div class="cover-picker" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <div class="cover-preview" id="settingsAvatarPreview" style="border-radius:50%;">${avatarHTML}</div>
            <div style="min-width:0; flex:1 1 200px;">
              <input type="file" id="st-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" style="max-width:100%;">
              <p class="hint hint-tip" style="margin:6px 0 0;">${esc(t('avatar_file_hint'))}</p>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="st-username">${esc(t('profile_username_label'))}</label>
          <input type="text" id="st-username" maxlength="25" value="${esc(u.username)}">
          <p class="hint hint-tip">${esc(t('username_hint'))}</p>
        </div>
        <div class="field">
          <label for="st-bio">${esc(t('profile_bio_label'))}</label>
          <textarea id="st-bio" maxlength="5000" style="min-height:70px;">${esc(u.bio||'')}</textarea>
        </div>
        <div class="error" id="stProfileError" hidden></div>
        <button class="btn gold" id="stProfileSave">${esc(t('save_changes_btn'))}</button>`)}

      ${panel('privacy', `
        <section class="settings-section">
          <h3>${esc(t('settings_account_section'))}</h3>
          <div class="field">
            <label for="st-email">${esc(t('auth_email_label'))}</label>
            <input type="email" id="st-email" value="${esc(u.email||'')}" placeholder="tu@email.com">
            ${emailStatusHTML}
          </div>
          <div class="field">
            <label for="st-email-password">${esc(t('settings_current_password_label'))}</label>
            <input type="password" id="st-email-password" autocomplete="current-password">
            <p class="hint hint-tip">${esc(t('settings_email_password_hint'))}</p>
          </div>
          <div class="error" id="stAccountError" hidden></div>
          <button class="btn gold" id="stAccountSave">${esc(t('save_changes_btn'))}</button>
        </section>

        <section class="settings-section">
          <h3>${esc(t('settings_security_section'))}</h3>
          ${legacyHintHTML}
          ${u.googleLinked ? `<p class="hint email-status ok">${ICONS.checkCircle} ${esc(t('st_google_linked'))}</p>` : ''}
          ${!u.hasPassword ? `<p class="hint">${esc(t('st_no_password_hint'))}</p>` : `
          <div class="field">
            <label for="st-current-password">${esc(t('settings_current_password_label'))}</label>
            <input type="password" id="st-current-password" autocomplete="current-password">
          </div>
          <div class="field">
            <label for="st-new-password">${esc(t('settings_new_password_label'))}</label>
            <input type="password" id="st-new-password" autocomplete="new-password">
            <div class="pw-meter" id="st-pwMeter" hidden></div>
            <p class="hint hint-tip">${esc(t('auth_password_hint'))}</p>
          </div>
          <div class="field">
            <label for="st-new-password2">${esc(t('settings_new_password_confirm_label'))}</label>
            <input type="password" id="st-new-password2" autocomplete="new-password">
          </div>
          <div class="error" id="stPasswordError" hidden></div>
          <button class="btn gold" id="stPasswordSave">${esc(t('settings_change_password_btn'))}</button>
          <p class="hint hint-tip">${esc(t('settings_password_signout_hint'))}</p>`}
          <div class="field" style="margin-top:22px; padding-top:18px; border-top:1px solid var(--line-dark);">
            <p class="hint hint-tip" style="margin-top:0;">${esc(t('settings_logout_all_hint'))}</p>
            <button class="btn-ghost" id="stLogoutAll">${esc(t('settings_logout_all_btn'))}</button>
          </div>
          <div class="settings-danger">
            <h4>${esc(t('delete_account_title'))}</h4>
            <p class="hint hint-tip">${esc(t('delete_account_hint'))}</p>
            <button type="button" class="btn-danger" id="stDeleteAccount">${esc(t('delete_account_btn'))}</button>
          </div>
        </section>`)}

      ${panel('connections', `
        <section class="settings-section">
          <div class="settings-group">
            <h3>${esc(t('settings_social_networks'))}</h3>
            ${socialFieldsHTML(SOCIAL_KEYS.filter(k=>SOCIAL_NETWORK_KEYS.includes(k)), u.socialLinks)}
          </div>
          <div class="settings-group">
            <h3>${esc(t('settings_game_platforms'))}</h3>
            <p class="hint hint-tip" style="margin:0 0 10px;">${esc(t('settings_game_platforms_hint'))}</p>
            ${socialFieldsHTML(SOCIAL_KEYS.filter(k=>!SOCIAL_NETWORK_KEYS.includes(k)), u.socialLinks)}
          </div>
          <div class="error" id="stSocialError" hidden></div>
          <button class="btn gold" id="stSocialSave">${esc(t('save_changes_btn'))}</button>
        </section>

        ${steamSectionHTML(u)}`)}
    </div>
  `;

  wireSettingsTabs();
  wireSteamCard();

  let pendingSettingsAvatarFile = null;
  document.getElementById('st-avatar-file').onchange = (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    pendingSettingsAvatarFile = file;
    const reader = new FileReader();
    reader.onload = ()=>{ document.getElementById('settingsAvatarPreview').innerHTML = `<img src="${reader.result}">`; };
    reader.readAsDataURL(file);
  };

  // Guardar Perfil: si hay foto nueva, la sube primero; después manda usuario y descripción en un solo PUT. Si cambió el nombre de usuario, actualiza también las reseñas ya cargadas en memoria para que muestren el nombre nuevo sin recargar la página.
  document.getElementById('stProfileSave').onclick = async ()=>{
    const errEl = document.getElementById('stProfileError');
    errEl.hidden = true;
    const username = document.getElementById('st-username').value.trim();
    const bio = document.getElementById('st-bio').value.trim();
    try{
      if(pendingSettingsAvatarFile){
        const fd = new FormData();
        fd.append('image', await shrinkImage(pendingSettingsAvatarFile, 1000));
        const r = await api('/profile/avatar', { method:'POST', body: fd, isForm:true });
        state.user = r.user;
        pendingSettingsAvatarFile = null;
      }
      const oldUsername = state.user.username;
      const { user } = await apiPut('/profile', { username, bio });
      if(user.username !== oldUsername){
        state.reviews.forEach(r=>{ if(r.username===oldUsername) r.username = user.username; });
      }
      state.user = user;
      renderUserBadge();
      toast(t('toast_profile_saved'), 'good');
    }catch(e){
      errEl.textContent = (e.body && e.body.error==='username_taken') ? t('err_username_taken_settings')
        : (e.body && e.body.error==='invalid_username') ? t('err_invalid_username') : t('err_save_user');
      errEl.hidden = false;
    }
  };

  // Guardar Conexiones (redes y plataformas de juego): solo los enlaces; el servidor deja igual el resto del perfil.
  document.getElementById('stSocialSave').onclick = async ()=>{
    const errEl = document.getElementById('stSocialError');
    errEl.hidden = true;
    const socialLinks = {};
    SOCIAL_KEYS.forEach(k=>{ const v=document.getElementById('st-social-'+k).value.trim(); if(v) socialLinks[k]=v; });
    if(hasBadSocialLink(socialLinks)){ errEl.textContent = t('err_social_link'); errEl.hidden = false; return; }
    try{
      const { user } = await apiPut('/profile', { socialLinks });
      state.user = user;
      toast(t('toast_profile_saved'), 'good');
    }catch(e){ errEl.textContent = t('err_save_user'); errEl.hidden = false; }
  };

  const stEmailResend = document.getElementById('stEmailResend');
  if(stEmailResend) stEmailResend.onclick = resendVerification;
  // Guardar Cuenta: solo el email. Si cambia, el servidor pide la contraseña actual.
  document.getElementById('stAccountSave').onclick = async ()=>{
    const errEl = document.getElementById('stAccountError');
    errEl.hidden = true;
    const email = document.getElementById('st-email').value.trim();
    const body = { email, lang: state.lang };
    if(email.toLowerCase() !== (state.user.email||'').toLowerCase()) body.currentPassword = document.getElementById('st-email-password').value;
    try{
      const { user } = await apiPut('/profile', body);
      state.user = user;
      document.getElementById('st-email-password').value = '';
      renderVerifyBanner();
      toast(t('toast_profile_saved'), 'good');
    }catch(e){
      const code = e.body && e.body.error;
      errEl.textContent = code==='email_taken' ? t('err_email_taken') : code==='invalid_email' ? t('err_invalid_email')
        : code==='bad_current_password' ? t('err_bad_current_password') : code==='set_password_first' ? t('err_set_password_first') : code==='too_many_requests' ? t('err_too_many') : t('err_save_user');
      errEl.hidden = false;
    }
  };

  // Cambiar contraseña: valida fuerza + coincidencia en el cliente, pide la contraseña actual al servidor (que la compara contra el PIN si es una cuenta vieja), y si sale bien limpia los 3 campos (si falla, los deja para que el usuario pueda corregir sin volver a tipear todo).
  const stPasswordSave = document.getElementById('stPasswordSave');
  if(stPasswordSave) bindPasswordMeter(document.getElementById('st-new-password'), document.getElementById('st-pwMeter'), t);
  if(stPasswordSave) stPasswordSave.onclick = async ()=>{
    const errEl = document.getElementById('stPasswordError');
    errEl.hidden = true;
    const currentPassword = document.getElementById('st-current-password').value;
    const newPassword = document.getElementById('st-new-password').value;
    const newPassword2 = document.getElementById('st-new-password2').value;
    const pwProblem = passwordProblemClient(newPassword);
    if(pwProblem){ errEl.textContent=t(pwProblem); errEl.hidden=false; return; }
    if(newPassword!==newPassword2){ errEl.textContent=t('err_password_mismatch'); errEl.hidden=false; return; }
    try{
      await apiPost('/account/password', { currentPassword, newPassword });
      toast(t('toast_password_changed'), 'good');
      document.getElementById('st-current-password').value='';
      document.getElementById('st-new-password').value='';
      document.getElementById('st-new-password').oninput();
      document.getElementById('st-new-password2').value='';
    }catch(e){
      const code = e.body && e.body.error;
      errEl.textContent = code==='bad_current_password' ? t('err_bad_current_password') : code==='password_emoji' ? t('err_password_emoji')
        : code==='common_password' ? t('err_common_password') : code==='too_many_requests' ? t('err_too_many') : t('err_weak_password');
      errEl.hidden = false;
    }
  };

  // Cerrar sesión en todos los dispositivos (también este): sirve si se perdió un aparato o se sospecha que alguien entró.
  document.getElementById('stLogoutAll').onclick = async ()=>{
    try{ await apiPost('/auth/logout-all'); }catch(e){ toast(t('err_logout_all'), 'bad'); return; }
    await finishLogout('toast_logged_out_all');
  };
  document.getElementById('stDeleteAccount').onclick = openDeleteAccountModal;
}

/* ---------- eliminar la cuenta ---------- */
// El botón de Ajustes abre este aviso: hay que marcar «Deseo eliminar mi cuenta», escribir la contraseña y recién entonces se habilita el botón de eliminar. Borra todo en el servidor
// (DELETE /api/account, que vuelve a comprobar la contraseña), cierra la sesión y lleva al inicio. No se cierra al tocar afuera (solo con Cancelar o Escape), para que no se pierda
// por un toque sin querer. Una cuenta de Google (sin contraseña) confirma con un código de 6 dígitos que le llega al correo (POST /api/account/delete-code): botón «Enviar código» y campo del código.
function openDeleteAccountModal(){
  const withPassword = !!(state.user && state.user.hasPassword);
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box notice-box tone-bad delete-account-box" role="alertdialog" aria-modal="true" aria-labelledby="delTitle" aria-describedby="delText">
      <div class="notice-icon"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg></div>
      <h3 id="delTitle">${esc(t('delete_modal_title'))}</h3>
      <p id="delText">${esc(t('delete_modal_text'))}</p>
      ${withPassword ? `
      <label class="delete-check"><input type="checkbox" id="delCheck"><span>${esc(t('delete_modal_check'))}</span></label>
      <div class="field delete-pass">
        <input type="password" id="delPass" autocomplete="current-password" placeholder="${esc(t('delete_modal_password'))}" aria-label="${esc(t('delete_modal_password'))}">
      </div>` : `
      <label class="delete-check"><input type="checkbox" id="delCheck"><span>${esc(t('delete_modal_check'))}</span></label>
      <p class="delete-code-hint" id="delCodeHint">${esc(t('delete_modal_code_hint'))}</p>
      <div class="field delete-pass delete-code-row">
        <input type="text" id="delCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="${esc(t('delete_modal_code_ph'))}" aria-label="${esc(t('delete_modal_code_ph'))}">
        <button type="button" class="btn-ghost" id="delSend">${esc(t('delete_modal_send_code'))}</button>
      </div>`}
      <div class="error" id="delError" role="alert" hidden></div>
      <div class="confirm-actions">
        <button type="button" class="btn-ghost" data-act="cancel">${esc(t('cancel_btn'))}</button>
        <button type="button" class="btn gold" data-act="delete" disabled>${esc(t('delete_account_btn'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const check = overlay.querySelector('#delCheck'), pass = overlay.querySelector('#delPass') || overlay.querySelector('#delCode'), del = overlay.querySelector('[data-act="delete"]'), errEl = overlay.querySelector('#delError');
  const onKey = e=>{ if(e.key==='Escape') cleanup(); };
  const cleanup = ()=>{ overlay.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-act="cancel"]').onclick = cleanup;
  // el botón de eliminar solo se habilita con la casilla marcada y la contraseña (o el código de 6 dígitos) escrita
  const sync = ()=>{ del.disabled = !(check.checked && (withPassword ? pass.value.length>0 : /^\d{6}$/.test(pass.value.trim()))); errEl.hidden = true; };
  const send = overlay.querySelector('#delSend');
  if(send) send.onclick = async ()=>{
    send.disabled = true; errEl.hidden = true;
    try{
      await api('/account/delete-code', { method:'POST', body: JSON.stringify({ lang: state.lang }) });
      overlay.querySelector('#delCodeHint').textContent = t('delete_modal_code_sent');
      send.textContent = t('delete_modal_resend_code');
      pass.focus();
    }catch(e){
      const code = e && e.body && e.body.error;
      errEl.textContent = t(code==='too_many_requests' ? 'err_too_many' : 'err_send_code');
      errEl.hidden = false;
    }
    send.disabled = false;
  };
  check.onchange = sync;
  pass.oninput = sync;
  const submit = async ()=>{
    if(del.disabled) return;
    del.disabled = true; check.disabled = true; pass.disabled = true;
    try{
      await api('/account', { method:'DELETE', body: JSON.stringify(withPassword ? { confirm: true, password: pass.value } : { confirm: true, code: pass.value.trim() }) });
    }catch(e){
      const code = e && e.body && e.body.error;
      errEl.textContent = t(code==='bad_current_password' ? 'err_bad_current_password' : code==='bad_delete_code' ? 'err_bad_delete_code' : code==='admin_account' ? 'err_admin_delete' : code==='too_many_requests' ? 'err_too_many' : 'err_save_user');
      errEl.hidden = false;
      check.disabled = false; pass.disabled = false; sync(); errEl.hidden = false;
      pass.focus(); pass.select();
      return;
    }
    cleanup();
    state.user = null; state.notifications = [];
    await loadAll();
    await loadDailyState();
    renderUserBadge();
    goView('feed');
    toast(t('toast_account_deleted'));
  };
  del.onclick = submit;
  pass.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } };
  check.focus();
}
