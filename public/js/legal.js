// Idioma y tema de las páginas legales. Lee las mismas preferencias que el sitio (localStorage "lang" y "theme"),
// así que si la persona ya eligió inglés o tema oscuro en el sitio, aquí también.
(function () {
  const ICON = {
    moon: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/></svg>",
    sun: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='5'/><line x1='12' y1='1' x2='12' y2='3'/><line x1='12' y1='21' x2='12' y2='23'/><line x1='4.22' y1='4.22' x2='5.64' y2='5.64'/><line x1='18.36' y1='18.36' x2='19.78' y2='19.78'/><line x1='1' y1='12' x2='3' y2='12'/><line x1='21' y1='12' x2='23' y2='12'/><line x1='4.22' y1='19.78' x2='5.64' y2='18.36'/><line x1='18.36' y1='5.64' x2='19.78' y2='4.22'/></svg>",
  };
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: queda solo para esta visita */ } };

  // Cambio de idioma desactivado por ahora (el botón se oculta en style.css): siempre español. Para volver a ofrecerlo: true aquí y en 02-i18n.js.
  const LANG_SWITCH = false;
  let lang = LANG_SWITCH && read('lang') === 'en' ? 'en' : 'es';
  let theme = read('theme') === 'dark' ? 'dark' : 'light';
  const langBtn = document.getElementById('langToggle');
  const themeBtn = document.getElementById('themeToggle');

  function paint() {
    const root = document.documentElement;
    root.lang = lang;
    root.setAttribute('data-theme', theme);
    document.querySelector('meta[name=theme-color]').setAttribute('content', theme === 'dark' ? '#12111F' : '#F2F2F7');
    document.querySelectorAll('[data-lang]').forEach(el => { el.hidden = el.dataset.lang !== lang; });
    document.title = document.querySelector(`article[data-lang="${lang}"] h1`).textContent + ' — DLCritic';
    langBtn.textContent = lang.toUpperCase();
    themeBtn.innerHTML = theme === 'dark' ? ICON.sun : ICON.moon;
  }

  langBtn.addEventListener('click', () => { lang = lang === 'es' ? 'en' : 'es'; save('lang', lang); paint(); });
  themeBtn.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; save('theme', theme); paint(); });
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  paint();
})();
