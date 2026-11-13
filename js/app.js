import { applyTheme } from './settings.js';

export const APP_VERSION = '2026.11.13-f (Penumbra: nuevo look)';
import { h } from './ui.js';

applyTheme();

const routes = {
  hoy: { tab: 'hoy', load: () => import('./screens/hoy.js') },
  sombra: { tab: 'practicar', load: () => import('./screens/sombra.js') },
  vos: { tab: 'practicar', load: () => import('./screens/vos.js') },
  charla: { tab: 'practicar', load: () => import('./screens/charla.js') },
  escribir: { tab: 'practicar', load: () => import('./screens/escribir.js') },
  diario: { tab: 'practicar', load: () => import('./screens/diario.js') },
  oido: { tab: 'practicar', load: () => import('./screens/oido.js') },
  trabalenguas: { tab: 'practicar', load: () => import('./screens/trabalenguas.js') },
  elision: { tab: 'practicar', load: () => import('./screens/elision.js') },
  cognados: { tab: 'practicar', load: () => import('./screens/cognados.js') },
  cultura: { tab: 'hoy', load: () => import('./screens/cultura.js') },
  calentamiento: { tab: 'hoy', load: () => import('./screens/calentamiento.js') },
  progreso: { tab: 'hoy', load: () => import('./screens/progreso.js') },
  leer: { tab: 'leer', load: () => import('./screens/leer.js') },
  lunfardo: { tab: 'leer', load: () => import('./screens/lunfardo.js') },
  podcast: { tab: 'leer', load: () => import('./screens/podcast.js') },
  canciones: { tab: 'leer', load: () => import('./screens/canciones.js') },
  ipa: { tab: 'leer', load: () => import('./screens/ipa.js') },
  libros: { tab: 'leer', load: () => import('./screens/libros.js') },
  recetas: { tab: 'leer', load: () => import('./screens/recetario.js') },
  repaso: { tab: 'repaso', load: () => import('./screens/repaso.js') },
  sesion: { tab: 'repaso', load: () => import('./screens/sesion.js') },
  tarjeta: { tab: 'repaso', load: () => import('./screens/tarjeta.js') },
  boveda: { tab: 'repaso', load: () => import('./screens/boveda.js') },
  vista: { tab: 'repaso', load: () => import('./screens/vista.js') },
  crucigrama: { tab: 'repaso', load: () => import('./screens/crucigrama.js') },
  estadisticas: { tab: 'repaso', load: () => import('./screens/estadisticas.js') },
  mazo: { tab: 'repaso', load: () => import('./screens/mazo.js') },
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
