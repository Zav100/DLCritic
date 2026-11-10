// Efectos al desplazarse por la página (todas las vistas, en cualquier ancho):
//  1. Carga diferida: la imagen de fondo del banner de noticias (a mitad del inicio) solo se pide cuando está cerca de la pantalla y aparece con un fundido.
//     (Las portadas de los juegos ya se piden así, ver coverIO en 03-state-and-utils.js; las fotos de personajes y de otras personas llevan loading="lazy".)
//  2. Aparición suave: los bloques que están por debajo de lo que se ve (tarjetas, títulos de sección, banners...) arrancan transparentes y un poco más abajo, y se
//     animan al llegar a la pantalla; los que ya están a la vista se quedan como están, así un render o una actualización no los hace parpadear.
// Con «reducir movimiento» activado en el sistema, o sin IntersectionObserver, todo se ve de entrada y no se anima nada.
(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;

  /* ---------- 1. carga diferida de imágenes de fondo ---------- */
  const lazyBgs = document.querySelectorAll('[data-lazy-bg]');
  if (lazyBgs.length) {
    if (!canObserve) lazyBgs.forEach(el => el.classList.add('img-loaded'));
    else {
      const bgIO = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        bgIO.unobserve(e.target);
        // se precarga fuera de pantalla y recién entonces se muestra, para que el fundido empiece con la imagen ya lista
        const img = new Image();
        const show = () => e.target.classList.add('img-loaded');
        img.onload = show; img.onerror = show;
        img.src = e.target.dataset.lazyBg;
      }), { rootMargin: '500px 0px' });
      lazyBgs.forEach(el => bgIO.observe(el));
    }
  }

  /* ---------- 2. aparición suave al hacer scroll ---------- */
  if (reduce || !canObserve) return;
  const SELECTOR = '.card, .sectionhead, .hero, .glass-panel, .statsstrip, .taste-row, .flowcard, .home-showcase';
  const SKIP = 'header, .bottom-nav, .confirm-overlay, .lightbox, .verify-banner, .offline-notice, .user-search-panel, .user-menu, .skeleton-card, [data-no-reveal]';
  const DONE_MS = 900; // un poco más que la animación (.6 s + escalonado), para quitar las clases y que vuelvan los estilos propios de cada tarjeta (hover, etc.)

  const revealIO = new IntersectionObserver(entries => {
    entries.filter(e => e.isIntersecting).forEach((e, i) => {
      const el = e.target;
      revealIO.unobserve(el);
      el.style.transitionDelay = Math.min(i, 5) * 70 + 'ms'; // los que entran juntos (una grilla) van en cascada
      requestAnimationFrame(() => el.classList.add('in'));
      setTimeout(() => { el.classList.remove('reveal', 'in'); el.style.transitionDelay = ''; }, DONE_MS + Math.min(i, 5) * 70);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0 }); // threshold 0: con un porcentaje, un bloque altísimo (el panel de noticias) nunca llegaría a mostrarse

  // Marca los bloques nuevos que quedan por debajo de la pantalla. Primero se leen todas las posiciones y después se escriben las clases (así no se fuerza
  // un recálculo de la página por cada bloque).
  function tag(nodes) {
    const vh = window.innerHeight;
    const todo = [];
    nodes.forEach(el => {
      if (el.dataset.rv || el.closest(SKIP)) return;
      el.dataset.rv = '1';
      if (el.parentElement && el.parentElement.closest('.reveal')) return; // dentro de un bloque que ya se anima: lo cubre su animación
      const r = el.getBoundingClientRect();
      const hidden = r.width === 0 && r.height === 0; // la vista todavía no se muestra: se anima cuando aparezca
      if (hidden || r.top > vh * 0.92) todo.push(el);
    });
    todo.forEach(el => { el.classList.add('reveal'); revealIO.observe(el); });
  }
  function collect(root, out) {
    if (root.nodeType !== 1) return;
    if (root.matches(SELECTOR)) out.add(root);
    root.querySelectorAll(SELECTOR).forEach(el => out.add(el));
  }
  let pending = new Set(), scheduled = false;
  new MutationObserver(records => {
    records.forEach(r => r.addedNodes.forEach(n => collect(n, pending)));
    if (pending.size && !scheduled) {
      scheduled = true;
      requestAnimationFrame(() => { const batch = [...pending]; pending = new Set(); scheduled = false; tag(batch); });
    }
  }).observe(document.body, { childList: true, subtree: true });
  const first = new Set(); collect(document.body, first); tag([...first]);

  // Seguro: si algo quedó transparente (p. ej. al imprimir o al volver a la pestaña), se muestra todo.
  const showAll = () => document.querySelectorAll('.reveal').forEach(el => { el.classList.remove('reveal', 'in'); revealIO.unobserve(el); });
  window.addEventListener('beforeprint', showAll);
})();
