/**
 * ARCHIVO 2 de 6 — Pestañas del panel, login de admin, y cliente de API.
 * A diferencia de la app principal, este panel no tiene un sistema de
 * "vistas" con URLs — son 4 secciones (Juegos/Fechas/Noticias/Buzón) que
 * se muestran/esconden con hidden, todas dentro de la misma página.
 */
/* ---- tabs ---- */
document.querySelectorAll('.tabbtn').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.tabbtn').forEach(x=> x.classList.toggle('active', x===b));
    document.getElementById('tabGames').hidden = b.dataset.tab!=='games';
    document.getElementById('tabCharacters').hidden = b.dataset.tab!=='characters';
    document.getElementById('tabDates').hidden = b.dataset.tab!=='dates';
    document.getElementById('tabNews').hidden = b.dataset.tab!=='news';
    document.getElementById('tabInbox').hidden = b.dataset.tab!=='inbox';
  });
});
document.querySelector('.tabbtn[data-tab="games"]').classList.add('active');

/* ---- cliente de API (idéntico en espíritu al de public/js/04-api-theme-rating.js, pero copiado acá porque son dos páginas sin código compartido) ---- */
async function api(path, options){
  const res = await fetch('/api'+path, { headers: options && options.isForm ? {} : {'Content-Type':'application/json'}, ...options });
  let body=null;
  try{ body = await res.json(); }catch(e){}
  if(!res.ok){ const err=new Error((body&&body.error)||'request_failed'); err.status=res.status; err.body=body; throw err; }
  return body;
}
const apiGet = p => api(p);
const apiPost = (p,d) => api(p, { method:'POST', body: JSON.stringify(d||{}) });
const apiPut = (p,d) => api(p, { method:'PUT', body: JSON.stringify(d||{}) });
const apiDelete = p => api(p, { method:'DELETE' });

// Achica una imagen antes de subirla: una foto 4K pesa varios MB y en pantalla no se nota la diferencia, y Vercel rechaza
// los pedidos de más de 4,5 MB. Lado largo máximo maxSide px (nunca agranda) y calidad 0.9; el JPEG sigue siendo JPEG y el
// resto pasa a WebP (conserva la transparencia). Lo que ya es chico y liviano, los GIF (se perderían los cuadros) y
// cualquier fallo devuelven el archivo original sin tocar. Copiada de public/js/04-api-theme-rating.js
// (dos páginas sin código compartido): si se cambia una, cambiar la otra.
async function shrinkImage(file, maxSide = 2000){
  if(file.type === 'image/gif') return file;
  try{
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if(scale === 1 && file.size <= 1024 * 1024){ bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.9));
    // Safari no sabe escribir WebP y devuelve PNG (más pesado): en ese caso, o si no se ganó nada, queda el original.
    if(!blob || blob.type !== type || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + (type === 'image/jpeg' ? '.jpg' : '.webp'), { type });
  }catch(e){ return file; }
}

function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---- login / logout ---- */
// Muestra una de las 3 pantallas grandes: login, "no sos admin" (denied), o el dashboard.
function showView(view){
  document.getElementById('loginView').hidden = view!=='login';
  document.getElementById('setupView').hidden = view!=='setup';
  document.getElementById('deniedView').hidden = view!=='denied';
  document.getElementById('dashView').hidden = view!=='dash';
}

document.getElementById('loginBtn').onclick = async ()=>{
  const errEl = document.getElementById('loginError');
  errEl.hidden = true;
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('loginRemember').checked;
  const codeField = document.getElementById('loginCodeField');
  try{
    // POST /api/auth/login espera { identifier, password }: el identifier es el correo o el usuario (el servidor distingue por la @;
    // las cuentas viejas, de la época del PIN, entran con su usuario y su PIN). remember es la casilla "Recordar este dispositivo".
    // code (el de la app de autenticación o uno de recuperación) solo va cuando la cuenta tiene verificación en dos pasos.
    const body = { identifier: username, password, remember };
    if(!codeField.hidden) body.code = document.getElementById('loginCode').value.trim();
    const { user } = await apiPost('/auth/login', body);
    state.user = user;
    codeField.hidden = true; document.getElementById('loginCode').value = '';
    await afterLogin();
  }catch(e){
    const code = e.body && e.body.error;
    if(code==='two_factor_required'){ // la contraseña estaba bien: falta el código
      codeField.hidden = false;
      document.getElementById('loginCode').focus();
      errEl.textContent = 'Ingresa el código de verificación.'; errEl.hidden = false;
      return;
    }
    if(code==='bad_login'){ codeField.hidden = true; document.getElementById('loginCode').value = ''; }
    errEl.textContent = code==='bad_code' ? 'Código incorrecto o ya usado.' : e.status===401 ? 'Usuario o contraseña incorrectos.' : e.status===429 ? 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' : 'Error al iniciar sesión.';
    errEl.hidden = false;
  }
};
['loginPassword', 'loginCode'].forEach(id=> document.getElementById(id).addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('loginBtn').click(); }));

