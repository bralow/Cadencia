// Offline support with all-or-nothing updates.
// Each release has its own cache, filled at install time with every app file fetched fresh
// (cache-busting query, so GitHub's CDN can't hand back a stale copy). The app then runs
// entirely from that snapshot, so old and new files can never mix. When sw.js changes,
// the browser installs the new snapshot, swaps it in, and the page reloads once.
const VERSION = '2026.11.13-d';
const CACHE = 'cadencia-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/settings.js', 'js/db.js', 'js/ipa.js', 'js/audio.js', 'js/waveform.js', 'js/clippack.js', 'js/vosdata.js', 'js/anki.js', 'js/tts.js', 'js/pitch.js', 'js/dtw.js', 'js/pairsdata.js', 'js/screens/oido.js', 'js/lunfardo.js', 'js/screens/lunfardo.js', 'js/trabadata.js', 'js/screens/trabalenguas.js', 'js/screens/elision.js', 'js/screens/calentamiento.js', 'js/ipadata.js', 'js/screens/ipa.js', 'js/podcast.js', 'js/screens/podcast.js', 'js/screens/canciones.js', 'js/fsrs.js', 'js/penumbra.js', 'js/cardtools.js', 'js/editor.js', 'js/imgedit.js', 'js/audedit.js', 'js/hotkeys.js', 'js/screens/tarjeta.js', 'js/screens/repaso.js', 'js/screens/sesion.js', 'js/boca.js', 'js/transform.js', 'js/wordpanel.js', 'js/book.js', 'js/fixtext.js', 'js/traducir.js', 'js/vosfix.js', 'js/cognates.js', 'js/screens/libros.js', 'js/screens/cognados.js', 'js/recetas.js', 'js/screens/recetario.js', 'js/progress.js', 'js/gemini.js', 'js/charla.js', 'js/live.js', 'js/pcm.js', 'js/florvoz.js', 'js/voz.js', 'js/screens/charla.js', 'js/escribir.js', 'js/screens/escribir.js', 'js/reviewview.js', 'js/diario.js', 'js/screens/diario.js', 'js/culturadata.js', 'js/screens/cultura.js', 'js/screens/progreso.js',
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
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'cadencia-fonts' && k !== 'cadencia-vendor').map((k) => caches.delete(k))))
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
  // Big, rarely-changing libraries (PDF reader): cache once, outside the per-release snapshot.
  if (url.pathname.includes('/vendor/pdfjs/')) {
    e.respondWith(caches.open('cadencia-vendor').then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : null);
    return hit || fetch(req);
  })());
});
