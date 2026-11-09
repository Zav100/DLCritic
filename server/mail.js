// Envío de correos. Con SMTP_HOST configurado los manda por ese servidor; sin él, en desarrollo y pruebas los deja en `outbox` y los imprime en
// la consola (así el enlace de recuperación se puede copiar de ahí); en producción sin configurar falla, para no hacer como que se mandó.
//
// Variables de entorno:
//   SMTP_HOST, SMTP_PORT (465 por defecto), SMTP_SECURE ('tls' | 'starttls' | 'none'; por defecto 'tls' en el 465 y 'starttls' en el resto),
//   SMTP_USER, SMTP_PASS, MAIL_FROM (ej. 'DLCritic <dlcriticweb@gmail.com>'; por defecto SMTP_USER), MAIL_REPLY_TO (opcional).
//   PUBLIC_URL: la dirección pública del sitio (ej. https://dlcritic.vercel.app), que va en los enlaces de los correos.
const smtp = require('./smtp');
const { buildEmail, C } = require('./mail-layout');

const outbox = [];

// Todo correo de DLCritic sale con el mismo formato (oscuro, con logo y recuadro de color: mail-layout.js), en texto y en HTML: por eso html es obligatorio.
// Los correos se arman con buildEmail (ver los de abajo), que devuelve { subject, text, html }.
async function sendMail({ to, subject, text, html }) {
  if (!html) throw new Error('Todo correo de DLCritic lleva el formato HTML (usa buildEmail de mail-layout.js)');
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('Falta SMTP_HOST: no hay cómo mandar correos');
    outbox.push({ to, subject, text, html });
    if (!process.env.MAIL_QUIET) console.log(`\n[correo de desarrollo] Para: ${to}\nAsunto: ${subject}\n\n${text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  await smtp.send({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE || (port === 465 ? 'tls' : 'starttls'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    to, subject, text, html,
  });
}

// La dirección pública del sitio para armar enlaces. No se saca del pedido (el encabezado Host lo puede poner cualquiera): si el enlace
// de recuperación apuntara a otro sitio, quien lo abra le entregaría el código a ese sitio.
function publicUrl() {
  const url = process.env.PUBLIC_URL;
  if (url) return url.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('Falta PUBLIC_URL (la dirección pública del sitio)');
  return `http://localhost:${process.env.PORT || 8793}`;
}

/* ---------------- los correos (español e inglés) ---------------- */

// Cada correo se describe con su contenido (ver mail-layout.js) y buildEmail saca de ahí el texto y el HTML. La dirección del sitio es la de PUBLIC_URL (de ahí sale
// el logo y el pie); si no está, se omiten (no se rompe el correo).
function siteUrlOrEmpty() { try { return publicUrl(); } catch { return ''; } }

const EMAILS = {
  es: {
    verify: (name, link) => ({
      subject: 'Confirma tu correo de DLCritic',
      preheader: 'Confirma que este correo es tuyo: el enlace vale 24 horas.',
      title: 'Confirma tu correo',
      paragraphs: ['Para terminar de configurar tu cuenta de DLCritic, confirma que este correo es tuyo. Así podrás recuperar tu contraseña si algún día la olvidas.'],
      box: { label: 'Enlace de un solo uso', button: { text: 'Confirmar mi correo', url: link }, fallback: 'Si el botón no funciona, copia y pega este enlace en tu navegador:', note: 'Si no creaste una cuenta en DLCritic, ignora este mensaje. El enlace vale 24 horas.' },
    }),
    googleLinked: (name, takeover) => ({
      subject: 'Se vinculó Google a tu cuenta de DLCritic',
      preheader: 'Alguien inició sesión en DLCritic con tu cuenta de Google.',
      title: 'Vinculamos tu cuenta de Google',
      paragraphs: [
        'Alguien inició sesión en DLCritic con la cuenta de Google de este correo, y desde ahora se puede entrar con el botón «Continuar con Google».',
        ...(takeover ? ['Como el correo de tu cuenta no estaba confirmado, por seguridad se borró su contraseña anterior y se cerraron sus sesiones. Si quieres volver a usar una contraseña, elige una con «¿Olvidaste tu contraseña?».'] : []),
      ],
      box: { label: 'Si no fuiste tú', note: 'Responde a este correo cuanto antes.', accent: C.pink },
    }),
    reset: (name, link) => ({
      subject: 'Restablece tu contraseña de DLCritic',
      preheader: 'Enlace para elegir una contraseña nueva: vale 1 hora.',
      title: 'Restablece tu contraseña',
      paragraphs: ['Alguien pidió restablecer la contraseña de tu cuenta de DLCritic. Si fuiste tú, elige una contraseña nueva con el botón: el enlace vale 1 hora y se puede usar una sola vez.'],
      box: { label: 'Enlace de un solo uso', button: { text: 'Elegir contraseña nueva', url: link }, fallback: 'Si el botón no funciona, copia y pega este enlace en tu navegador:', note: 'Si no fuiste tú, ignora este mensaje: tu contraseña sigue siendo la misma.' },
    }),
    changed: () => ({
      subject: 'Cambió la contraseña de tu cuenta de DLCritic',
      preheader: 'La contraseña de tu cuenta se acaba de cambiar.',
      title: 'Cambió la contraseña de tu cuenta',
      paragraphs: ['La contraseña de tu cuenta de DLCritic se acaba de cambiar y se cerró la sesión en todos tus dispositivos.', 'Si fuiste tú, no tienes que hacer nada.'],
      box: { label: 'Si no fuiste tú', note: 'Responde a este correo cuanto antes.', accent: C.pink },
    }),
  },
  en: {
    verify: (name, link) => ({
      subject: 'Confirm your DLCritic email',
      preheader: 'Confirm this email is yours: the link is valid for 24 hours.',
      title: 'Confirm your email',
      paragraphs: ['To finish setting up your DLCritic account, confirm that this email is yours. That way you can recover your password if you ever forget it.'],
      box: { label: 'One-time link', button: { text: 'Confirm my email', url: link }, fallback: "If the button doesn't work, copy and paste this link into your browser:", note: "If you didn't create a DLCritic account, ignore this message. The link is valid for 24 hours." },
    }),
    googleLinked: (name, takeover) => ({
      subject: 'Google was linked to your DLCritic account',
      preheader: 'Someone signed in to DLCritic with your Google account.',
      title: 'We linked your Google account',
      paragraphs: [
        'Someone signed in to DLCritic with the Google account of this email, and from now on you can sign in with the "Continue with Google" button.',
        ...(takeover ? ["Because your account's email wasn't confirmed, for security its previous password was deleted and its sessions were closed. If you want to use a password again, choose one with \"Forgot your password?\"."] : []),
      ],
      box: { label: "If it wasn't you", note: 'Reply to this email right away.', accent: C.pink },
    }),
    reset: (name, link) => ({
      subject: 'Reset your DLCritic password',
      preheader: 'Link to choose a new password: valid for 1 hour.',
      title: 'Reset your password',
      paragraphs: ['Someone asked to reset the password of your DLCritic account. If it was you, choose a new password with the button: the link is valid for 1 hour and can be used only once.'],
      box: { label: 'One-time link', button: { text: 'Choose a new password', url: link }, fallback: "If the button doesn't work, copy and paste this link into your browser:", note: "If it wasn't you, ignore this message: your password stays the same." },
    }),
    changed: () => ({
      subject: 'The password of your DLCritic account was changed',
      preheader: 'The password of your account was just changed.',
      title: 'Your account password was changed',
      paragraphs: ['The password of your DLCritic account was just changed and you were signed out on all your devices.', 'If it was you, there is nothing to do.'],
      box: { label: "If it wasn't you", note: 'Reply to this email right away.', accent: C.pink },
    }),
  },
};

const resetEmail = (lang, name, link) => buildEmail(lang, name, EMAILS[lang].reset(name, link), siteUrlOrEmpty());
const verifyEmail = (lang, name, link) => buildEmail(lang, name, EMAILS[lang].verify(name, link), siteUrlOrEmpty());
const googleLinkedEmail = (lang, name, takeover) => buildEmail(lang, name, EMAILS[lang].googleLinked(name, takeover), siteUrlOrEmpty());
const passwordChangedEmail = (lang, name) => buildEmail(lang, name, EMAILS[lang].changed(name), siteUrlOrEmpty());

module.exports = { sendMail, publicUrl, resetEmail, passwordChangedEmail, verifyEmail, googleLinkedEmail, outbox };
