// Cliente SMTP mínimo y sin dependencias: lo justo para mandar un correo de texto plano a través de un servidor con usuario y contraseña
// (Gmail, Brevo, Resend, Mailgun, SendGrid... todos ofrecen SMTP). Conexión cifrada con TLS directo (puerto 465) o con STARTTLS (puerto 587).
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const TIMEOUT_MS = 15 * 1000;

// Envuelve un socket para leer respuestas SMTP: una respuesta son líneas "250-..." y una última "250 ...".
function session(socket) {
  let buffer = '', error = null, wake = null;
  const notify = () => { if (wake) { const w = wake; wake = null; w(); } };
  socket.setEncoding('utf8');
  socket.on('data', d => { buffer += d; notify(); });
  socket.on('error', e => { error = e; notify(); });
  socket.on('close', () => { error ??= new Error('el servidor cerró la conexión'); notify(); });
  socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('tiempo agotado hablando con el servidor de correo')));

  async function read() {
    for (;;) {
      const m = buffer.match(/^(?:\d{3}-[^\r\n]*\r\n)*\d{3} [^\r\n]*\r\n/);
      if (m) { buffer = buffer.slice(m[0].length); return { code: Number(m[0].slice(0, 3)), text: m[0].trim() }; }
      if (error) throw error;
      await new Promise(resolve => { wake = resolve; });
    }
  }
  // Manda una línea (si hay) y espera la respuesta; si el código no es uno de los esperados, falla con lo que dijo el servidor.
  async function cmd(line, expected) {
    if (line !== null) socket.write(line + '\r\n');
    const res = await read();
    if (!expected.includes(res.code)) throw new Error('SMTP respondió: ' + res.text.slice(0, 200));
    return res;
  }
  return { socket, cmd };
}

function connect({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure === 'tls' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.once(secure === 'tls' ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('tiempo agotado conectando al servidor de correo')));
  });
}

// "Nombre <a@b.com>" -> "a@b.com"
const addressOf = s => (s.match(/<([^<>\s]+)>/) || [null, s.trim()])[1];
// "Nombre <a@b.com>" -> "b.com": el Message-ID lleva el dominio del remitente (antes decía "@dlcritic", que no es un dominio válido y los filtros lo notan).
const domainOf = s => (addressOf(s).split('@')[1] || 'localhost').toLowerCase();

// Palabras no ASCII en un encabezado: =?UTF-8?B?...?= (RFC 2047).
const headerText = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

// El mensaje completo. Cada cuerpo va en base64, así que ninguna línea puede empezar con "." (no hace falta escapar puntos) ni romper el protocolo.
// Con html, el mensaje lleva las dos versiones (multipart/alternative): el texto primero y el HTML al final, que es la que los clientes prefieren.
const base64 = s => Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
const part = (type, content) => [`Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', base64(content)];
function buildMessage({ from, to, replyTo, subject, text, html }) {
  const boundary = `=_dlcritic_${crypto.randomBytes(12).toString('hex')}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${headerText(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(from)}>`,
    // RFC 3834: es un mensaje automático (no una conversación): así nadie le contesta con un "fuera de la oficina" ni se trata como correo masivo.
    'Auto-Submitted: auto-generated',
    'MIME-Version: 1.0',
    ...(html
      ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, ...part('text/plain', text), `--${boundary}`, ...part('text/html', html), `--${boundary}--`, '']
      : part('text/plain', text)),
  ].filter(l => l !== null).join('\r\n');
}

// secure: 'tls' (conexión cifrada desde el principio, puerto 465), 'starttls' (se cifra al empezar, puerto 587) o 'none' (sin cifrar: solo
// se acepta hacia esta misma máquina, para las pruebas).
async function send({ host, port, secure, user, pass, from, to, replyTo, subject, text, html }) {
  if (secure === 'none' && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('SMTP sin cifrar solo se permite hacia localhost');
  if (/[\r\n<>]/.test(to) || /[\r\n]/.test(from + (replyTo || '') + subject)) throw new Error('dirección o asunto inválidos');

  let s = session(await connect({ host, port, secure }));
  try {
    await s.cmd(null, [220]);
    await s.cmd('EHLO localhost', [250]);
    if (secure === 'starttls') {
      await s.cmd('STARTTLS', [220]);
      s = session(tls.connect({ socket: s.socket, servername: host }));
      await s.cmd('EHLO localhost', [250]);
    }
    if (user) await s.cmd('AUTH PLAIN ' + Buffer.from(`\0${user}\0${pass}`).toString('base64'), [235]);
    await s.cmd(`MAIL FROM:<${addressOf(from)}>`, [250]);
    await s.cmd(`RCPT TO:<${addressOf(to)}>`, [250, 251]);
    await s.cmd('DATA', [354]);
    s.socket.write(buildMessage({ from, to, replyTo, subject, text, html }) + '\r\n.\r\n');
    await s.cmd(null, [250]);
    s.socket.write('QUIT\r\n');
  } finally {
    s.socket.end();
  }
}

module.exports = { send, buildMessage };
