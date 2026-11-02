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

function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---- login / logout ---- */
// Muestra una de las 3 pantallas grandes: login, "no sos admin" (denied), o el dashboard.
function showView(view){
  document.getElementById('loginView').hidden = view!=='login';
  document.getElementById('deniedView').hidden = view!=='denied';
  document.getElementById('dashView').hidden = view!=='dash';
}

document.getElementById('loginBtn').onclick = async ()=>{
  const errEl = document.getElementById('loginError');
  errEl.hidden = true;
  const username = document.getElementById('loginUser').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  try{
    // POST /api/auth/login espera { identifier, password } (así lo usa el
    // login de la app principal, que acepta email O usuario); acá se le
    // manda el usuario como identifier y el PIN de admin como password —
    // el servidor los valida igual (pin_hash sirve tanto para un PIN
    // viejo como para una contraseña nueva). Los admins siguen siendo
    // cuentas con usuario+PIN, no tienen email.
    const { user } = await apiPost('/auth/login', { identifier: username, password: pin });
    state.user = user;
    await afterLogin();
  }catch(e){
    errEl.textContent = e.status===401 ? 'Usuario o PIN incorrectos.' : 'Error al iniciar sesión.';
    errEl.hidden = false;
  }
};
document.getElementById('loginPin').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('loginBtn').click(); });

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

