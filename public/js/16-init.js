/**
 * ARCHIVO 16 de 16 — Arranque de la app. Es el ÚLTIMO script que carga, a
 * propósito: para este punto, TODO lo de los 14 archivos anteriores ya
 * está definido (funciones, ICONS, I18N, etc.), así que aquí ya se puede
 * usar cualquier cosa de la app con seguridad.
 *
 * Primero engancha los botones de navegación que ya están en el HTML
 * desde el vamos (header, footer, tema, idioma), y después corre init():
 * carga tema/idioma guardados, muestra esqueletos de carga, pide todos
 * los datos al servidor (loadAll), carga el reto del día, pinta el badge
 * de usuario, y navega a la vista que corresponda según la URL actual
 * (así, si entras directo a /explorar o le das F5, cae en esa vista y no
 * siempre en Novedades).
 */
/* ---------- init ---------- */
document.querySelectorAll('.navbtn').forEach(b=> b.addEventListener('click', spa(()=> goView(b.dataset.view))));
document.querySelectorAll('.footer-link').forEach(b=> b.addEventListener('click', spa(()=> goView(b.dataset.view))));
// El logo del header lleva al inicio. Es un enlace de verdad (href="/") para poder abrirlo en otra pestaña; un clic normal navega adentro del sitio, sin recargar.
document.getElementById('headerLogo').addEventListener('click', e=>{
  if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  goView('feed');
});
document.getElementById('footerSuggestBtn').addEventListener('click', openSuggestModal);
document.getElementById('newsBackBtn').addEventListener('click', spa(()=> goView('feed')));
document.getElementById('heroExploreBtn').addEventListener('click', spa(()=> goView('browse')));
document.getElementById('heroAboutBtn').addEventListener('click', spa(()=> goView('about')));
document.getElementById('aboutBackBtn').addEventListener('click', spa(()=> goView('feed')));
document.getElementById('aboutExploreBtn').addEventListener('click', spa(()=> goView('browse')));
document.getElementById('footerYear').textContent = new Date().getFullYear();
// Al volver a esta pestaña (o a la ventana) se refrescan los datos por si cambiaron mientras no se miraba; refreshData() ya limita la frecuencia.
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshData(); });
window.addEventListener('focus', refreshData);
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('langToggle').addEventListener('click', toggleLang);
initUserSearch();

// Sin conexión: mientras no hay internet un aviso arriba lo dice (lo que se ve puede no estar al día) y, al volver, dice «Conexión recuperada» un momento y se traen los
// datos de nuevo. Si se recarga o se abre el sitio sin internet, el service worker (public/sw.js) muestra la pantalla public/offline.html.
function setupConnectionNotice(){
  const box = document.getElementById('offlineNotice');
  let timer = null;
  const show = (key, kind)=>{ clearTimeout(timer); box.textContent = t(key); box.className = 'offline-notice ' + kind; box.hidden = false; };
  const goOffline = ()=> show('offline_notice', 'is-offline');
  const goOnline = ()=>{ show('online_back', 'is-online'); timer = setTimeout(()=>{ box.hidden = true; }, 2500); refreshData(); };
  window.addEventListener('offline', goOffline);
  window.addEventListener('online', goOnline);
  if(!navigator.onLine) goOffline();
}
setupConnectionNotice();
document.getElementById('verifyResendBtn').onclick = resendVerification;
document.getElementById('verifyBannerClose').onclick = ()=>{ try{ sessionStorage.setItem('dlcVerifyBannerOff', '1'); }catch(e){} document.getElementById('verifyBanner').hidden = true; };
if('serviceWorker' in navigator) window.addEventListener('load', ()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{ /* sin service worker no hay pantalla sin conexión propia: no pasa nada más */ }); });

// Secuencia de arranque, en orden: tema y idioma primero (para que no haya parpadeo visual), esqueletos de carga, después los datos reales, y recién al final se decide y pinta la vista.
(async function init(){
  setupTipsRails();
  loadTheme();
  loadLang();
  applyI18n();
  renderSkeletonGrids();
  await loadAll();
  await loadDailyState();
  renderUserBadge();
  goView(routeFromLocation());
})();
