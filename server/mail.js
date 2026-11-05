// Envío de correos. Con SMTP_HOST configurado los manda por ese servidor; sin él, en desarrollo y pruebas los deja en `outbox` y los imprime en
// la consola (así el enlace de recuperación se puede copiar de ahí); en producción sin configurar falla, para no hacer como que se mandó.
//
// Variables de entorno:
//   SMTP_HOST, SMTP_PORT (465 por defecto), SMTP_SECURE ('tls' | 'starttls' | 'none'; por defecto 'tls' en el 465 y 'starttls' en el resto),
//   SMTP_USER, SMTP_PASS, MAIL_FROM (ej. 'DLCritic <dlcriticweb@gmail.com>'; por defecto SMTP_USER), MAIL_REPLY_TO (opcional).
//   PUBLIC_URL: la dirección pública del sitio (ej. https://dlcritic.vercel.app), que va en los enlaces de los correos.
const smtp = require('./smtp');

const outbox = [];

async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('Falta SMTP_HOST: no hay cómo mandar correos');
    outbox.push({ to, subject, text });
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
    to, subject, text,
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

/* ---------------- textos de los correos (español e inglés) ---------------- */

const TEXTS = {
  es: {
    resetSubject: 'Restablece tu contraseña de DLCritic',
    reset: (name, link) => `Hola ${name},

Alguien pidió restablecer la contraseña de tu cuenta de DLCritic. Si fuiste tú, abre este enlace para elegir una contraseña nueva (vale 1 hora y se puede usar una sola vez):

${link}

Si no fuiste tú, ignora este mensaje: tu contraseña sigue siendo la misma.

— DLCritic`,
    changedSubject: 'Cambió la contraseña de tu cuenta de DLCritic',
    changed: name => `Hola ${name},

La contraseña de tu cuenta de DLCritic se acaba de cambiar y se cerró la sesión en todos tus dispositivos.

Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, responde a este correo cuanto antes.

— DLCritic`,
  },
  en: {
    resetSubject: 'Reset your DLCritic password',
    reset: (name, link) => `Hi ${name},

Someone asked to reset the password of your DLCritic account. If it was you, open this link to choose a new password (it is valid for 1 hour and can be used only once):

${link}

If it wasn't you, ignore this message: your password stays the same.

— DLCritic`,
    changedSubject: 'The password of your DLCritic account was changed',
    changed: name => `Hi ${name},

The password of your DLCritic account was just changed and you were signed out on all your devices.

If it was you, there is nothing to do. If it wasn't you, reply to this email right away.

— DLCritic`,
  },
};

const resetEmail = (lang, name, link) => ({ subject: TEXTS[lang].resetSubject, text: TEXTS[lang].reset(name, link) });
const passwordChangedEmail = (lang, name) => ({ subject: TEXTS[lang].changedSubject, text: TEXTS[lang].changed(name) });

module.exports = { sendMail, publicUrl, resetEmail, passwordChangedEmail, outbox };
