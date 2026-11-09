// Solo los campos de correo y contraseña pueden rellenarse solos (con lo que el navegador o el gestor de contraseñas tenga guardado).
// Todos los demás —nombre de perfil, descripción, buscadores, enlaces, códigos...— se marcan para que no se rellenen ni sugieran nada,
// y esto vale también para los que la página dibuja después (ajustes, ventanas, listas...): por eso se vigila el documento.
//
// Se salvan los campos de tipo email y password y el correo del inicio de sesión (el que lleva autocomplete="username": si no, el
// gestor de contraseñas no sabría a qué cuenta pertenece la contraseña). Por eso el nombre de perfil del registro NO lleva "username".
// Hay una copia de este archivo en admin-ui/assets/js/ (el panel vive en otra carpeta y en otro dominio).
(function () {
  const KEEP = 'input[type=email],input[type=password],input[autocomplete=username],input[type=checkbox],input[type=radio],input[type=file],input[type=hidden],input[type=color],input[type=range],input[type=submit],input[type=button]';

  function lock(node) {
    if (node.nodeType !== 1) return;
    const fields = node.matches('input,textarea,select') ? [node] : node.querySelectorAll('input,textarea,select');
    for (const el of fields) {
      if (el.matches(KEEP)) continue;
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('data-lpignore', 'true');   // LastPass
      el.setAttribute('data-1p-ignore', '');      // 1Password
      el.setAttribute('data-bwignore', 'true');   // Bitwarden
      el.setAttribute('data-form-type', 'other'); // Dashlane
    }
  }

  lock(document.documentElement);
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(lock))).observe(document.documentElement, { childList: true, subtree: true });
})();
