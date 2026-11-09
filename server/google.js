// Inicio de sesión con Google (OpenID Connect, flujo de código de autorización). Sin dependencias: dos pedidos a Google y nada más.
//
//   1. /api/auth/google/start manda a la persona a Google con un `state` y un `nonce` aleatorios, guardados en una cookie propia (httpOnly, 10 minutos).
//   2. Google vuelve a /api/auth/google/callback con un `code`; el servidor lo canjea (con el secreto del cliente) por un id_token.
//   3. Se validan sus datos: emisor, audiencia (nuestro client id), vencimiento, nonce y que el correo esté verificado por Google.
//
// El id_token llega directo desde el endpoint de tokens de Google por una conexión TLS que nosotros iniciamos: en ese caso OpenID Connect (Core, 3.1.3.7) permite
// confiar en TLS en lugar de comprobar la firma del JWT, así que no hace falta descargar las claves de Google ni una librería.
//
// Variables de entorno: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (las dos; sin ellas el botón no aparece). La dirección de vuelta que hay que registrar en Google es
// `${PUBLIC_URL}/api/auth/google/callback`. GOOGLE_AUTH_URL y GOOGLE_TOKEN_URL solo se leen fuera de producción (las usa la prueba de humo con un Google falso).
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const urls = () => (process.env.NODE_ENV === 'production'
  ? { auth: AUTH_URL, token: TOKEN_URL }
  : { auth: process.env.GOOGLE_AUTH_URL || AUTH_URL, token: process.env.GOOGLE_TOKEN_URL || TOKEN_URL });

function authorizeUrl({ redirectUri, state, nonce }) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
    state, nonce, prompt: 'select_account',
  });
  return `${urls().auth}?${q}`;
}

// Los datos de la persona (sub, email, emailVerified, name) a partir del código, o lanza un Error con el motivo (nunca se imprime el código ni el token).
async function exchangeCode({ code, redirectUri, nonce }) {
  const res = await fetch(urls().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google respondió ${res.status} al canjear el código`);
  const { id_token: idToken } = await res.json();
  return claimsOf(idToken, nonce);
}

// Decodifica el id_token (ya recibido directo de Google) y comprueba sus datos.
function claimsOf(idToken, nonce) {
  const part = typeof idToken === 'string' ? idToken.split('.')[1] : null;
  if (!part) throw new Error('El id_token de Google no tiene el formato esperado');
  const c = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  if (!ISSUERS.has(c.iss)) throw new Error('Emisor inesperado en el id_token');
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('El id_token no es para este cliente');
  if (!(Number(c.exp) * 1000 > Date.now())) throw new Error('El id_token venció');
  if (!nonce || c.nonce !== nonce) throw new Error('El nonce del id_token no coincide');
  if (typeof c.sub !== 'string' || !c.sub || typeof c.email !== 'string' || !c.email) throw new Error('Al id_token le faltan datos');
  return { sub: c.sub, email: c.email.toLowerCase(), emailVerified: c.email_verified === true || c.email_verified === 'true', name: typeof c.name === 'string' ? c.name : '' };
}

module.exports = { configured, authorizeUrl, exchangeCode, claimsOf };
