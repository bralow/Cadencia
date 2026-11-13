// La Bóveda (FE-19): cards you kept failing, out of the daily schedule until you fix and re-integrate them.
import { h, toast } from '../ui.js';
import { db } from '../db.js';
import { TYPES, updateCard, settings } from '../penumbra.js';

const fresh = (c) => ({ ...c, suspended: null, state: 'new', reps: 0, lapses: 0, passStreak: 0, due: undefined, s: undefined, d: undefined, last: undefined, step: 0 });

export async function render(main) {
  const rerender = () => window.dispatchEvent(new Event('cadencia:rerender'));
  const leeches = (await db.all('cards')).filter((c) => c.suspended === 'leech').sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
  const decks = new Map((await db.all('decks')).map((d) => [d.id, d.name]));
  const back = h('a', { href: '#/repaso', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, '← Repaso');
  main.append(h('div', { class: 'between' }, back), h('h1', {}, 'Bóveda'),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, `Acá van las tarjetas que fallaste ${settings().leech} veces. No aparecen en el repaso diario. Muchas veces el problema es la tarjeta: mejorala (otra frase de ejemplo, una foto, una nota) y reintegrala; vuelve como nueva.`));
  if (!leeches.length) { main.append(h('section', { class: 'card' }, h('p', {}, 'La bóveda está vacía. 🎉'))); return () => {}; }

  const study = h('a', { href: '#/sesion?modo=practica&set=boveda&n=50', class: 'btn' }, `Estudiar la bóveda (${leeches.length})`);
  const all = h('button', { type: 'button', class: 'btn ghost' }, 'Reintegrar todas');
  all.onclick = async () => { if (!window.confirm(`¿Reintegrar las ${leeches.length} tarjetas? Vuelven como nuevas.`)) return; for (const c of leeches) await updateCard(fresh(c)); toast('Reintegradas'); rerender(); };
  main.append(h('section', { class: 'hero', style: 'gap:10px' }, h('span', { class: 'kicker' }, `EN LA BÓVEDA · ${leeches.length}`),
    h('p', { class: 'small' }, 'Estudialas con la frase de ejemplo y la nota a la vista. No cambia ninguna fecha; al final podés reintegrar las que acertaste.'), study), all);

  for (const c of leeches) {
    const edit = h('a', { href: `#/tarjeta?note=${encodeURIComponent(c.note)}`, class: 'pill', style: 'min-height:34px;font-size:12px;display:inline-flex;align-items:center;text-decoration:none' }, 'Mejorar');
    const re = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Reintegrar');
    re.onclick = async () => { await updateCard(fresh(c)); toast('Vuelve como nueva'); rerender(); };
    main.append(h('div', { class: 'card', style: 'gap:4px;padding:10px 12px' },
      h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('b', { style: 'flex:1;min-width:0' }, c.front), h('span', { class: 'row', style: 'gap:6px' }, edit, re)),
      c.meaning ? h('span', { class: 'small' }, c.meaning) : '',
      h('span', { class: 'muted small' }, `${TYPES[c.type]} · ${decks.get(c.deck) || ''} · ${c.lapses || 0} fallas`)));
  }
  return () => {};
}
