// Service worker de DLCritic. Hace UNA cosa: si al abrir o recargar una página del sitio no hay conexión, muestra la pantalla «sin conexión» (public/offline.html) en vez
// de la pantalla de error del navegador. No guarda nada más (ni páginas, ni scripts, ni datos): todo lo demás pasa directo a la red, así nunca se ve una versión vieja del
// sitio. Lo registra public/js/16-init.js. Si cambias offline.html, sube el número de CACHE para que los dispositivos la actualicen.
const CACHE = 'dlcritic-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  // cache: 'reload' para no guardar una copia vieja que venga del caché HTTP del navegador
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('dlcritic-offline-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return; // solo las páginas: imágenes, scripts y la API siguen su camino normal
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
});
