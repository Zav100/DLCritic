// Página /restablecer: elige la contraseña nueva con el token que llegó por correo. El idioma y el tema los maneja legal.js (esta página usa sus mismos estilos).
// Las reglas de la contraseña las valida el servidor (server/index.js, passwordProblem): aquí solo se muestra lo que responde.
(function () {
  const MSG = {
    es: {
      mismatch: 'Las contraseñas no coinciden.',
      weak_password: 'La contraseña debe tener al menos 8 caracteres, con una mayúscula, un número y un carácter especial (como ! o *).',
      password_emoji: 'La contraseña no puede tener emojis.',
      common_password: 'Esa contraseña es demasiado común. Elige otra.',
      too_many_requests: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
      fail: 'No se pudo cambiar la contraseña. Intenta de nuevo.',
    },
    en: {
      mismatch: "The passwords don't match.",
      weak_password: 'Password must be at least 8 characters, with an uppercase letter, a number and a special character (like ! or *).',
      password_emoji: "The password can't contain emojis.",
      common_password: 'That password is too common. Choose another one.',
      too_many_requests: 'Too many attempts. Wait a few minutes and try again.',
      fail: "Couldn't change the password. Try again.",
    },
  };
  const $ = id => document.getElementById(id);
  const text = key => MSG[document.documentElement.lang === 'en' ? 'en' : 'es'][key] || MSG.es.fail;
  const show = which => {
    ['resetForm', 'resetDone', 'resetInvalid'].forEach(id => { $(id).hidden = id !== which; });
    document.querySelectorAll('.reset-intro').forEach(p => { p.hidden = which !== 'resetForm'; }); // la introducción solo va con el formulario
  };

  // El token se lee una vez y se saca de la barra de direcciones y del historial.
  const token = new URLSearchParams(location.search).get('token') || '';
  history.replaceState(null, '', location.pathname);
  if (!/^[0-9a-f]{64}$/.test(token)) show('resetInvalid');

  $('resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('resetError');
    err.hidden = true;
    const newPassword = $('newPassword').value;
    if (newPassword !== $('newPassword2').value) { err.textContent = text('mismatch'); err.hidden = false; return; }
    $('resetBtn').disabled = true;
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, lang: document.documentElement.lang === 'en' ? 'en' : 'es' }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { show('resetDone'); return; }
      if (body.error === 'invalid_token') { show('resetInvalid'); return; }
      err.textContent = text(res.status === 429 ? 'too_many_requests' : body.error);
      err.hidden = false;
    } catch (e2) {
      err.textContent = text('fail');
      err.hidden = false;
    } finally {
      $('resetBtn').disabled = false;
    }
  });
})();
