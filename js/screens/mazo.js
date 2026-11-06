import { h, iconEl, toast } from '../ui.js';
import { db } from '../db.js';
import { Player } from '../audio.js';
import { buildApkg } from '../anki.js';

export async function render(main) {
  main.append(h('div', { style: 'display:flex;flex-direction:column;gap:4px' },
    h('h1', {}, 'Mazo'), h('p', { class: 'muted small' }, 'Lo que guardaste, listo para Anki.')));

  const items = (await db.all('mazo')).sort((a, b) => b.created - a.created);
  const player = new Player();

  if (!items.length) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Tu mazo está vacío'),
      h('p', { class: 'muted small' }, 'Tocá “Guardar” en Sombra, Vos, Leer o la frase del día y aparece acá.')));
    return () => {};
  }

  const off = new Set(); // ids left out of the export
  const tags = ['Todo', ...new Set(items.map((i) => i.tag))];
  let filter = 'Todo';
  const tagBtns = tags.map((t) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(t === filter), style: 'min-height:40px;font-size:12px' }, t));
  const list = h('div', { class: 'list' });
  tagBtns.forEach((b, i) => { b.onclick = () => { filter = tags[i]; tagBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  main.append(h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Filtrar por etiqueta', style: 'gap:6px' }, tagBtns), list);

  const countLabel = h('div', { style: 'font-weight:700' });
  const exportBtn = h('button', { type: 'button', class: 'btn' }, 'Exportar .apkg');
  main.append(h('section', { class: 'card', style: 'flex-direction:row;align-items:center;justify-content:space-between;position:sticky;bottom:calc(env(safe-area-inset-bottom) + 84px)' },
    h('div', {}, countLabel, h('div', { class: 'muted small' }, 'Se abre en AnkiDroid')), exportBtn));

  const visible = () => items.filter((i) => filter === 'Todo' || i.tag === filter);
  const selected = () => visible().filter((i) => !off.has(i.id));
  const updateCount = () => { const n = selected().length; countLabel.textContent = n === 1 ? '1 tarjeta' : `${n} tarjetas`; exportBtn.disabled = !n; };

  function draw() {
    list.replaceChildren(...visible().map((it) => {
      const cb = h('input', { type: 'checkbox', id: `c${it.id}`, style: 'width:22px;height:22px;margin:3px 0 0;accent-color:var(--accent);flex:none' });
      cb.checked = !off.has(it.id);
      cb.onchange = () => { if (cb.checked) off.delete(it.id); else off.add(it.id); updateCount(); };
      const play = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Escuchar', disabled: !it.audio }, iconEl('play'));
      play.onclick = () => { player.load(it.audio); player.play(); };
      const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Borrar tarjeta' }, iconEl('trash'));
      del.onclick = async () => { await db.remove('mazo', it.id); items.splice(items.indexOf(it), 1); toast('Tarjeta borrada'); draw(); };
      return h('div', { class: 'card item', style: 'padding:12px 6px 12px 14px;flex-direction:row' },
        cb,
        h('label', { for: `c${it.id}`, style: 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0' },
          h('span', { style: 'font-family:var(--display);font-size:17px;font-weight:600;line-height:1.25', lang: 'es-AR' }, it.front),
          it.ipa ? h('span', { class: 'ipa', style: 'font-size:13px' }, it.ipa) : null,
          it.back ? h('span', { class: 'muted small' }, it.back) : null,
          h('span', { class: 'chip', style: 'align-self:flex-start;margin-top:2px' }, it.tag)),
        h('div', { style: 'display:flex;flex-direction:column' }, play, del));
    }));
    updateCount();
  }

  exportBtn.onclick = async () => {
    const chosen = selected();
    if (!chosen.length) return;
    exportBtn.disabled = true; exportBtn.textContent = 'Armando…';
    try {
      const blob = await buildApkg(chosen);
      const name = `cadencia-${new Date().toISOString().slice(0, 10)}.apkg`;
      const file = new File([blob], name, { type: 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Cadencia → Anki' }); toast('Elegí AnkiDroid para importarlo'); }
        catch (e) { if (e.name !== 'AbortError') download(blob, name); }
      } else download(blob, name);
    } catch (err) {
      toast('No se pudo exportar: ' + (err.message || err));
    }
    exportBtn.textContent = 'Exportar .apkg'; updateCount();
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Descargado: abrilo con AnkiDroid');
  }

  draw();
  return () => player.load(null);
}
