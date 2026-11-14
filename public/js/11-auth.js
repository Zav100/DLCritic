/**
 * ARCHIVO 11 de 16 — Login y registro (vista "/cuenta").
 *
 * El login es un solo paso (email o usuario + contraseña). El registro es
 * DOS pasos en la misma vista, sin recargar página:
 *   Paso 1 (authRegisterStep1): email + contraseña + confirmar.
 *   Paso 2 (authRegisterStep2): usuario, foto (opcional), bio, redes.
 * Recién al confirmar el paso 2 se manda TODO junto a POST /api/auth/register
 * (el paso 1 solo valida en el cliente, no pega al servidor todavía). Si
 * el usuario cargó una foto, se sube en un segundo pedido separado
 * DESPUÉS de crear la cuenta (porque subir la foto requiere sesión
 * iniciada, y la cuenta recién se crea en ese momento).
 *
 * Nota sobre cuentas viejas: usuarios que ya existían antes de que hubiera
 * contraseñas (creados con PIN de 4 dígitos) siguen entrando con usuario+PIN
 * sin que se les obligue a cambiar nada — el servidor trata el PIN como si
 * fuera la contraseña. Ver server/index.js (endpoint /api/auth/login) y
 * 12-settings.js (ahí pueden cambiarlo a una contraseña real si quieren).
 */
