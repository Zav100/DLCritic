// Prueba de humo de punta a punta: crea usuarios de prueba (smoketest_*) y recorre las rutas con escritura —
// registro, sesión, reseñas, listas, seguimiento, notificaciones, reto diario, sugerencias, subida de imágenes, el
// límite de intentos, la separación de dominios y el panel de admin — comprobando respuestas y errores.
// Al terminar borra todo lo que creó.
//
// Uso: node -r ./scripts/local-env.js scripts/smoke-test.js   (Postgres local, app en proceso)
//      npm run test:smoke                                       (app en proceso, usa DATABASE_URL de .env.local)
//      BASE_URL=https://sitio.vercel.app ADMIN_URL=https://panel.vercel.app npm run test:smoke   (contra un despliegue)
// En modo remoto, DATABASE_URL tiene que apuntar a la MISMA base que el despliegue, y se vacía la tabla rate_limits
// entre pasos (Vercel ignora el X-Forwarded-For falso y todos los pasos salen con tu IP). Correrlo solo contra una
// base de pruebas (la rama dev), no contra producción.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { del } = require('@vercel/blob');
const REMOTE = !!process.env.BASE_URL;
const PUBLIC_HOST = 'public.test', ADMIN_HOST = 'admin.test';
if (!REMOTE) { // en proceso se simulan dos dominios (la app lee ADMIN_HOST al cargar), no hay servidor de correo y no se espera de más
  process.env.ADMIN_HOST = ADMIN_HOST;
  process.env.FORGOT_MIN_MS = '0';
  process.env.MAIL_QUIET = '1';
}
const db = require('../server/db');
const totp = require('../server/totp');
const { uploadsDir } = require('../server/upload');
const server = REMOTE ? null : require('../server/index.js').listen(0);
const publicBase = REMOTE ? process.env.BASE_URL : `http://localhost:${server.address().port}`;
const adminBase = REMOTE ? (process.env.ADMIN_URL || process.env.BASE_URL) : publicBase;
let ipCounter = 10; // el límite de intentos es por IP: cada cliente simula la suya (la app confía en X-Forwarded-For)

// kind: 'public' (por defecto) o 'admin': a qué dominio le habla el cliente.
function client(kind = 'public') {
  const ip = `10.9.0.${ipCounter++}`;
  const base = kind === 'admin' ? adminBase : publicBase;
  const forwardedHost = REMOTE ? {} : { 'X-Forwarded-Host': kind === 'admin' ? ADMIN_HOST : PUBLIC_HOST };
  let cookie = '';
  const call = async (method, url, body) => {
    const isForm = body instanceof FormData; // multipart: fetch pone solo el Content-Type (con el boundary)
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-Forwarded-For': ip, ...forwardedHost, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
    });
    for (const c of res.headers.getSetCookie()) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  call.getCookie = () => cookie;
  call.setCookie = c => { cookie = c; };
  return call;
}

