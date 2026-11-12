/* Service worker: deja la app disponible sin internet.
   Cambia el número de VERSION cada vez que subas una versión nueva. */
const VERSION = 'rr-v1';
const SHELL = ['./', 'index.html', 'config.js', 'sync.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'assets/fonts/Fredoka-Medium.ttf', 'assets/fonts/Fredoka-Bold.ttf',
  'assets/fonts/Creepster-Regular.ttf', 'assets/fonts/Caveat-SemiBold.ttf',
  'assets/recuerdo1.jpg', 'assets/recuerdo2.jpg', 'assets/recuerdo3.jpg',
  'assets/recuerdo4.jpg', 'assets/recuerdo5.jpg', 'assets/final.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => 0))))   // los que no existan se ignoran
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== location.origin) return;          // Supabase y demás: directo a internet
  e.respondWith(fetch(r).then(res => {                              // primero internet, si no hay: lo guardado
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
