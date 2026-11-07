// Pantalla de bienvenida: el logo se dibuja en el centro sobre el fondo de la marca y, cuando termina, viaja hasta el lugar exacto que ocupa en el
// header mientras el fondo se disuelve y deja ver el inicio. Dura unos 2,5 s. El logo no desaparece: termina siendo el del header.
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
  const bg = splash.querySelector('.splash-bg');
  const target = document.getElementById('headerLogo');
  let finished = false, timer = null, flight = null, origin = null;

  // Cierra la pantalla (al terminar la animación o al saltarla). Primero se vuelve a mostrar el logo real del header y en el mismo momento se
  // saca el de la animación, que a esa altura está justo encima: no se nota el cambio.
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (flight) flight.cancel();
    removeEventListener('pointerdown', finish);
    removeEventListener('keydown', finish);
    root.classList.remove('splash-on');
    splash.remove();
  }
  addEventListener('pointerdown', finish);
  addEventListener('keydown', finish);

  // Dónde está el logo real del header y qué tan ancho es su contenido. El de la animación se arma igual (mismas clases, mismo ancho, mismo
  // lugar), así que al aterrizar los dos son idénticos. markWord es el ícono más el nombre, que es lo que se centra y se agranda al principio.
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
    origin = { left: g.left, top: g.top };
    logo.style.left = g.left + 'px';
    logo.style.top = g.top + 'px';
    logo.style.width = g.width + 'px';
    const k = Math.min(innerWidth * 0.8, 620) / (m.right - m.left);
    const cx = (m.left + m.right) / 2 - g.left, cy = (m.top + m.bottom) / 2 - g.top; // centro de "ícono + nombre" dentro del logo
    logo.style.transform = `translate(${innerWidth / 2 - g.left - k * cx}px, ${innerHeight / 2 - g.top - k * cy}px) scale(${k})`;
  }

  // El viaje al header: el logo se achica y se desliza hasta su lugar y el fondo se disuelve.
  function fly() {
    if (finished) return;
    const g = headerGeometry(); // se mide de nuevo: mientras tanto pudo cambiar un poco (fuentes, idioma)
    const to = `translate(${g.left - origin.left}px, ${g.top - origin.top}px) scale(1)`;
    flight = logo.animate([{ transform: logo.style.transform }, { transform: to }], { duration: 750, easing: 'cubic-bezier(.7, 0, .25, 1)', fill: 'forwards' });
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: 150, easing: 'ease-out', fill: 'forwards' });
    flight.finished.then(finish, () => { /* cancelada al saltar la animación */ });
  }

  async function run() {
    // El nombre usa la fuente Bungee: se espera a que esté (hasta 0,9 s) para que no aparezca con otra letra y después cambie.
    await Promise.race([document.fonts ? document.fonts.load('22px Bungee') : null, new Promise(resolve => setTimeout(resolve, 900))]).catch(() => {});
    if (finished) return;
    place();
    splash.classList.add('go'); // arranca el dibujo (CSS); a los 1,7 s empieza el viaje
    timer = setTimeout(fly, 1700);
  }
  run();
})();
