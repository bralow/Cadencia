// Full-screen card editor: #/tarjeta?note=<id>  or  #/tarjeta?new=1&deck=<deckId>
import { h } from '../ui.js';
import { buildEditor } from '../editor.js';

export async function render(main) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const note = q.get('note');
  const back = () => { if (history.length > 1) history.back(); else location.hash = '#/repaso'; };
  main.append(h('div', { class: 'between' }, h('h1', {}, note ? 'Editar tarjeta' : 'Nueva tarjeta')));
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  main.append(body);
  let cleanup = await buildEditor(body, {
    note, deckId: q.get('deck'),
    onDone: (r) => { if (r && r.open) location.hash = `#/tarjeta?note=${encodeURIComponent(r.open)}`; else back(); },
  });
  return () => cleanup && cleanup();
}