let passed = 0, failed = 0;
const resetLimits = () => (REMOTE ? db.prepare('DELETE FROM rate_limits').run() : null);
async function step(name, fn) {
  try { await resetLimits(); await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 6).join('\n      ')); }
}
const ok = (r, status = 200) => assert.equal(r.status, status, `esperaba ${status}, llegó ${r.status}: ${r.text.slice(0, 200)}`);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const a = client(), b = client(), anon = client(), admin = client('admin'), aOnAdmin = client('admin');
  const pass = 'Smoketest123!';
  let gameId, otherGameId, charId, reviewId, listId, adminTwoFactor;
  // Activa la verificación en dos pasos de la cuenta con la que está iniciada la sesión de ese cliente (admin).
  const enableTwoFactor = async c => {
    const s = await c('POST', '/api/admin/2fa/setup', { currentPassword: pass }); ok(s);
    const e = await c('POST', '/api/admin/2fa/enable', { code: totp.codeForStep(s.body.secret, Math.floor(Date.now() / 30000)) }); ok(e);
    return { secret: s.body.secret, recoveryCodes: e.body.recoveryCodes };
  };

  console.log('Catálogo');
  await step('hay juegos y personajes', async () => {
    const g = await anon('GET', '/api/games'); ok(g);
    gameId = g.body.games[0].id; otherGameId = g.body.games[1].id;
    const c = await anon('GET', '/api/characters'); ok(c);
    charId = c.body.characters[0].id;
    assert.ok(g.body.games.length > 1 && charId);
  });

  console.log('Cuentas');
  await step('registro válido crea sesión', async () => {
    const r = await a('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_a@example.com', password: pass, username: 'smoketest_a', bio: 'hola' }); ok(r);
    assert.equal(r.body.user.username, 'smoketest_a');
    const me = await a('GET', '/api/auth/me'); assert.equal(me.body.user.username, 'smoketest_a');
  });
  await step('registro rechaza duplicados (email y usuario sin importar mayúsculas), clave débil y nombre inválido', async () => {
    const x = client();
    ok(await x('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_a@example.com', password: pass, username: 'otro_nombre' }), 409);
    const dup = await x('POST', '/api/auth/register', { acceptTerms: true, email: 'x1@example.com', password: pass, username: 'SMOKETEST_A' }); ok(dup, 409);
    assert.equal(dup.body.error, 'username_taken');
    assert.equal((await x('POST', '/api/auth/register', { acceptTerms: true, email: 'x2@example.com', password: '123', username: 'smoketest_x' })).body.error, 'weak_password');
    assert.equal((await x('POST', '/api/auth/register', { acceptTerms: true, email: 'x3@example.com', password: pass, username: 'a' })).body.error, 'invalid_username');
    assert.equal((await x('POST', '/api/auth/register', { acceptTerms: true, email: 'malo', password: pass, username: 'smoketest_x' })).body.error, 'invalid_email');
    assert.equal((await x('POST', '/api/auth/register', { email: 'x4@example.com', password: pass, username: 'smoketest_x' })).body.error, 'terms_required');
  });
  await step('login por email y por usuario; contraseña mala = 401; logout cierra sesión', async () => {
    const x = client();
    ok(await x('POST', '/api/auth/login', { identifier: 'smoketest_a@example.com', password: pass }));
    assert.equal((await x('GET', '/api/auth/me')).body.user.username, 'smoketest_a');
    ok(await x('POST', '/api/auth/logout'));
    assert.equal((await x('GET', '/api/auth/me')).body.user, null);
    ok(await x('POST', '/api/auth/login', { identifier: 'SmokeTest_A', password: pass }));
    ok(await x('POST', '/api/auth/login', { identifier: 'smoketest_a', password: 'mala1234' }), 401);
  });
  await step('segundo usuario y cambio de contraseña', async () => {
    ok(await b('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_b@example.com', password: pass, username: 'smoketest_b' }));
    ok(await b('POST', '/api/account/password', { currentPassword: 'incorrecta1', newPassword: 'Nueva12345!' }), 401);
    ok(await b('POST', '/api/account/password', { currentPassword: pass, newPassword: 'Nueva12345!' }));
    ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_b', password: 'Nueva12345!' }));
  });
  await step('sesiones: el logout las cierra de verdad y en la base solo queda el hash del token', async () => {
    const s = client();
    ok(await s('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass }));
    const raw = decodeURIComponent(s.getCookie().split('=')[1]);
    assert.ok(!(await db.prepare('SELECT 1 AS x FROM sessions WHERE token = ?').get(raw)), 'el token no se guarda tal cual');
    const copy = client(); copy.setCookie(s.getCookie());
    assert.equal((await copy('GET', '/api/auth/me')).body.user.username, 'smoketest_a');
    ok(await s('POST', '/api/auth/logout'));
    assert.equal((await copy('GET', '/api/auth/me')).body.user, null, 'la cookie copiada ya no sirve');
  });
  await step('cambiar la contraseña cierra las otras sesiones; "cerrar en todos los dispositivos" cierra todas', async () => {
    const c = client(), s2 = client(), s3 = client();
    ok(await c('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_c@example.com', password: pass, username: 'smoketest_c' }));
    ok(await s2('POST', '/api/auth/login', { identifier: 'smoketest_c', password: pass }));
    ok(await c('POST', '/api/account/password', { currentPassword: pass, newPassword: 'Mi clave 98765 ✓' }));
    assert.equal((await s2('GET', '/api/auth/me')).body.user, null, 'la otra sesión se cerró');
    assert.equal((await c('GET', '/api/auth/me')).body.user.username, 'smoketest_c', 'la sesión actual sigue abierta');
    ok(await s3('POST', '/api/auth/login', { identifier: 'smoketest_c', password: 'Mi clave 98765 ✓' }));
    ok(await c('POST', '/api/auth/logout-all'));
    assert.equal((await c('GET', '/api/auth/me')).body.user, null);
    assert.equal((await s3('GET', '/api/auth/me')).body.user, null);
    ok(await anon('POST', '/api/auth/logout-all'), 401);
  });
  await step('cambiar el correo pide la contraseña actual, y comparar contraseñas tiene tope de intentos', async () => {
    const c = client();
    ok(await c('POST', '/api/auth/login', { identifier: 'smoketest_c', password: 'Mi clave 98765 ✓' }));
    ok(await c('PUT', '/api/profile', { email: 'smoketest_c2@example.com' }), 401);
    ok(await c('PUT', '/api/profile', { email: 'smoketest_c2@example.com', currentPassword: 'incorrecta1' }), 401);
    const r = await c('PUT', '/api/profile', { email: 'smoketest_c2@example.com', currentPassword: 'Mi clave 98765 ✓' }); ok(r);
    assert.equal(r.body.user.email, 'smoketest_c2@example.com');
    ok(await c('PUT', '/api/profile', { bio: 'sin tocar el correo' })); // lo que no es el correo no pide contraseña
    ok(await c('PUT', '/api/profile', { email: 'smoketest_c2@example.com', bio: 'mismo correo' }));
    // ya van 4 comparaciones de las 5 permitidas (una fue el cambio de contraseña del paso anterior)
    ok(await c('POST', '/api/account/password', { currentPassword: 'incorrecta1', newPassword: 'Cuarta987654!' }), 401);
    const blocked = await c('POST', '/api/account/password', { currentPassword: 'Mi clave 98765 ✓', newPassword: 'Cuarta987654!' });
    ok(blocked, 429);
    assert.ok(blocked.headers.get('retry-after'));
  });
  await step('contraseña: libre, pero con mayúscula, número y carácter especial; una kilométrica no se hashea', async () => {
    // cada intento sale de un cliente nuevo: el límite de intentos es por IP (8 cada 10 minutos) y aquí se prueban más de 8
    const reg = (email, password) => client()('POST', '/api/auth/register', { acceptTerms: true, email, password, username: 'smoketest_x' });
    for (const [n, mala] of [['sin mayúscula', 'abcdef1!'], ['sin número', 'Abcdefg!'], ['sin carácter especial', 'Abcdefg1'], ['corta', 'Ab1!'], ['solo letras y números', 'Password123']]) {
      assert.equal((await reg(`p_${n.length}@example.com`, mala)).body.error, 'weak_password', n);
    }
    // sin emojis (ni tonos de piel, banderas ni el unir-emojis)
    for (const emoji of ['Abcdef1!😀', 'Abcdef1!❤️', 'Abcdef1!👍🏽', 'Abcdef1!🇦🇷', 'Abcdef1!\u200D']) {
      assert.equal((await reg('p_emoji@example.com', emoji)).body.error, 'password_emoji', emoji);
    }
    // todo lo demás vale (el resultado se frena en el 409 de usuario repetido: pasó la validación)
    assert.equal((await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'p_sim@example.com', password: 'Abcdef1©✓€→', username: 'smoketest_a' })).body.error, 'username_taken');
    const libre = await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'p_libre@example.com', password: 'password123!A', username: 'smoketest_a' });
    assert.equal(libre.body.error, 'username_taken');
    ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_a', password: 'a1'.repeat(300) }), 401);
    ok(await client()('POST', '/api/auth/login', { identifier: 'no_existe_nadie', password: pass }), 401);
  });
  await step('"recordar este dispositivo": 20 días con cookie persistente; si no, cookie de sesión y 24 horas; crear la cuenta, 24 horas con cookie persistente', async () => {
    // horas que le quedan a la sesión que abrió esa respuesta (en la base está el hash del token, no el token)
    const hoursLeft = async res => {
      const raw = decodeURIComponent(res.headers.getSetCookie()[0].split(';')[0].split('=')[1]);
      const row = await db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(crypto.createHash('sha256').update(raw).digest('hex'));
      return Math.round((Date.parse(row.expires_at) - Date.now()) / 3600000);
    };
    const remembered = await client()('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass, remember: true }); ok(remembered);
    assert.match(remembered.headers.getSetCookie()[0], /Expires=/);
    assert.equal(await hoursLeft(remembered), 20 * 24);
    const plain = await client()('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass }); ok(plain);
    assert.doesNotMatch(plain.headers.getSetCookie()[0], /Expires=/, 'cookie de sesión: el navegador la borra al cerrarse');
    assert.equal(await hoursLeft(plain), 24);
    const texto = await client()('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass, remember: 'true' }); ok(texto);
    assert.doesNotMatch(texto.headers.getSetCookie()[0], /Expires=/, 'solo vale el booleano true');
    // crear la cuenta deja una sesión de 24 horas, pero con cookie persistente
    const d = await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_d@example.com', password: pass, username: 'smoketest_d' }); ok(d);
    assert.match(d.headers.getSetCookie()[0], /Expires=/);
    assert.equal(await hoursLeft(d), 24);
  });
  await step('correo: el cliente SMTP autentica, arma bien el mensaje y no manda sin cifrar fuera de localhost', async () => {
    const net = require('node:net');
    const smtp = require('../server/smtp');
    const log = [];
    const server = net.createServer(sock => {
      let inData = false, body = '', buf = '';
      sock.write('220 falso ESMTP\r\n');
      sock.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (inData) { if (line === '.') { inData = false; log.push(['CUERPO', body]); sock.write('250 en cola\r\n'); } else body += line + '\r\n'; continue; }
          log.push(['CMD', line]);
          if (line.startsWith('EHLO')) sock.write('250-falso\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
          else if (line.startsWith('AUTH PLAIN')) sock.write('235 ok\r\n');
          else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) sock.write('250 ok\r\n');
          else if (line === 'DATA') { inData = true; sock.write('354 sigue\r\n'); }
          else if (line === 'QUIT') sock.end('221 chau\r\n');
        }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const subject = 'Restablece tu contraseña de DLCritic', text = 'Hola ñandú\n.\npunto solo\n' + 'x'.repeat(200);
      await smtp.send({ host: '127.0.0.1', port: server.address().port, secure: 'none', user: 'cuenta@ejemplo.com', pass: 'secreta', from: 'DLCritic <dlcritic@ejemplo.com>', replyTo: 'ayuda@ejemplo.com', to: 'persona@ejemplo.com', subject, text });
      await new Promise(resolve => setTimeout(resolve, 100));
      const cmds = log.filter(l => l[0] === 'CMD').map(l => l[1]);
      assert.ok(cmds.includes('AUTH PLAIN ' + Buffer.from('\0cuenta@ejemplo.com\0secreta').toString('base64')), 'autenticó');
      assert.ok(cmds.includes('MAIL FROM:<dlcritic@ejemplo.com>') && cmds.includes('RCPT TO:<persona@ejemplo.com>'), 'remitente y destinatario');
      assert.ok(cmds.includes('QUIT'));
      const [head, ...rest] = log.find(l => l[0] === 'CUERPO')[1].split('\r\n\r\n');
      assert.ok(head.includes('From: DLCritic <dlcritic@ejemplo.com>') && head.includes('To: persona@ejemplo.com') && head.includes('Reply-To: ayuda@ejemplo.com'));
      assert.match(head, /Message-ID: <[0-9a-f-]{36}@ejemplo\.com>/, 'el Message-ID lleva el dominio del remitente');
      assert.ok(head.includes('Auto-Submitted: auto-generated'), 'se marca como mensaje automático');
      const encoded = head.match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)[1];
      assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), subject, 'el asunto con tilde va codificado');
      assert.equal(Buffer.from(rest.join('\r\n\r\n').replace(/\r\n/g, ''), 'base64').toString('utf8'), text, 'el cuerpo (con ñ y un "." solo en una línea) llega intacto');
    } finally { server.close(); }
    await assert.rejects(smtp.send({ host: 'mail.ejemplo.com', port: 25, secure: 'none', from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't' }), /localhost/);
    await assert.rejects(smtp.send({ host: '127.0.0.1', port: 1, secure: 'none', from: 'a@b.com', to: 'c@d.com\r\nBcc: otro@d.com', subject: 's', text: 't' }), /inválid/);
  });
  await step('recuperar la contraseña por correo: enlace de un solo uso, que vence, sin revelar qué correos existen', async () => {
    if (REMOTE) return; // los correos se leen de la memoria del proceso (mail.outbox): solo en modo local
    const mail = require('../server/mail');
    // el tope por correo dura 1 hora: sin limpiarlo, correr la prueba dos veces seguidas lo agota y el primer pedido no manda nada
    await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'forgot-email:smoketest%'").run();
    const tokenOf = m => m.text.match(/\/restablecer\?token=([0-9a-f]{64})/)[1];
    const forgot = (email, extra = {}) => client()('POST', '/api/auth/forgot', { email, ...extra });
    const reset = (token, newPassword) => client()('POST', '/api/auth/reset', { token, newPassword });
    const nueva = 'Nueva-Clave9!';

    ok(await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_r@example.com', password: pass, username: 'smoketest_r' }));
    const otraSesion = client();
    ok(await otraSesion('POST', '/api/auth/login', { identifier: 'smoketest_r', password: pass }));

    ok(await forgot('malo'), 400);
    // un correo sin cuenta recibe la misma respuesta y no sale ningún correo
    const antes = mail.outbox.length;
    const sinCuenta = await forgot('nadie@example.com'); ok(sinCuenta);
    assert.deepEqual(sinCuenta.body, { ok: true });
    assert.equal(mail.outbox.length, antes);
    // con cuenta: la misma respuesta y un correo con el enlace (en el idioma pedido)
    const conCuenta = await forgot('smoketest_r@example.com', { lang: 'en' }); ok(conCuenta);
    assert.deepEqual(conCuenta.body, sinCuenta.body);
    assert.equal(mail.outbox.length, antes + 1);
    const m1 = mail.outbox.at(-1);
    assert.equal(m1.to, 'smoketest_r@example.com');
    assert.match(m1.subject, /Reset your DLCritic password/); assert.match(m1.text, /Hi smoketest_r/);
    const token1 = tokenOf(m1);
    assert.ok(!(await db.prepare('SELECT 1 AS x FROM password_resets WHERE token_hash = ?').get(token1)), 'en la base está el hash, no el token');
    // un enlace nuevo anula el anterior
    ok(await forgot('smoketest_r@example.com'));
    const token2 = tokenOf(mail.outbox.at(-1));
    assert.notEqual(token1, token2);
    assert.equal((await reset(token1, nueva)).body.error, 'invalid_token');
    // inventado o mal formado
    ok(await reset('x', nueva), 400);
    ok(await reset('0'.repeat(64), nueva), 400);
    // una contraseña que no sirve no gasta el enlace
    assert.equal((await reset(token2, 'debil')).body.error, 'weak_password');
    assert.equal((await reset(token2, nueva + '😀')).body.error, 'password_emoji');
    // la buena: cambia la clave, cierra todas las sesiones y avisa por correo
    ok(await reset(token2, nueva));
    assert.equal((await otraSesion('GET', '/api/auth/me')).body.user, null, 'las sesiones abiertas se cierran');
    ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_r', password: pass }), 401);
    ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_r', password: nueva }));
    const aviso = mail.outbox.at(-1);
    assert.equal(aviso.to, 'smoketest_r@example.com'); assert.match(aviso.subject, /Cambió la contraseña/);
    // y el enlace no sirve dos veces
    assert.equal((await reset(token2, 'Otra-Clave98!')).body.error, 'invalid_token');
    // vencido
    ok(await forgot('smoketest_r@example.com'));
    const token3 = tokenOf(mail.outbox.at(-1));
    await db.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE username = 'smoketest_r')").run();
    assert.equal((await reset(token3, 'Otra-Clave98!')).body.error, 'invalid_token');
    // tope por correo: 3 pedidos por hora (van 3); el cuarto responde igual pero no manda nada
    const n = mail.outbox.length;
    ok(await forgot('smoketest_r@example.com'));
    assert.equal(mail.outbox.length, n);
    // la página del enlace se sirve sin pasar el token a otros sitios, y solo en el dominio público
    const page = await client()('GET', '/restablecer'); ok(page);
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  });
  await step('cabeceras de seguridad en las páginas', async () => {
    const h = await anon('GET', '/');
    assert.equal(h.headers.get('x-frame-options'), 'DENY');
    assert.equal(h.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  });
  await step('rutas protegidas devuelven 401 sin sesión', async () => {
    for (const [m, u] of [['PUT', `/api/reviews/${gameId}`], ['GET', '/api/notifications'], ['GET', '/api/lists/mine'], ['GET', '/api/daily?date=' + today]]) {
      ok(await anon(m, u, m === 'PUT' ? {} : undefined), 401);
    }
    ok(await client('admin')('GET', '/api/admin/games'), 401); // el panel, por el dominio del dashboard
  });

  console.log('Reseñas de juegos');
  await step('crear, leer, editar reseña; validaciones', async () => {
    const r = await a('PUT', `/api/reviews/${gameId}`, { rating: 8, text: 'Muy bueno', platforms: ['steam'] }); ok(r);
    reviewId = r.body.id; assert.ok(reviewId);
    const list = (await anon('GET', '/api/reviews')).body.reviews;
    const mine = list.find(x => x.id === reviewId);
    assert.deepEqual([mine.username, mine.rating, mine.text, mine.platforms, mine.helpfulBy], ['smoketest_a', 8, 'Muy bueno', ['steam'], []]);
    ok(await a('PUT', `/api/reviews/${gameId}`, { rating: 9 })); // editar solo la nota conserva el texto
    assert.equal((await anon('GET', '/api/reviews')).body.reviews.find(x => x.id === reviewId).text, 'Muy bueno');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { rating: 11 })).body.error, 'invalid_rating');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { text: 'x'.repeat(601) })).body.error, 'invalid_text');
    assert.equal((await a('PUT', `/api/reviews/${gameId}`, { platforms: ['atari'] })).body.error, 'invalid_platforms');
    ok(await a('PUT', '/api/reviews/no-existe', { rating: 5 }), 404);
  });
  await step('"útil": no en la propia, sí en la ajena, notifica y se puede quitar', async () => {
    ok(await a('POST', `/api/reviews/id/${reviewId}/helpful`), 400);
    const on = await b('POST', `/api/reviews/id/${reviewId}/helpful`); ok(on);
    assert.deepEqual(on.body.helpfulBy, ['smoketest_b']);
    const notes = (await a('GET', '/api/notifications')).body.notifications;
    assert.ok(notes.some(n => n.type === 'helpful' && n.actorUsername === 'smoketest_b' && n.read === false));
    assert.deepEqual((await b('POST', `/api/reviews/id/${reviewId}/helpful`)).body.helpfulBy, []);
    ok(await a('POST', '/api/notifications/read'));
    assert.ok((await a('GET', '/api/notifications')).body.notifications.every(n => n.read === true));
  });
  await step('borrar texto, borrar nota y borrar reseña vacía', async () => {
    const d1 = await a('DELETE', `/api/reviews/${gameId}/text`); assert.equal(d1.body.deleted, false); // queda la nota
    const d2 = await a('DELETE', `/api/reviews/${gameId}/rating`); assert.equal(d2.body.deleted, false); // queda la plataforma
    ok(await a('PUT', `/api/reviews/${gameId}`, { platforms: [] }));
    assert.ok(!(await anon('GET', '/api/reviews')).body.reviews.some(x => x.id === reviewId)); // vacía = se borra
    const r = await a('PUT', `/api/reviews/${otherGameId}`, { rating: 4 }); ok(r);
    ok(await a('DELETE', `/api/reviews/id/${r.body.id}`));
  });

  console.log('Reseñas de personajes');
  await step('crear, editar y borrar; personaje inexistente = 404', async () => {
    const r = await a('PUT', `/api/character-reviews/${charId}`, { rating: 10, text: 'Genial' }); ok(r);
    const mine = (await anon('GET', '/api/character-reviews')).body.characterReviews.find(x => x.id === r.body.id);
    assert.deepEqual([mine.username, mine.rating, mine.text], ['smoketest_a', 10, 'Genial']);
    assert.equal((await a('DELETE', `/api/character-reviews/${charId}/text`)).body.deleted, false);
    assert.equal((await a('DELETE', `/api/character-reviews/${charId}/rating`)).body.deleted, true);
    ok(await a('PUT', '/api/character-reviews/no-existe', { rating: 5 }), 404);
  });

  console.log('Perfil');
  await step('favorito, wishlist, actividad y reto diario', async () => {
    assert.equal((await a('PUT', '/api/profile/favorite', { gameId })).body.favoriteGameId, gameId);
    assert.equal((await a('PUT', '/api/profile/favorite', { gameId: 'no-existe' })).body.error, 'invalid_game');
    assert.deepEqual((await a('POST', '/api/profile/wishlist/toggle', { gameId })).body.wishlist, [gameId]);
    assert.deepEqual((await a('POST', '/api/profile/wishlist/toggle', { gameId })).body.wishlist, []);
    assert.deepEqual((await a('POST', '/api/profile/activity', { date: today })).body.activityDates, [today]);
    assert.equal((await a('POST', '/api/profile/activity', { date: '2001-01-01' })).body.error, 'invalid_date');
    ok(await a('PUT', '/api/daily', { date: today, guesses: ['A', 'B'], solved: false, failed: false, rouletteSpins: 2 }));
    ok(await a('PUT', '/api/daily', { date: today, guesses: ['A', 'B', 'C'], solved: true, failed: false, rouletteSpins: 2 })); // upsert
    const d = (await a('GET', '/api/daily?date=' + today)).body.daily;
    assert.deepEqual([d.guesses, d.solved, d.rouletteSpins], [['A', 'B', 'C'], true, 2]);
    assert.equal((await a('PUT', '/api/daily', { date: today, guesses: ['1', '2', '3', '4', '5', '6'] })).body.error, 'invalid_guesses');
  });
  await step('editar perfil: usuario/email repetidos = 409, cambio válido se refleja', async () => {
    assert.equal((await a('PUT', '/api/profile', { username: 'smoketest_b' })).status, 409);
    assert.equal((await a('PUT', '/api/profile', { email: 'smoketest_b@example.com', currentPassword: pass })).status, 409);
    const r = await a('PUT', '/api/profile', { bio: 'Nueva bio', socialLinks: { steam: 'https://steamcommunity.com/id/x', x: 'javascript:alert(1)' } }); ok(r);
    assert.equal(r.body.user.bio, 'Nueva bio');
    assert.deepEqual(r.body.user.socialLinks, { steam: 'https://steamcommunity.com/id/x' });
    const pub = (await anon('GET', '/api/users/SMOKETEST_A')).body.user;
    assert.deepEqual([pub.username, pub.bio, pub.reviewCount], ['smoketest_a', 'Nueva bio', 0]);
  });
  await step('seguir, amistad mutua, notificación y dejar de seguir', async () => {
    const f1 = (await a('POST', '/api/users/smoketest_b/follow')).body; assert.deepEqual([f1.isFollowing, f1.isFriend, f1.followerCount], [true, false, 1]);
    const f2 = (await b('POST', '/api/users/smoketest_a/follow')).body; assert.deepEqual([f2.isFollowing, f2.isFriend], [true, true]);
    assert.ok((await b('GET', '/api/notifications')).body.notifications.some(n => n.type === 'follow' && n.actorUsername === 'smoketest_a'));
    ok(await a('POST', '/api/users/smoketest_a/follow'), 400);
    ok(await a('POST', '/api/users/no_existe_nadie/follow'), 404);
    assert.equal((await a('POST', '/api/users/smoketest_b/follow')).body.isFollowing, false);
    assert.equal((await b('POST', '/api/users/smoketest_a/follow')).body.isFollowing, false);
  });

  console.log('Listas');
  await step('crear, agregar/quitar juegos, editar, listar públicas y borrar', async () => {
    const c = await a('POST', '/api/lists', { title: 'Mis favoritos', isPublic: true }); ok(c);
    listId = c.body.list.id; assert.deepEqual(c.body.list.gameIds, []);
    assert.deepEqual((await a('POST', `/api/lists/${listId}/items/toggle`, { gameId })).body.list.gameIds, [gameId]);
    ok(await a('POST', `/api/lists/${listId}/items/toggle`, { gameId: 'no-existe' }), 400);
    ok(await b('POST', `/api/lists/${listId}/items/toggle`, { gameId }), 403); // no es suya
    const e = await a('PUT', `/api/lists/${listId}`, { title: 'Renombrada', isPublic: false }); assert.deepEqual([e.body.list.title, e.body.list.isPublic], ['Renombrada', false]);
    assert.equal((await anon('GET', '/api/users/smoketest_a/lists')).body.lists.length, 0); // privada: no se ve
    assert.equal((await a('GET', '/api/lists/mine')).body.lists.length, 1);
    await a('PUT', `/api/lists/${listId}`, { isPublic: true });
    assert.deepEqual((await anon('GET', '/api/users/smoketest_a/lists')).body.lists[0].gameIds, [gameId]);
    assert.deepEqual((await a('POST', `/api/lists/${listId}/items/toggle`, { gameId })).body.list.gameIds, []);
    ok(await a('DELETE', `/api/lists/${listId}`));
    assert.equal((await a('GET', '/api/lists/mine')).body.lists.length, 0);
  });

  console.log('Sugerencias, páginas y portadas');
  await step('sugerencias de juego y de personaje', async () => {
    ok(await anon('POST', '/api/suggestions', { title: 'smoketest juego nuevo', platforms: ['steam'], genre: 'Acción', releaseYear: 2024, note: 'prueba' }));
    ok(await a('POST', '/api/suggestions', { kind: 'character', title: 'smoketest personaje', relatedGame: 'Hades', categories: ['villain', 'inventada'] }));
    assert.equal((await anon('POST', '/api/suggestions', { title: 'x' })).body.error, 'title_too_short');
  });
  await step('páginas con meta Open Graph (juego, personaje, usuario) y rutas del SPA', async () => {
    const title = (await anon('GET', '/api/games')).body.games.find(g => g.id === gameId).title;
    const g = await anon('GET', `/juego/${gameId}`); ok(g);
    const html = x => x.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); // el servidor escribe el título escapado (ej. "Baldur's" -> "Baldur&#39;s")
    assert.ok(g.text.includes(`<title>${html(title)} — DLCritic</title>`), 'título del juego en <title>');
    const c = await anon('GET', `/personaje/${charId}`); ok(c); assert.ok(/<title>.+ — DLCritic<\/title>/.test(c.text));
    const u = await anon('GET', '/usuario/smoketest_a'); ok(u); assert.ok(u.text.includes('smoketest_a — DLCritic'));
    for (const route of ['/explorar', '/personajes', '/reto-del-dia', '/juego/no-existe']) ok(await anon('GET', route));
    ok(await anon('GET', '/api/no-existe'), 404);
    ok(await anon('GET', '/api/cover?title=x'), 404); // ya no se busca la portada en Steam: cada juego trae la suya guardada
  });

  console.log('Panel de administración');
  await step('un usuario normal no entra (403); el admin sí', async () => {
    ok(await aOnAdmin('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass }));
    ok(await aOnAdmin('GET', '/api/admin/games'), 403);
    ok(await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_admin@example.com', password: pass, username: 'smoketest_admin' }));
    await db.prepare("UPDATE users SET is_admin = 1 WHERE lower(username) = 'smoketest_admin'").run();
    ok(await admin('POST', '/api/auth/login', { identifier: 'smoketest_admin', password: pass }));
    // sin verificación en dos pasos el panel no abre: la cuenta admin tiene que activarla primero
    const sinDosPasos = await admin('GET', '/api/admin/games');
    ok(sinDosPasos, 403); assert.equal(sinDosPasos.body.error, 'two_factor_required');
    adminTwoFactor = await enableTwoFactor(admin);
    ok(await admin('GET', '/api/admin/games'));
  });
  await step('2FA: los códigos salen como el estándar (vectores del RFC 6238) y se aceptan una sola vez', async () => {
    const secret = totp.base32Encode(Buffer.from('12345678901234567890')); // la clave de prueba del RFC (el RFC da 8 dígitos; aquí, los últimos 6)
    for (const [segundos, esperado] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]) {
      assert.equal(totp.codeForStep(secret, Math.floor(segundos / 30)), esperado, 't=' + segundos);
    }
    const now = Date.now(), step = Math.floor(now / 30000), code = totp.codeForStep(secret, step);
    assert.equal(totp.verifyCode(secret, code, 0, now), step);
    assert.equal(totp.verifyCode(secret, code, step, now), null, 'ya usado');
    assert.equal(totp.verifyCode(secret, totp.codeForStep(secret, step - 2), 0, now), null, 'fuera de la ventana');
  });
  await step('2FA: el alta pide la contraseña y un código bueno, y solo la hace un admin', async () => {
    ok(await aOnAdmin('POST', '/api/admin/2fa/setup', { currentPassword: pass }), 403); // usuario común
    const a2 = client('admin');
    ok(await client()('POST', '/api/auth/register', { acceptTerms: true, email: 'smoketest_admin2@example.com', password: pass, username: 'smoketest_admin2' }));
    await db.prepare("UPDATE users SET is_admin = 1 WHERE lower(username) = 'smoketest_admin2'").run();
    ok(await a2('POST', '/api/auth/login', { identifier: 'smoketest_admin2', password: pass }));
    ok(await a2('POST', '/api/admin/2fa/setup', { currentPassword: 'incorrecta1!' }), 401);
    ok(await a2('POST', '/api/admin/2fa/enable', { code: '123456' }), 400); // todavía no empezó
    const s = await a2('POST', '/api/admin/2fa/setup', { currentPassword: pass }); ok(s);
    assert.match(s.body.otpauthUri, /^otpauth:\/\/totp\/DLCritic:smoketest_admin2\?secret=[A-Z2-7]{32}&/);
    ok(await a2('POST', '/api/admin/2fa/enable', { code: '000000' }), 401);
    const e = await a2('POST', '/api/admin/2fa/enable', { code: totp.codeForStep(s.body.secret, Math.floor(Date.now() / 30000)) }); ok(e);
    assert.equal(e.body.recoveryCodes.length, 8);
    ok(await a2('POST', '/api/admin/2fa/setup', { currentPassword: pass }), 409); // ya activada
    ok(await a2('GET', '/api/admin/games'));
    // la base guarda hashes de los códigos de recuperación, no los códigos
    const row = await db.prepare("SELECT totp_recovery FROM users WHERE lower(username) = 'smoketest_admin2'").get();
    assert.ok(!e.body.recoveryCodes.some(c => row.totp_recovery.includes(c)));
  });
  await step('2FA: el login pide el código, no se puede repetir, los de recuperación sirven una vez y hay tope de intentos', async () => {
    const { secret, recoveryCodes } = adminTwoFactor;
    const codeNow = () => totp.codeForStep(secret, Math.floor(Date.now() / 30000));
    const nuevoPaso = () => db.prepare("UPDATE users SET totp_last_step = 0 WHERE lower(username) = 'smoketest_admin'").run(); // como si hubieran pasado 30 s
    const login = (c, extra = {}) => c('POST', '/api/auth/login', { identifier: 'smoketest_admin', password: pass, ...extra });
    // sin código: avisa que falta y no abre sesión
    const c1 = client('admin'), r1 = await login(c1);
    ok(r1, 401); assert.equal(r1.body.error, 'two_factor_required');
    assert.equal((await c1('GET', '/api/auth/me')).body.user, null);
    // contraseña mala: sigue siendo bad_login (no revela si hay 2FA)
    assert.equal((await client('admin')('POST', '/api/auth/login', { identifier: 'smoketest_admin', password: 'incorrecta1!', code: codeNow() })).body.error, 'bad_login');
    // código malo
    await nuevoPaso();
    ok(await login(client('admin'), { code: '000000' }), 401);
    // código bueno: abre sesión y esa sesión entra al panel
    const c2 = client('admin');
    await nuevoPaso();
    const r2 = await login(c2, { code: codeNow() }); ok(r2);
    assert.equal(r2.body.user.twoFactor, true);
    assert.ok(!JSON.stringify(r2.body).includes(secret), 'la respuesta no lleva la clave');
    ok(await c2('GET', '/api/admin/games'));
    // el mismo código no sirve dos veces
    const r3 = await login(client('admin'), { code: codeNow() }); ok(r3, 401); assert.equal(r3.body.error, 'bad_code');
    // recuperación: una sola vez, sin importar mayúsculas, guion o espacios
    const rec = recoveryCodes[0];
    ok(await login(client('admin'), { code: rec.toLowerCase().replace('-', ' ') }));
    ok(await login(client('admin'), { code: rec }), 401);
    ok(await login(client('admin'), { code: recoveryCodes[1] }));
    // tope: 10 intentos cada 15 minutos por cuenta (ya van 6); ni el código bueno entra mientras dura
    for (let i = 0; i < 4; i++) ok(await login(client('admin'), { code: '000000' }), 401);
    const bloqueado = await login(client('admin'), { code: '000000' });
    ok(bloqueado, 429); assert.ok(bloqueado.headers.get('retry-after'));
    await nuevoPaso();
    ok(await login(client('admin'), { code: codeNow() }), 429);
  });
  await step('juegos: crear, editar, ocultar y borrar', async () => {
    const c = await admin('POST', '/api/admin/games', { title: 'Smoketest Game', genres: ['Acción', 'Indie'], platforms: ['steam'], releaseYear: '2025', description: 'd', isNewRelease: true, newReleaseDate: '2025-05-05' }); ok(c);
    const id = c.body.game.id; assert.deepEqual([c.body.game.genre, c.body.game.releaseYear, c.body.game.isNewRelease, c.body.game.builtin], ['Acción', 2025, true, false]);
    assert.ok((await anon('GET', '/api/games')).body.games.some(g => g.id === id));
    const u = await admin('PUT', `/api/admin/games/${id}`, { title: 'Smoketest Game 2', hidden: true }); ok(u); assert.deepEqual([u.body.game.title, u.body.game.hidden], ['Smoketest Game 2', true]);
    assert.ok(!(await anon('GET', '/api/games')).body.games.some(g => g.id === id)); // oculto: no aparece en el sitio público
    assert.equal((await admin('POST', '/api/admin/games', { title: 'a' })).body.error, 'title_too_short');
    ok(await admin('PUT', '/api/admin/games/no-existe', { title: 'Hola' }), 404);
    ok(await admin('DELETE', `/api/admin/games/${id}`));
  });
  await step('personajes: crear con categorías y juegos, editar y borrar', async () => {
    const c = await admin('POST', '/api/admin/characters', { name: 'Smoketest Hero', gameIds: [gameId, otherGameId], categories: ['protagonist', 'villain', 'inventada'], description: 'desc' }); ok(c);
    const ch = c.body.character; assert.deepEqual([ch.gameIds, ch.categories, ch.gameId], [[gameId, otherGameId], ['protagonist', 'villain'], gameId]);
    const u = await admin('PUT', `/api/admin/characters/${ch.id}`, { categories: ['coprotagonist'], hidden: true }); assert.deepEqual([u.body.character.categories, u.body.character.hidden], [['coprotagonist'], true]);
    assert.ok(!(await anon('GET', '/api/characters')).body.characters.some(x => x.id === ch.id));
    ok(await admin('DELETE', `/api/admin/characters/${ch.id}`));
  });
  await step('fechas y noticias (límite de 180 caracteres, solo http/https)', async () => {
    const d = await admin('POST', '/api/admin/date-events', { month: 5, day: 5, titleEs: 'Prueba', titleEn: 'Test', descEs: 'd', descEn: 'd' }); ok(d);
    assert.deepEqual((await admin('PUT', `/api/admin/date-events/${d.body.dateEvent.id}`, { day: 6 })).body.dateEvent.day, 6);
    assert.equal((await admin('POST', '/api/admin/date-events', { month: 13, day: 1, titleEs: 'x', titleEn: 'y' })).body.error, 'invalid_date');
    ok(await admin('DELETE', `/api/admin/date-events/${d.body.dateEvent.id}`));
    const base = { title: 'Smoketest noticia', source: 'Test', url: 'https://example.com/x' };
    assert.equal((await admin('POST', '/api/admin/news', { ...base, summary: 'a'.repeat(181) })).body.error, 'summary_too_long');
    assert.equal((await admin('POST', '/api/admin/news', { ...base, url: 'javascript:alert(1)' })).body.error, 'invalid_url');
    const n = await admin('POST', '/api/admin/news', { ...base, summary: 'b'.repeat(180) }); ok(n);
    assert.equal((await admin('PUT', `/api/admin/news/${n.body.newsItem.id}`, { summary: 'c'.repeat(181) })).body.error, 'summary_too_long');
    assert.ok((await anon('GET', '/api/news')).body.news.some(x => x.id === n.body.newsItem.id));
    ok(await admin('DELETE', `/api/admin/news/${n.body.newsItem.id}`));
  });
  await step('buzón de sugerencias: listar, marcar como leída y borrar', async () => {
    const all = (await admin('GET', '/api/admin/suggestions')).body.suggestions.filter(s => s.title.startsWith('smoketest'));
    assert.equal(all.length, 2);
    const ch = all.find(s => s.kind === 'character'); assert.deepEqual([ch.relatedGame, ch.categories, ch.submittedBy], ['Hades', ['villain'], 'smoketest_a']);
    assert.equal((await admin('PUT', `/api/admin/suggestions/${ch.id}`, { status: 'read' })).body.suggestion.status, 'read');
    assert.equal((await admin('PUT', `/api/admin/suggestions/${ch.id}`, { status: 'x' })).body.error, 'invalid_status');
    for (const s of all) ok(await admin('DELETE', `/api/admin/suggestions/${s.id}`));
  });

  console.log('Imágenes subidas');
  const created = []; // URLs de imágenes que crea la prueba, para borrarlas al final
  await step('avatar y portada de admin: se guardan, se pueden descargar; formato y tamaño inválidos se rechazan', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const form = (buf, name, type = 'image/png') => { const f = new FormData(); f.append('image', new Blob([buf], { type }), name); return f; };
    const fetchable = async url => { const r = await fetch(url.startsWith('/') ? publicBase + url : url); return { status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }; };

    const av = await a('POST', '/api/profile/avatar', form(png, 'mi foto.PNG')); ok(av);
    const avUrl = av.body.user.avatarUrl; created.push(avUrl);
    assert.match(avUrl, /^(\/uploads\/[0-9a-f]{32}\.png|https:\/\/.+\.blob\.vercel-storage\.com\/uploads\/[0-9a-f]{32}\.png)$/, 'URL del avatar: ' + avUrl);
    assert.deepEqual(await fetchable(avUrl), { status: 200, type: 'image/png', size: png.length });
    assert.equal((await anon('GET', '/api/users/smoketest_a')).body.user.avatarUrl, avUrl);

    const up = await admin('POST', '/api/admin/upload', form(png, 'portada.jpg', 'image/jpeg')); ok(up);
    created.push(up.body.url); assert.match(up.body.url, /\/uploads\/[0-9a-f]{32}\.jpg$/);
    assert.equal((await fetchable(up.body.url)).status, 200);

    assert.equal((await a('POST', '/api/profile/avatar', form(Buffer.from('<script>alert(1)</script>'), 'x.html', 'text/html'))).body.error, 'invalid_file');
    assert.equal((await a('POST', '/api/profile/avatar', form(Buffer.alloc(4 * 1024 * 1024 + 1), 'enorme.png'))).body.error, 'upload_failed');
    ok(await a('POST', '/api/profile/avatar', new FormData()), 400); // sin archivo
    ok(await anon('POST', '/api/profile/avatar', form(png, 'x.png')), 401);
    ok(await aOnAdmin('POST', '/api/admin/upload', form(png, 'x.png')), 403); // usuario común en el dominio del dashboard
  });

  console.log('Archivos estáticos');
  await step('páginas: sus /js y /css llevan ?v=<hash> y cada archivo existe (así el caché de un año es seguro)', async () => {
    const pub = client();
    for (const route of ['/', '/explorar', '/terminos', '/privacidad', '/creditos', '/restablecer', '/esta-pagina-no-existe']) {
      const page = await pub('GET', route);
      const refs = [...page.text.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"]+)"/g)].map(m => m[1]);
      assert.ok(refs.length >= 3, route + ' carga scripts y estilos');
      for (const ref of refs) { assert.match(ref, /\?v=[0-9a-f]{10}$/, route + ' ' + ref); ok(await pub('GET', ref), 200); }
    }
  });

  console.log('Dominios y límite de intentos');
  await step('dominios: el panel solo existe en el dominio del dashboard y el sitio solo en el público', async () => {
    const pub = client(), adm = client('admin');
    // dominio público: sin panel (ni siquiera con sesión de admin)
    for (const route of ['/admin', '/admin/assets/admin.css', '/api/admin/games']) ok(await pub('GET', route), 404);
    ok(await pub('GET', '/'), 200); ok(await pub('GET', '/api/games'), 200);
    const noExiste = await pub('GET', '/esta-pagina-no-existe'); ok(noExiste, 404); assert.ok(noExiste.text.includes('data-lang="en"') && noExiste.text.includes('Página no encontrada'), 'la página de "no existe" es la del sitio, no el error pelado');
    const fav = await pub('GET', '/favicon.ico'); ok(fav, 301); assert.equal(fav.headers.get('location'), '/img/favicon-32.png');
    for (const route of ['/terminos', '/privacidad', '/creditos']) { const legal = await pub('GET', route); ok(legal, 200); assert.ok(legal.text.includes('data-lang="en"'), route + ' trae las dos versiones de idioma'); }
    for (const route of ['/', '/terminos', '/privacidad']) assert.ok((await pub('GET', route)).text.includes('href="/creditos"'), route + ' enlaza a Créditos');
    const home = (await pub('GET', '/')).text;
    assert.ok(home.includes('class="navbtn" data-view="browse" href="/explorar"') && home.includes('class="footer-link" data-view="shelf" href="/mi-estanteria"'), 'el menú y el pie son enlaces de verdad (clic derecho -> abrir en pestaña nueva)');
    // dominio del dashboard: solo panel y login
    const root = await adm('GET', '/'); ok(root, 302); assert.equal(root.headers.get('location'), '/admin');
    const page = await adm('GET', '/admin'); ok(page); assert.ok(page.text.includes('/admin/assets/js/'), 'el HTML del panel carga sus scripts desde /admin/assets');
    const css = await adm('GET', '/admin/assets/admin.css'); ok(css); assert.ok(css.text.length > 500);
    assert.ok((await adm('GET', '/admin/assets/js/02-views-login-and-api.js')).text.includes('apiPost'));
    ok(await adm('GET', '/api/auth/me'), 200);
    for (const route of ['/explorar', '/api/games', '/api/reviews', '/api/image-proxy', '/juego/x', '/terminos', '/privacidad', '/creditos', '/restablecer']) ok(await adm('GET', route), 404);
    ok(await adm('POST', '/api/auth/forgot', { email: 'x@example.com' }), 404);
    ok(await adm('POST', '/api/auth/register', { acceptTerms: true, email: 'x@example.com', password: pass, username: 'smoketest_zz' }), 404);
    // los archivos del panel no están en public/: tampoco salen por el CDN del sitio público
    for (const f of ['/admin.html', '/css/admin.css', '/admin-js/01-state-and-icons.js']) assert.notEqual((await pub('GET', f)).status, 200, f);
  });
  await step('límite de intentos: el 9.º login fallido seguido devuelve 429 con Retry-After, y el contador se comparte', async () => {
    const x = client();
    for (let i = 1; i <= 8; i++) ok(await x('POST', '/api/auth/login', { identifier: 'smoketest_a', password: 'mala' + i + 'xxxx' }), 401);
    const blocked = await x('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass }); // aunque sea la clave correcta
    ok(blocked, 429); assert.ok(Number(blocked.headers.get('retry-after')) > 0); assert.equal(blocked.body.error, 'too_many_requests');
    if (!REMOTE) { // otro cliente (otra IP) no se ve afectado; en remoto todos comparten tu IP
      ok(await client()('POST', '/api/auth/login', { identifier: 'smoketest_a', password: pass }));
    }
  });

  // limpieza (las imágenes: archivo local o blob, según el modo)
  for (const url of created) {
    if (url.startsWith('/uploads/')) fs.rmSync(path.join(uploadsDir, path.basename(url)), { force: true });
    else await del(url);
  }
  await db.prepare("DELETE FROM rate_limits WHERE key LIKE '%10.9.0.%'" + (REMOTE ? ' OR true' : '')).run();
  await db.prepare("DELETE FROM users WHERE username LIKE 'smoketest\\_%' ESCAPE '\\'").run();
  await db.prepare("DELETE FROM game_suggestions WHERE title LIKE 'smoketest%'").run();
  const left = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'smoketest%'").get();
  assert.equal(left.n, 0);

  console.log(`\n${passed} pasos bien, ${failed} con fallas`);
  if (server) server.close();
  await db.close();
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error('Error inesperado:', e); if (server) server.close(); await db.close().catch(() => {}); process.exit(1); });
