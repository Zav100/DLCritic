// Página /verificar: confirma el correo con el token que llegó por correo. El idioma y el tema los maneja legal.js (esta página usa sus mismos estilos).
// Se confirma apenas carga la página (con un POST, no con el GET del enlace): así los programas que abren los enlaces de los correos para revisarlos no lo gastan.
(function () {
  const $ = id => document.getElementById(id);
  const show = which => ['verifyLoading', 'verifyDone', 'verifyInvalid'].forEach(id => { $(id).hidden = id !== which; });

  // El token se lee una vez y se saca de la barra de direcciones y del historial.
  const token = new URLSearchParams(location.search).get('token') || '';
  history.replaceState(null, '', location.pathname);
  if (!/^[0-9a-f]{64}$/.test(token)) { show('verifyInvalid'); return; }

  fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    .then(res => show(res.ok ? 'verifyDone' : 'verifyInvalid'), () => show('verifyInvalid'));
})();