/* ---------- auth ---------- */
// Misma regla que valida el servidor (server/index.js): de 8 a 200 caracteres, sin emojis (mayúsculas, números y símbolos se recomiendan con la barra de seguridad, no se exigen). Se valida aquí TAMBIÉN en el cliente para dar el error al instante, sin esperar la ida y vuelta al servidor — pero el servidor la vuelve a chequear igual, nunca hay que confiar solo en la validación del cliente.
// Sin emojis (misma regla que EMOJI_RE en server/index.js): cualquier carácter con aspecto de emoji, tonos de piel, banderas, ZWJ y selector de emoji; © ® ™ valen.
const EMOJI_RE_CLIENT = /(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200D\uFE0F\u20E3]/u;
// Devuelve la clave del texto de error de una contraseña rechazada, o null si sirve.
function passwordProblemClient(p){ return EMOJI_RE_CLIENT.test(p) ? 'err_password_emoji' : isStrongPasswordClient(p) ? null : 'err_weak_password'; }
function isStrongPasswordClient(p){ return typeof p==='string' && p.length>=8 && p.length<=200; }
let registerAvatarFile = null; // el File elegido en el paso 2 del registro, o null; se sube recién después de crear la cuenta (ver handleRegisterSubmit)
// Muestra el paso 1 o el paso 2 del formulario de registro (los dos <div> ya existen en el HTML, esto solo cambia cuál está oculto).
function showRegisterStep(step){
  state.authStep = step;
  document.getElementById('authRegisterStep1').hidden = step!==1;
  document.getElementById('authRegisterStep2').hidden = step!==2;
  refreshGoogleAuth();
}
// Arma los campos de redes sociales del paso 2 (uno por cada red en SOCIAL_KEYS) y resetea el preview de avatar al ícono genérico. Se llama cada vez que se entra a la pestaña de registro.
function renderRegisterStep2Fields(){
  document.getElementById('registerSocialRow').innerHTML = SOCIAL_KEYS.map(k=>`
    <div class="field" style="min-width:150px;">
      <label for="r-social-${k}" style="font-weight:400; text-transform:none; font-size:11px;">${esc(SOCIAL_META[k].name)}</label>
      <input type="text" id="r-social-${k}" placeholder="https://…">
    </div>
  `).join('');
  document.getElementById('registerAvatarPreview').innerHTML = ICONS.user;
}
// Los enlaces a redes tienen que empezar con http:// o https://. El servidor descarta en silencio los que no, y la pantalla igual decía "guardado".
function hasBadSocialLink(links){ return Object.values(links).some(v=> !/^https?:\/\/\S+$/i.test(v)); }
// Cambia entre la pestaña "Iniciar sesión" y "Registrarme" de la vista /cuenta, reseteando el registro al paso 1 y limpiando errores visibles.
function setAuthTab(tab){
  state.authTab=tab;
  if(state.view==='auth') document.title = titleForView('auth'); // el título sigue a la pestaña (Iniciar sesión / Registrarme)
  state.authStep=1;
  for(const [id, t] of [['tabLogin','login'], ['tabRegister','register']]){
    const el = document.getElementById(id);
    el.classList.toggle('active', tab===t);
    el.setAttribute('aria-selected', tab===t);
  }
  document.getElementById('authLoginFields').hidden = tab!=='login';
  document.getElementById('authForgot').hidden = true;
  document.getElementById('authRegisterStep1').hidden = tab!=='register';
  document.getElementById('authRegisterStep2').hidden = true;
  document.getElementById('authError').hidden=true;
  document.getElementById('registerStep1Error').hidden=true;
  if(tab==='register') renderRegisterStep2Fields();
  refreshGoogleAuth();
}
// El botón «Continuar con Google» (y su aviso de términos) solo se muestra si el servidor tiene configurado el inicio de sesión con Google (/api/auth/me lo avisa),
// en las dos pestañas, y solo en el primer paso del registro. Con él a la vista la tarjeta es del doble de ancho (formulario a la izquierda, Google a la derecha). Lleva el idioma para los correos que pueda mandar el servidor.
function refreshGoogleAuth(){
  const box = document.getElementById('googleAuth');
  if(!box) return;
  box.hidden = !state.googleLogin || (state.authTab==='register' && state.authStep!==1) || !document.getElementById('authForgot').hidden;
  document.getElementById('authCard').classList.toggle('has-google', !box.hidden);
  document.getElementById('googleBtn').href = '/api/auth/google/start?next=/&lang=' + (state.lang==='en' ? 'en' : 'es');
}
// Al volver de Google con un error, /cuenta?google=error&reason=... : se muestra el motivo en la pestaña de iniciar sesión y se limpia la dirección.
// Las pestañas se enganchan aquí y no con onclick="" en el HTML: la Content-Security-Policy (server/index.js) no permite código en los atributos.
document.getElementById('tabLogin').onclick = ()=> setAuthTab('login');
document.getElementById('tabRegister').onclick = ()=> setAuthTab('register');
function showGoogleReturn(){
  const q = new URLSearchParams(location.search);
  if(q.get('google')!=='error') return;
  history.replaceState(null, '', location.pathname);
  setAuthTab('login');
  const errEl = document.getElementById('authError');
  errEl.textContent = t({ denied:'auth_google_denied', expired:'auth_google_expired', unverified_email:'auth_google_unverified', two_factor:'auth_google_two_factor', not_configured:'auth_google_not_configured' }[q.get('reason')] || 'auth_google_failed');
  errEl.hidden = false;
}
// Reenvía el enlace para confirmar el correo (desde el aviso de arriba y desde Ajustes); el servidor deja 3 por hora.
async function resendVerification(){
  try{ await apiPost('/auth/verify-email/resend', { lang: state.lang }); toast(t('toast_verify_sent'), 'good'); }
  catch(e){ toast(t(e.body && e.body.error==='too_many_requests' ? 'err_too_many' : 'err_save_user'), 'bad'); }
}
// Prepara la vista /cuenta desde cero cada vez que se entra a ella: limpia todos los campos de los 2 formularios, vuelve a la pestaña que estaba activa, y engancha todos los botones/inputs (incluido el preview de la foto elegida en el paso 2).
function renderAuthForm(){
  document.getElementById('a-identifier').value='';
  document.getElementById('a-password').value='';
  document.getElementById('a-remember').checked=false;
  document.getElementById('aCodeField').hidden=true;
  document.getElementById('a-code').value='';
  document.getElementById('r-email').value='';
  document.getElementById('r-password').value='';
  document.getElementById('r-password2').value='';
  bindPasswordMeter(document.getElementById('r-password'), document.getElementById('r-pwMeter'), t);
  document.getElementById('r-username').value='';
  document.getElementById('r-bio').value='';
  document.getElementById('r-avatar-file').value='';
  document.getElementById('r-terms').checked=false;
  registerAvatarFile = null;
  setAuthTab(state.authTab||'login');
  showGoogleReturn();
  document.getElementById('authSubmit').onclick = handleLogin;
  document.getElementById('authForgotLink').onclick = showForgot;
  document.getElementById('forgotSubmit').onclick = handleForgot;
  document.getElementById('forgotBack').onclick = hideForgot;
  document.getElementById('f-email').value = '';
  document.getElementById('authForgot').hidden = true;
  document.getElementById('registerStep1Next').onclick = handleRegisterStep1Next;
  document.getElementById('registerStep2Back').onclick = ()=> showRegisterStep(1);
  document.getElementById('registerStep2Submit').onclick = handleRegisterSubmit;
  document.getElementById('r-avatar-file').onchange = (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    registerAvatarFile = file;
    const reader = new FileReader();
    reader.onload = ()=>{ document.getElementById('registerAvatarPreview').innerHTML = `<img src="${reader.result}">`; };
    reader.readAsDataURL(file);
  };
}
// Pasos comunes a "login exitoso" y "registro exitoso": guardar el usuario en el estado, cargar el progreso del reto del día y las notificaciones, refrescar el badge del header, y mandar a la vista principal.
async function afterAuthSuccess(user){
  state.user = user;
  await loadDailyState();
  try{ const r=await apiGet('/notifications'); state.notifications = r.notifications; }catch(e){ state.notifications=[]; }
  renderUserBadge();
  goView('feed');
}
// "¿Olvidaste tu contraseña?": cambia el login por el pedido del enlace (y vuelve). El servidor responde lo mismo exista o no el correo, así que el mensaje también.
function showForgot(){
  document.getElementById('authLoginFields').hidden = true;
  document.getElementById('authForgot').hidden = false;
  refreshGoogleAuth();
  document.getElementById('forgotError').hidden = true;
  document.getElementById('forgotSent').hidden = true;
  const typed = document.getElementById('a-identifier').value.trim();
  if(typed.includes('@')) document.getElementById('f-email').value = typed;
  document.getElementById('f-email').focus();
}
function hideForgot(){
  document.getElementById('authForgot').hidden = true;
  document.getElementById('authLoginFields').hidden = false;
  refreshGoogleAuth();
}
async function handleForgot(){
  const errEl = document.getElementById('forgotError'), sentEl = document.getElementById('forgotSent'), btn = document.getElementById('forgotSubmit');
  errEl.hidden = true; sentEl.hidden = true;
  const email = document.getElementById('f-email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errEl.textContent = t('err_invalid_email'); errEl.hidden = false; return; }
  btn.disabled = true;
  try{
    await apiPost('/auth/forgot', { email, lang: state.lang });
    sentEl.textContent = t('auth_forgot_sent'); sentEl.hidden = false;
  }catch(e){
    errEl.textContent = e.body && e.body.error==='too_many_requests' ? t('err_too_many') : t(e.body && e.body.error==='invalid_email' ? 'err_invalid_email' : 'err_forgot');
    errEl.hidden = false;
  }finally{ btn.disabled = false; }
}
// Botón "Entrar" del login. El campo `identifier` acepta tanto un email (cuentas nuevas) como un nombre de usuario (cuentas viejas con PIN) — el servidor decide cuál es cuál.
async function handleLogin(){
  const errEl=document.getElementById('authError');
  errEl.hidden=true;
  const identifier = document.getElementById('a-identifier').value.trim();
  const password = document.getElementById('a-password').value;
  if(!identifier || !password){ errEl.textContent=t('err_bad_login'); errEl.hidden=false; return; }
  const ERR_MSG = { bad_login:'err_bad_login', bad_code:'err_bad_code', too_many_requests:'err_too_many' };
  const codeField = document.getElementById('aCodeField');
  let user;
  try{
    // code (de la app de autenticación o de recuperación) solo va si la cuenta tiene verificación en dos pasos: el servidor avisa con two_factor_required.
    const body = { identifier, password, remember: document.getElementById('a-remember').checked };
    if(!codeField.hidden) body.code = document.getElementById('a-code').value.trim();
    ({ user } = await apiPost('/auth/login', body));
  }catch(e){
    const code = e.body && e.body.error;
    if(code==='two_factor_required'){ codeField.hidden=false; document.getElementById('a-code').focus(); errEl.textContent=t('err_two_factor_required'); errEl.hidden=false; return; }
    if(code==='bad_login'){ codeField.hidden=true; document.getElementById('a-code').value=''; }
    errEl.textContent = t(ERR_MSG[code] || 'err_bad_login'); errEl.hidden=false; return;
  }
  toast(t('toast_welcome_back')+' '+user.username+'!');
  await afterAuthSuccess(user);
}
// Botón "Continuar" del paso 1 del registro: valida formato de email, fuerza de contraseña, y que las dos contraseñas coincidan — TODO en el cliente, sin pegarle al servidor todavía. Si pasa, muestra el paso 2.
function handleRegisterStep1Next(){
  const errEl = document.getElementById('registerStep1Error');
  errEl.hidden = true;
  const email = document.getElementById('r-email').value.trim();
  const password = document.getElementById('r-password').value;
  const password2 = document.getElementById('r-password2').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errEl.textContent=t('err_invalid_email'); errEl.hidden=false; return; }
  const pwProblem = passwordProblemClient(password);
  if(pwProblem){ errEl.textContent=t(pwProblem); errEl.hidden=false; return; }
  if(password!==password2){ errEl.textContent=t('err_password_mismatch'); errEl.hidden=false; return; }
  showRegisterStep(2);
}
// Botón "Crear cuenta" del paso 2: junta los datos de LOS DOS pasos y
// crea la cuenta en un solo pedido. Si hay una foto elegida, la sube
// después (en un segundo pedido) — si esa subida falla, no revierte la
// creación de la cuenta, solo se queda sin foto (se puede agregar después
// desde Ajustes).
async function handleRegisterSubmit(){
  const errEl = document.getElementById('registerStep2Error');
  errEl.hidden = true;
  const email = document.getElementById('r-email').value.trim();
  const password = document.getElementById('r-password').value;
  const username = document.getElementById('r-username').value.trim();
  const bio = document.getElementById('r-bio').value.trim();
  if(username.length<3){ errEl.textContent=t('err_username_len'); errEl.hidden=false; return; }
  if(!document.getElementById('r-terms').checked){ errEl.textContent=t('err_terms_required'); errEl.hidden=false; return; }
  const socialLinks = {};
  SOCIAL_KEYS.forEach(k=>{ const el=document.getElementById('r-social-'+k); const v=el?el.value.trim():''; if(v) socialLinks[k]=v; });
  if(hasBadSocialLink(socialLinks)){ errEl.textContent=t('err_social_link'); errEl.hidden=false; return; }

  const ERR_MSG = { username_taken:'err_username_taken', email_taken:'err_email_taken', invalid_email:'err_invalid_email', weak_password:'err_weak_password', password_emoji:'err_password_emoji', common_password:'err_common_password', invalid_username:'err_invalid_username', terms_required:'err_terms_required', too_many_requests:'err_too_many' };
  let user;
  try{
    ({ user } = await apiPost('/auth/register', { email, password, username, bio, socialLinks, acceptTerms: true, lang: state.lang }));
  }catch(e){ errEl.textContent = t(ERR_MSG[e.body&&e.body.error] || 'err_bad_login'); errEl.hidden=false; return; }
  if(registerAvatarFile){
    try{
      const fd = new FormData();
      fd.append('image', await shrinkImage(registerAvatarFile, 1000));
      const r = await api('/profile/avatar', { method:'POST', body: fd, isForm:true });
      user = r.user;
    }catch(e){ /* avatar upload failing shouldn't block account creation */ }
  }
  toast(t('toast_account_created')+' '+username, 'good');
  await afterAuthSuccess(user);
}

