// Pantalla de bienvenida: el logo se dibuja en el centro sobre el fondo de la marca (ícono y nombre, con las animaciones de style.css) y, cuando termina, se abre un
// iris de videojuego: un círculo que crece desde el centro, se lleva el logo y deja ver el inicio. Dura unos 3 s. El logo no viaja al header: el del header aparece
// con el inicio, cuando el círculo llega a él.
//
// Cuándo se muestra lo decide el <head> de server/views/index.html, antes del primer dibujo (así la página no parpadea por debajo): solo al
// entrar por el inicio ("/"), una sola vez por sesión y no si el sistema pide "reducir movimiento". Aquí solo se anima, y se puede saltar con un
// clic, un toque o cualquier tecla. Los estilos están al final de public/css/style.css.
(function () {
  const root = document.documentElement;
  const splash = document.getElementById('splash');
  if (!splash) return;
  if (!root.classList.contains('splash-on')) { splash.remove(); return; }
  try { sessionStorage.setItem('dlcSplash', '1'); } catch (e) { /* sin sessionStorage se repite en cada carga: no pasa nada */ }

  const logo = document.getElementById('splashLogo');
  const iris = splash.querySelector('.splash-bg');
  const target = document.getElementById('headerLogo');
  let finished = false, timer = null, anims = [];

  // Cierra la pantalla (al terminar la animación o al saltarla).
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    anims.forEach(a => a.cancel());
    removeEventListener('pointerdown', finish);
    removeEventListener('keydown', finish);
    root.classList.remove('splash-on', 'splash-reveal');
    splash.remove();
  }
  addEventListener('pointerdown', finish);
  addEventListener('keydown', finish);

  // Dónde está el logo real del header y qué tan ancho es su contenido. El de la animación se arma igual (mismas clases, mismo ancho), así que se ve igual de
  // bien al agrandarlo. markWord es el ícono más el nombre, que es lo que se centra y se agranda.
  function headerGeometry() {
    const box = target.getBoundingClientRect();
    const [mark, word] = ['svg', '.logo-word'].map(sel => target.querySelector(sel).getBoundingClientRect());
    return {
      left: box.left, top: box.top,
      width: Math.ceil(Math.max(mark.right, word.right) - box.left) + 2,
      markWord: { left: mark.left, right: Math.max(mark.right, word.right), top: Math.min(mark.top, word.top), bottom: Math.max(mark.bottom, word.bottom) },
    };
  }

  // Pone el logo de la animación centrado y agrandado: ícono y nombre ocupan el 80 % del ancho de la pantalla (hasta 620 px).
  function place() {
    const g = headerGeometry(), m = g.markWord;
    logo.style.left = g.left + 'px';
    logo.style.top = g.top + 'px';
    logo.style.width = g.width + 'px';
    const k = Math.min(innerWidth * 0.8, 620) / (m.right - m.left);
    const cx = (m.left + m.right) / 2 - g.left, cy = (m.top + m.bottom) / 2 - g.top; // centro de "ícono + nombre" dentro del logo
    logo.style.transform = `translate(${innerWidth / 2 - g.left - k * cx}px, ${innerHeight / 2 - g.top - k * cy}px) scale(${k})`;
  }

  // El iris: el logo se desvanece y el agujero del centro crece hasta pasar las esquinas de la pantalla (170vmax de diámetro alcanzan hasta en una pantalla muy alargada).
  function open() {
    if (finished) return;
    root.classList.add('splash-reveal'); // el logo del header deja de estar escondido (queda tapado hasta que el círculo lo alcance)
    anims = [
      logo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-in', fill: 'forwards' }),
      iris.animate([{ width: '0px', height: '0px' }, { width: '170vmax', height: '170vmax' }], { duration: 1000, delay: 150, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' }),
    ];
    anims[1].finished.then(finish, () => { /* cancelada al saltar la animación */ });
    timer = setTimeout(finish, 1300); // por si el navegador no avisa a tiempo del final de la animación (pestaña en segundo plano): la pantalla no se queda tapando la página
  }

  async function run() {
    // El nombre usa la fuente Bungee: se espera a que esté (hasta 0,9 s) para que no aparezca con otra letra y después cambie.
    await Promise.race([document.fonts ? document.fonts.load('22px Bungee') : null, new Promise(resolve => setTimeout(resolve, 900))]).catch(() => {});
    if (finished) return;
    place();
    splash.classList.add('go'); // arranca el dibujo (CSS); a los 1,8 s se abre el iris
    timer = setTimeout(open, 1800);
  }
  run();
})();
