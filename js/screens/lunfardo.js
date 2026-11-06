import { h, iconEl, toast } from '../ui.js';
import { readTabs } from './leer.js';
import { LUNFARDO, REGISTER, KIND } from '../lunfardo.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { speak, stopSpeaking } from '../tts.js';

const FILTERS = [['todo', 'Todo'], ['vesre', 'Vesre'], ['calle', 'Calle'], ['arg', 'Argentinismos']];
let filter = 'todo', query = '';
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function meter(reg) {
  return h('span', { class: 'row', style: 'gap:6px', 'aria-label': `Registro: ${REGISTER[reg]}` },
    h('span', { style: 'display:inline-flex;gap:2px', 'aria-hidden': 'true' },
      [1, 2, 3].map((n) => h('i', { style: `display:inline-block;width:14px;height:6px;border-radius:3px;background:${n <= reg ? (reg === 3 ? 'var(--accent)' : 'var(--sel)') : 'var(--chip)'}` }))),
    h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, REGISTER[reg]));
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('lunfardo')));
  main.append(h('p', { class: 'muted small' }, `${LUNFARDO.length} palabras del habla porteña: lunfardo, vesre (sílabas al revés) y palabras de todos los días.`));

  const search = h('input', { type: 'search', placeholder: 'Buscar en español o inglés…', 'aria-label': 'Buscar', value: query, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    style: 'min-height:48px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:16px;width:100%' });
  const chips = FILTERS.map(([k, label]) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === filter), style: 'min-height:40px;font-size:12px' }, label));
  const list = h('div', { class: 'list' });
  const count = h('p', { class: 'muted small', 'aria-live': 'polite' });
  main.append(search, h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Filtrar', style: 'gap:6px' }, chips), count, list);

  chips.forEach((b, i) => { b.onclick = () => { filter = FILTERS[i][0]; chips.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  search.oninput = () => { query = search.value; draw(); };

  function matches(e) {
    if (filter === 'vesre' && e.kind !== 'vesre') return false;
    if (filter === 'calle' && e.reg !== 3) return false;
    if (filter === 'arg' && e.kind !== 'argentinismo') return false;
    if (!query.trim()) return true;
    const q = fold(query.trim());
    return [e.w, e.es, e.en, e.ej].some((t) => fold(t).includes(q));
  }

  function card(e) {
    const listen = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Escuchar ${e.w}` }, iconEl('play'));
    listen.onclick = () => speak(e.w);
    const save = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Guardar en Mazo');
    save.onclick = async () => {
      await db.put('mazo', { front: e.w, ipa: transcribe(e.w), back: `${e.es} (${e.en}) · ${e.ej}`, tag: '#Lunfardo', created: Date.now() });
      toast('Guardado en el Mazo');
    };
    return h('article', { class: 'card', style: 'gap:8px' },
      h('div', { class: 'between', style: 'align-items:flex-start' },
        h('div', { style: 'display:flex;flex-direction:column;gap:2px' },
          h('h2', { style: 'font-size:24px', lang: 'es-AR' }, e.w),
          h('span', { class: 'ipa', style: 'font-size:14px' }, transcribe(e.w))),
        listen),
      h('div', { class: 'row wrap', style: 'gap:10px' }, meter(e.reg), h('span', { class: 'chip' }, KIND[e.kind])),
      h('p', { style: 'font-size:15px;line-height:1.4' }, e.es, ' ', h('span', { class: 'muted' }, `· ${e.en}`)),
      h('p', { style: 'font-size:15px;font-style:italic;line-height:1.4', lang: 'es-AR' }, e.ej),
      h('p', { class: 'muted small' }, e.orig),
      save);
  }

  function draw() {
    const shown = LUNFARDO.filter(matches).sort((a, b) => a.w.localeCompare(b.w, 'es'));
    count.textContent = shown.length === LUNFARDO.length ? '' : `${shown.length} resultado${shown.length === 1 ? '' : 's'}`;
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'muted small' }, 'No encontré esa palabra.')]));
  }
  draw();
  return () => stopSpeaking();
}
