/**
 * ARCHIVO 16 de 16 — Arranque de la app. Es el ÚLTIMO script que carga, a
 * propósito: para este punto, TODO lo de los 14 archivos anteriores ya
 * está definido (funciones, ICONS, I18N, etc.), así que acá ya se puede
 * usar cualquier cosa de la app con seguridad.
 *
 * Primero engancha los botones de navegación que ya están en el HTML
 * desde el vamos (header, footer, tema, idioma), y después corre init():
 * carga tema/idioma guardados, muestra esqueletos de carga, pide todos
 * los datos al servidor (loadAll), carga el reto del día, pinta el badge
 * de usuario, y navega a la vista que corresponda según la URL actual
 * (así, si entrás directo a /explorar o le das F5, cae en esa vista y no
 * siempre en Novedades).
 */
/* ---------- init ---------- */
document.querySelectorAll('.navbtn').forEach(b=> b.addEventListener('click', ()=> goView(b.dataset.view)));
document.querySelectorAll('.footer-link').forEach(b=> b.addEventListener('click', ()=> goView(b.dataset.view)));
// El logo del header lleva al inicio. Es un enlace de verdad (href="/") para poder abrirlo en otra pestaña; un clic normal navega adentro del sitio, sin recargar.
document.getElementById('headerLogo').addEventListener('click', e=>{
  if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  goView('feed');
});
document.getElementById('footerSuggestBtn').addEventListener('click', openSuggestModal);
document.getElementById('newsBackBtn').addEventListener('click', ()=> goView('feed'));
document.getElementById('heroExploreBtn').addEventListener('click', ()=> goView('browse'));
document.getElementById('heroAboutBtn').addEventListener('click', ()=> goView('about'));
document.getElementById('aboutBackBtn').addEventListener('click', ()=> goView('feed'));
document.getElementById('aboutExploreBtn').addEventListener('click', ()=> goView('browse'));
document.getElementById('footerYear').textContent = new Date().getFullYear();
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('langToggle').addEventListener('click', toggleLang);

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
