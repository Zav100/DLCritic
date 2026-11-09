// Barra «Nivel de seguridad» de las contraseñas (registro, Ajustes y /restablecer). Es solo una recomendación: lo que el servidor exige de verdad
// (largo, sin emojis, que no sea una común) está en server/index.js, passwordProblem. Se carga en el sitio y en la página de restablecer.

// 'low' | 'mid' | 'high' (o null si no hay nada escrito). Suma puntos por el largo y por mezclar minúsculas, mayúsculas, números y símbolos;
// con menos de 5 caracteres distintos («aaaaaaaaaaaa», «Ab1!Ab1!») queda siempre en bajo.
function passwordStrength(p) {
  if (!p) return null;
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter(re => re.test(p)).length;
  if (new Set(p).size < 5) return 'low';
  const len = [...p].length;
  const pts = (len >= 16 ? 4 : len >= 12 ? 3 : len >= 8 ? 1 : 0) + (kinds >= 3 ? 2 : kinds >= 2 ? 1 : 0);
  return pts >= 5 ? 'high' : pts >= 3 ? 'mid' : 'low';
}

// Muestra la barra en `meter` (un <div class="pw-meter" hidden> vacío) y la actualiza mientras se escribe en `input`.
// `say(clave)` devuelve el texto de 'pw_title', 'pw_low', 'pw_mid', 'pw_high' y 'pw_tip' en el idioma de la página.
function bindPasswordMeter(input, meter, say) {
  meter.innerHTML = '<div class="pw-bars" aria-hidden="true"><i></i><i></i><i></i></div>'
    + '<p class="pw-text" aria-live="polite"><span></span> <b></b></p><p class="pw-tip"></p>';
  const title = meter.querySelector('.pw-text span'), value = meter.querySelector('.pw-text b'), tip = meter.querySelector('.pw-tip');
  let last = null;
  const render = () => {
    const level = passwordStrength(input.value);
    meter.hidden = !level;
    if (!level) { last = null; return; }
    meter.dataset.level = level;
    tip.hidden = level === 'high';
    if (level === last) return; // el texto solo se cambia al cambiar de nivel (los lectores de pantalla lo leen una vez)
    last = level;
    title.textContent = say('pw_title') + ':';
    value.textContent = say('pw_' + level);
    tip.textContent = say('pw_tip');
  };
  input.oninput = render; // asignada (no addEventListener) para que volver a dibujar el formulario no la duplique
  render();
}
