// Offline support with all-or-nothing updates.
// Each release has its own cache, filled at install time with every app file fetched fresh
// (cache-busting query, so GitHub's CDN can't hand back a stale copy). The app then runs
// entirely from that snapshot, so old and new files can never mix. When sw.js changes,
// the browser installs the new snapshot, swaps it in, and the page reloads once.
const VERSION = '2026.11.06-j';
const CACHE = 'cadencia-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/settings.js', 'js/db.js', 'js/ipa.js', 'js/audio.js', 'js/waveform.js', 'js/clippack.js', 'js/vosdata.js', 'js/anki.js', 'js/tts.js',
  'js/screens/hoy.js', 'js/screens/sombra.js', 'js/screens/vos.js', 'js/screens/leer.js', 'js/screens/mazo.js', 'js/screens/perfil.js',
  'vendor/sqljs/sql-wasm.js', 'vendor/sqljs/sql-wasm.wasm',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (u) => {
      const res = await fetch(`${u}${u.includes('?') ? '&' : '?'}v=${VERSION}`, { cache: 'reload' });
      if (!res.ok) throw new Error(`${u}: ${res.status}`);
      await cache.put(u, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'cadencia-fonts').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('cadencia-fonts').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : null);
    return hit || fetch(req);
  })());
});
