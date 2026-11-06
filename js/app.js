import { applyTheme } from './settings.js';

export const APP_VERSION = '2026.11.06-j (voz argentina)';
import { h } from './ui.js';

applyTheme();

const routes = {
  hoy: { tab: 'hoy', load: () => import('./screens/hoy.js') },
  sombra: { tab: 'practicar', load: () => import('./screens/sombra.js') },
  vos: { tab: 'practicar', load: () => import('./screens/vos.js') },
  leer: { tab: 'leer', load: () => import('./screens/leer.js') },
  mazo: { tab: 'mazo', load: () => import('./screens/mazo.js') },
  perfil: { tab: 'perfil', load: () => import('./screens/perfil.js') },
};

const main = document.getElementById('screen');
let cleanup = null;
let renderId = 0;

async function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'hoy').split('?')[0];
  const r = routes[name] || routes.hoy;
  const id = ++renderId;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  main.replaceChildren();
  try {
    const mod = await r.load();
    if (id !== renderId) return;
    const c = await mod.render(main);
    if (id !== renderId) { if (c) c(); return; }
    cleanup = c || null;
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('section', { class: 'card' }, h('h2', {}, 'Algo salió mal'), h('p', { class: 'muted small' }, String(err && err.message || err))));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('cadencia:rerender', route);
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  // When a new version takes over, reload once so the new code runs.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
