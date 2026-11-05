/**
 * ARCHIVO 12 de 16 — Vista "/ajustes" (perfil, cuenta y seguridad).
 *
 * Una sola función construye las 3 tarjetas de la vista Y engancha sus 3
 * botones de guardar por separado (Perfil / Cuenta / Seguridad se guardan
 * de forma independiente, con su propio pedido al servidor):
 *   - Perfil: foto, usuario, bio, redes -> PUT /api/profile
 *   - Cuenta: email -> PUT /api/profile (mismo endpoint, otro campo)
 *   - Seguridad: cambiar contraseña -> POST /api/account/password (pide
 *     la contraseña actual; para cuentas viejas con PIN, "la contraseña
 *     actual" ES el PIN de 4 dígitos — cambiarla es opcional, nunca
 *     obligatorio, ver el aviso "legacyHintHTML" más abajo).
 */
/* ---------- ajustes ---------- */
// Arma las 3 tarjetas de Ajustes (Perfil/Cuenta/Seguridad) con los datos actuales del usuario, y engancha cada botón "Guardar". Si no hay sesión, redirige a /cuenta.
function renderSettingsView(){
  if(!state.user){ goView('auth'); return; }
  const u = state.user;
  const el = document.getElementById('settingsContent');
  const avatarHTML = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}">` : esc(u.username[0].toUpperCase());
  const legacyHintHTML = !u.email ? `<p class="hint" data-i18n="settings_legacy_password_hint">${esc(t('settings_legacy_password_hint'))}</p>` : '';
  el.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">${esc(t('settings_profile_section'))}</h3>
      <div class="field">
        <label>${esc(t('profile_avatar_label'))}</label>
        <div class="cover-picker" style="display:flex; align-items:center; gap:14px;">
          <div class="cover-preview" id="settingsAvatarPreview" style="border-radius:50%;">${avatarHTML}</div>
          <div style="min-width:0; flex:1;">
            <input type="file" id="st-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" style="max-width:100%;">
            <p class="hint" style="margin:6px 0 0;">${esc(t('avatar_file_hint'))}</p>
          </div>
        </div>
      </div>
      <div class="field">
        <label for="st-username">${esc(t('profile_username_label'))}</label>
        <input type="text" id="st-username" maxlength="20" value="${esc(u.username)}">
      </div>
      <div class="field">
        <label for="st-bio">${esc(t('profile_bio_label'))}</label>
        <textarea id="st-bio" maxlength="500" style="min-height:70px;">${esc(u.bio||'')}</textarea>
      </div>
      <div class="field">
        <label>${esc(t('profile_social_label'))}</label>
        <div class="field-row" style="flex-wrap:wrap;">
          ${SOCIAL_KEYS.map(k=>`
            <div class="field" style="min-width:150px;">
              <label for="st-social-${k}" style="font-weight:400; text-transform:none; font-size:11px;">${esc(SOCIAL_META[k].name)}</label>
              <input type="text" id="st-social-${k}" placeholder="https://…" value="${esc((u.socialLinks&&u.socialLinks[k])||'')}">
            </div>
          `).join('')}
        </div>
      </div>
      <div class="error" id="stProfileError" hidden></div>
      <button class="btn gold" id="stProfileSave">${esc(t('save_changes_btn'))}</button>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">${esc(t('settings_account_section'))}</h3>
      <div class="field">
        <label for="st-email">${esc(t('auth_email_label'))}</label>
        <input type="email" id="st-email" value="${esc(u.email||'')}" placeholder="tu@email.com">
      </div>
      <div class="field">
        <label for="st-email-password">${esc(t('settings_current_password_label'))}</label>
        <input type="password" id="st-email-password" autocomplete="current-password">
        <p class="hint">${esc(t('settings_email_password_hint'))}</p>
      </div>
      <div class="error" id="stAccountError" hidden></div>
      <button class="btn gold" id="stAccountSave">${esc(t('save_changes_btn'))}</button>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">${esc(t('settings_security_section'))}</h3>
      ${legacyHintHTML}
      <div class="field">
        <label for="st-current-password">${esc(t('settings_current_password_label'))}</label>
        <input type="password" id="st-current-password" autocomplete="current-password">
      </div>
      <div class="field">
        <label for="st-new-password">${esc(t('settings_new_password_label'))}</label>
        <input type="password" id="st-new-password" autocomplete="new-password">
        <p class="hint">${esc(t('auth_password_hint'))}</p>
      </div>
      <div class="field">
        <label for="st-new-password2">${esc(t('settings_new_password_confirm_label'))}</label>
        <input type="password" id="st-new-password2" autocomplete="new-password">
      </div>
      <div class="error" id="stPasswordError" hidden></div>
      <button class="btn gold" id="stPasswordSave">${esc(t('settings_change_password_btn'))}</button>
      <p class="hint">${esc(t('settings_password_signout_hint'))}</p>
      <div class="field" style="margin-top:22px; padding-top:18px; border-top:1px solid var(--line-dark);">
        <p class="hint" style="margin-top:0;">${esc(t('settings_logout_all_hint'))}</p>
        <button class="btn-ghost" id="stLogoutAll">${esc(t('settings_logout_all_btn'))}</button>
      </div>
    </div>
  `;

  let pendingSettingsAvatarFile = null;
  document.getElementById('st-avatar-file').onchange = (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    pendingSettingsAvatarFile = file;
    const reader = new FileReader();
    reader.onload = ()=>{ document.getElementById('settingsAvatarPreview').innerHTML = `<img src="${reader.result}">`; };
    reader.readAsDataURL(file);
  };

  // Guardar Perfil: si hay foto nueva, la sube primero; después manda usuario/bio/redes en un solo PUT. Si cambió el nombre de usuario, actualiza también las reseñas ya cargadas en memoria para que muestren el nombre nuevo sin recargar la página.
  document.getElementById('stProfileSave').onclick = async ()=>{
    const errEl = document.getElementById('stProfileError');
    errEl.hidden = true;
    const username = document.getElementById('st-username').value.trim();
    const bio = document.getElementById('st-bio').value.trim();
    const socialLinks = {};
    SOCIAL_KEYS.forEach(k=>{ const v=document.getElementById('st-social-'+k).value.trim(); if(v) socialLinks[k]=v; });
    try{
      if(pendingSettingsAvatarFile){
        const fd = new FormData();
        fd.append('image', await shrinkImage(pendingSettingsAvatarFile, 1000));
        const r = await api('/profile/avatar', { method:'POST', body: fd, isForm:true });
        state.user = r.user;
        pendingSettingsAvatarFile = null;
      }
      const oldUsername = state.user.username;
      const { user } = await apiPut('/profile', { username, bio, socialLinks });
      if(user.username !== oldUsername){
        state.reviews.forEach(r=>{ if(r.username===oldUsername) r.username = user.username; });
      }
      state.user = user;
      renderUserBadge();
      toast(t('toast_profile_saved'));
    }catch(e){
      errEl.textContent = (e.body && e.body.error==='username_taken') ? t('err_username_taken')
        : (e.body && e.body.error==='invalid_username') ? t('err_invalid_username') : t('err_save_user');
      errEl.hidden = false;
    }
  };

  // Guardar Cuenta: solo el email. Si cambia, el servidor pide la contraseña actual.
  document.getElementById('stAccountSave').onclick = async ()=>{
    const errEl = document.getElementById('stAccountError');
    errEl.hidden = true;
    const email = document.getElementById('st-email').value.trim();
    const body = { email };
    if(email.toLowerCase() !== (state.user.email||'').toLowerCase()) body.currentPassword = document.getElementById('st-email-password').value;
    try{
      const { user } = await apiPut('/profile', body);
      state.user = user;
      document.getElementById('st-email-password').value = '';
      toast(t('toast_profile_saved'));
    }catch(e){
      const code = e.body && e.body.error;
      errEl.textContent = code==='email_taken' ? t('err_email_taken') : code==='invalid_email' ? t('err_invalid_email')
        : code==='bad_current_password' ? t('err_bad_current_password') : code==='too_many_requests' ? t('err_too_many') : t('err_save_user');
      errEl.hidden = false;
    }
  };

  // Cambiar contraseña: valida fuerza + coincidencia en el cliente, pide la contraseña actual al servidor (que la compara contra el PIN si es una cuenta vieja), y si sale bien limpia los 3 campos (si falla, los deja para que el usuario pueda corregir sin volver a tipear todo).
  document.getElementById('stPasswordSave').onclick = async ()=>{
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
      toast(t('toast_password_changed'));
      document.getElementById('st-current-password').value='';
      document.getElementById('st-new-password').value='';
      document.getElementById('st-new-password2').value='';
    }catch(e){
      const code = e.body && e.body.error;
      errEl.textContent = code==='bad_current_password' ? t('err_bad_current_password') : code==='password_emoji' ? t('err_password_emoji')
        : code==='too_many_requests' ? t('err_too_many') : t('err_weak_password');
      errEl.hidden = false;
    }
  };

  // Cerrar sesión en todos los dispositivos (también este): sirve si se perdió un aparato o se sospecha que alguien entró.
  document.getElementById('stLogoutAll').onclick = async ()=>{
    try{ await apiPost('/auth/logout-all'); }catch(e){ toast(t('err_logout_all')); return; }
    await finishLogout('toast_logged_out_all');
  };
}

