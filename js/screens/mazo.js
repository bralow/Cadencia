import { h, iconEl, toast } from '../ui.js';
import { db } from '../db.js';
import { Player } from '../audio.js';

export async function render(main) {
  main.append(h('div', { style: 'display:flex;flex-direction:column;gap:4px' },
    h('h1', {}, 'Mazo'), h('p', { class: 'muted small' }, 'Lo que guardaste, listo para Anki.')));

  const items = (await db.all('mazo')).sort((a, b) => b.created - a.created);
  const player = new Player();

  if (!items.length) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Tu mazo está vacío'),
      h('p', { class: 'muted small' }, 'Tocá “Guardar” en Sombra o en la frase del día y aparece acá.')));
    return () => {};
  }

  const tags = ['Todo', ...new Set(items.map((i) => i.tag))];
  let filter = 'Todo';
  const tagBtns = tags.map((t) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(t === filter), style: 'min-height:40px;font-size:12px' }, t));
  const list = h('div', { class: 'list' });
  tagBtns.forEach((b, i) => { b.onclick = () => { filter = tags[i]; tagBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  main.append(h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Filtrar por etiqueta', style: 'gap:6px' }, tagBtns), list);

  const footer = h('section', { class: 'card', style: 'flex-direction:row;align-items:center;justify-content:space-between' },
    h('div', {}, h('div', { style: 'font-weight:700' }, `${items.length} tarjetas`), h('div', { class: 'muted small' }, 'Exportar a AnkiDroid llega en la próxima entrega')),
    h('button', { type: 'button', class: 'btn', disabled: true }, 'Exportar .apkg'));
  main.append(footer);

  function draw() {
    list.replaceChildren(...items.filter((i) => filter === 'Todo' || i.tag === filter).map((it) => {
      const play = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Escuchar', disabled: !it.audio }, iconEl('play'));
      play.onclick = () => { player.load(it.audio); player.play(); };
      const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Borrar tarjeta' }, iconEl('trash'));
      del.onclick = async () => { await db.remove('mazo', it.id); items.splice(items.indexOf(it), 1); toast('Tarjeta borrada'); draw(); };
      return h('div', { class: 'card item', style: 'padding:12px 10px 12px 14px;flex-direction:row' },
        h('div', { style: 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0' },
          h('span', { style: 'font-family:var(--display);font-size:17px;font-weight:600;line-height:1.25', lang: 'es-AR' }, it.front),
          it.ipa ? h('span', { class: 'ipa', style: 'font-size:13px' }, it.ipa) : null,
          it.back ? h('span', { class: 'muted small' }, it.back) : null,
          h('span', { class: 'chip', style: 'align-self:flex-start;margin-top:2px' }, it.tag)),
        h('div', { style: 'display:flex;flex-direction:column' }, play, del));
    }));
  }
  draw();
  return () => player.load(null);
}