/* ---- activar la verificación en dos pasos (obligatoria para entrar al panel) ---- */
function showSetupStep(step){
  ['setupStart','setupKey','setupDone'].forEach(id=> document.getElementById(id).hidden = id!==step);
  document.getElementById('setupError').hidden = true;
}
function showSetup(){
  document.getElementById('setupPassword').value = '';
  document.getElementById('setupCode').value = '';
  showSetupStep('setupStart');
  showView('setup');
}
function setupFail(msg){ const el = document.getElementById('setupError'); el.textContent = msg; el.hidden = false; }
async function copyText(text, btn){
  try{ await navigator.clipboard.writeText(text); const old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(()=>{ btn.textContent = old; }, 1500); }
  catch(e){ setupFail('No se pudo copiar: selecciónalo con el mouse y cópialo.'); }
}

document.getElementById('setupStartBtn').onclick = async ()=>{
  document.getElementById('setupError').hidden = true;
  try{
    const { secret, otpauthUri } = await apiPost('/admin/2fa/setup', { currentPassword: document.getElementById('setupPassword').value });
    state.setupSecret = secret;
    document.getElementById('setupSecret').textContent = secret.match(/.{1,4}/g).join(' '); // en grupos de 4 se lee mejor
    document.getElementById('setupOpenLink').href = otpauthUri; // en el teléfono, abre la app de autenticación con la cuenta ya cargada
    showSetupStep('setupKey');
    document.getElementById('setupCode').focus();
  }catch(e){
    setupFail(e.body && e.body.error==='bad_current_password' ? 'La contraseña es incorrecta.' : e.status===429 ? 'Demasiados intentos. Espera unos minutos.' : e.body && e.body.error==='already_enabled' ? 'La verificación ya está activada: vuelve a iniciar sesión.' : 'No se pudo empezar. Intenta de nuevo.');
  }
};
document.getElementById('setupCopyKeyBtn').onclick = e=> copyText(state.setupSecret || '', e.currentTarget);
document.getElementById('setupEnableBtn').onclick = async ()=>{
  document.getElementById('setupError').hidden = true;
  try{
    const { recoveryCodes } = await apiPost('/admin/2fa/enable', { code: document.getElementById('setupCode').value.trim() });
    state.user.twoFactor = true;
    state.setupSecret = null;
    document.getElementById('setupRecovery').textContent = recoveryCodes.join('\n');
    document.getElementById('setupSaved').checked = false;
    document.getElementById('setupContinueBtn').disabled = true;
    showSetupStep('setupDone');
  }catch(e){
    setupFail(e.body && e.body.error==='bad_code' ? 'Ese código no coincide. Revisa que sea el de DLCritic y que la hora del teléfono sea automática.' : e.status===429 ? 'Demasiados intentos. Espera unos minutos.' : 'No se pudo activar. Intenta de nuevo.');
  }
};
document.getElementById('setupCode').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('setupEnableBtn').click(); });
document.getElementById('setupCopyRecoveryBtn').onclick = e=> copyText(document.getElementById('setupRecovery').textContent, e.currentTarget);
document.getElementById('setupSaved').onchange = e=>{ document.getElementById('setupContinueBtn').disabled = !e.target.checked; };
document.getElementById('setupContinueBtn').onclick = ()=>{ document.getElementById('setupRecovery').textContent = ''; afterLogin(); };
document.getElementById('setupLogoutBtn').onclick = ()=> doLogout();

// Cierra sesión y vuelve a la pantalla de login (se usa desde el botón "Salir" normal y desde la pantalla de "acceso denegado").
async function doLogout(){
  try{ await apiPost('/auth/logout'); }catch(e){}
  state.user = null;
  showView('login');
}
document.getElementById('logoutBtn').onclick = doLogout;
document.getElementById('deniedLogoutBtn').onclick = doLogout;

// Después de un login exitoso (o al arrancar la página, si ya había sesión): si no sos admin te frena en la pantalla de "denied", si sos admin carga los 4 conjuntos de datos del dashboard.
async function afterLogin(){
  if(!state.user){ showView('login'); return; }
  if(!state.user.isAdmin){ showView('denied'); return; }
  if(!state.user.twoFactor){ showSetup(); return; } // sin verificación en dos pasos el servidor no deja abrir el panel
  document.getElementById('whoami').textContent = state.user.username;
  showView('dash');
  await loadGames();
  await loadCharacters();
  await loadDates();
  await loadNews();
  await loadSuggestions();
}

// Checkbox "Destacar en Juegos nuevos" del formulario de juego: muestra/esconde el campo de fecha de lanzamiento que solo tiene sentido si está tildado.
document.getElementById('f-new-release').addEventListener('change', (e)=>{
  document.getElementById('newReleaseDateField').hidden = !e.target.checked;
});

